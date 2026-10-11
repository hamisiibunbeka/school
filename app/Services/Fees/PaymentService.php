<?php

namespace App\Services\Fees;

use App\Models\Account;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\Student;
use App\Services\Accounting\LedgerService;
use App\Services\AuditLogger;
use App\Services\DocumentNumber;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Fee receipting: records payments, allocates them to invoices and posts them.
 *
 * Posting rule (receive): Dr deposit account (cash 1100 / bank 1210 / mobile money 1250 / cheque & card 1200, or user-chosen)
 *                         Cr 1300 Student Fees Receivable (full amount — any excess is a credit balance on the student)
 * Posting rule (void):    mirror-image reversal journal; allocations removed and invoice balances restored.
 * Allocation: user-chosen invoices first, then the student's oldest open invoices (by due date); the rest stays `unallocated`
 * and is applied automatically when a later invoice is issued.
 */
class PaymentService
{
    public function __construct(protected LedgerService $ledger, protected FeeAccounts $accounts) {}

    /**
     * @param  array{student_id:int, amount:string|int|float, method:string, payment_date:string, reference?:?string, payer_name?:?string, deposit_account_id?:?int, notes?:?string, allocations?: array<int, array{invoice_id:int, amount:string|int|float}>|null}  $data
     */
    public function receive(array $data, bool $audit = true): Payment
    {
        $amount = bcadd((string) $data['amount'], '0', 2);
        if (bccomp($amount, '0', 2) <= 0) {
            throw ValidationException::withMessages(['amount' => 'The amount must be greater than zero.']);
        }

        $method = $data['method'];
        if (! in_array($method, Payment::METHODS, true)) {
            throw ValidationException::withMessages(['method' => 'Choose a valid payment method.']);
        }

        $reference = isset($data['reference']) && trim((string) $data['reference']) !== '' ? trim((string) $data['reference']) : null;
        $this->assertUniqueReference($method, $reference);

        $depositId = $data['deposit_account_id'] ?? null;
        if ($depositId) {
            $valid = Account::postable()->cashOrBank()->whereKey($depositId)->exists();
            if (! $valid) {
                throw ValidationException::withMessages(['deposit_account_id' => 'Choose a cash, bank or mobile-money account.']);
            }
        } else {
            $depositId = $this->accounts->depositFor($method);
        }

        $student = Student::findOrFail($data['student_id']);

        return DB::transaction(function () use ($data, $amount, $method, $reference, $depositId, $student, $audit) {
            $payment = Payment::create([
                'receipt_no' => DocumentNumber::next('receipt'),
                'student_id' => $student->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'unallocated' => $amount,
                'method' => $method,
                'reference' => $reference,
                'payer_name' => $data['payer_name'] ?? null,
                'deposit_account_id' => $depositId,
                'notes' => isset($data['notes']) ? mb_substr((string) $data['notes'], 0, 255) : null,
                'status' => 'posted',
                'received_by' => auth()->id(),
            ]);

            $label = str_replace('_', ' ', $method);
            $journal = $this->ledger->record([
                'date' => $payment->payment_date->toDateString(),
                'type' => 'receipt',
                'reference' => $payment->receipt_no,
                'narration' => "Fee receipt {$payment->receipt_no} — {$student->full_name} ({$student->admission_no}) via {$label}".($reference ? " ref {$reference}" : ''),
            ], [
                ['account_id' => $depositId, 'debit' => $amount, 'narration' => 'Fees received'],
                ['account_id' => $this->accounts->receivable(), 'credit' => $amount, 'narration' => 'Student fees receivable'],
            ], $payment);

            $payment->forceFill(['journal_id' => $journal->id])->save();

            $this->allocate($payment, $data['allocations'] ?? null);

            if ($audit) {
                AuditLogger::log('created', $payment, "Received {$amount} from {$student->full_name} (receipt {$payment->receipt_no})", module: 'fees');
            }

            return $payment->fresh();
        });
    }

    /**
     * Allocate the unallocated part of a payment: explicit allocations first, then oldest open invoices.
     *
     * @param  array<int, array{invoice_id:int, amount:string|int|float}>|null  $manual
     */
    public function allocate(Payment $payment, ?array $manual = null): Payment
    {
        return DB::transaction(function () use ($payment, $manual) {
            $remaining = bcadd((string) $payment->unallocated, '0', 2);

            foreach ($manual ?? [] as $row) {
                $want = bcadd((string) ($row['amount'] ?? '0'), '0', 2);
                if (bccomp($want, '0', 2) <= 0 || bccomp($remaining, '0', 2) <= 0) {
                    continue;
                }

                $invoice = Invoice::where('student_id', $payment->student_id)->open()->lockForUpdate()->find($row['invoice_id']);
                if (! $invoice) {
                    throw ValidationException::withMessages(['allocations' => 'One of the selected invoices is not open for this student.']);
                }

                $take = $this->min([$want, $remaining, (string) $invoice->balance]);
                $this->apply($payment, $invoice, $take);
                $remaining = bcsub($remaining, $take, 2);
            }

            if (bccomp($remaining, '0', 2) > 0) {
                $open = Invoice::where('student_id', $payment->student_id)->open()
                    ->orderByRaw('COALESCE(due_date, issue_date)')->orderBy('issue_date')->orderBy('id')
                    ->lockForUpdate()->get();

                foreach ($open as $invoice) {
                    if (bccomp($remaining, '0', 2) <= 0) {
                        break;
                    }
                    $take = $this->min([$remaining, (string) $invoice->balance]);
                    $this->apply($payment, $invoice, $take);
                    $remaining = bcsub($remaining, $take, 2);
                }
            }

            $payment->forceFill(['unallocated' => $remaining])->save();

            return $payment;
        });
    }

    /** Apply any credit balances (unallocated receipts) of a student to their open invoices. */
    public function applyCredits(Student $student): void
    {
        $credits = Payment::posted()->where('student_id', $student->id)->where('unallocated', '>', 0)
            ->orderBy('payment_date')->orderBy('id')->get();

        foreach ($credits as $payment) {
            if (! Invoice::where('student_id', $student->id)->open()->exists()) {
                return;
            }
            $this->allocate($payment);
        }
    }

    /** Void a receipt: reverse the journal, remove allocations and restore invoice balances. */
    public function void(Payment $payment, string $reason, ?string $date = null): Payment
    {
        return DB::transaction(function () use ($payment, $reason, $date) {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();

            if ($payment->status === 'void') {
                throw ValidationException::withMessages(['payment' => 'This receipt is already void.']);
            }

            if ($payment->journal && $payment->journal->isPosted()) {
                $this->ledger->reverse($payment->journal, "Receipt {$payment->receipt_no} voided — {$reason}", $date);
            }

            foreach ($payment->allocations()->get() as $allocation) {
                $invoice = Invoice::whereKey($allocation->invoice_id)->lockForUpdate()->first();
                if ($invoice) {
                    $paid = bcsub((string) $invoice->paid, (string) $allocation->amount, 2);
                    $invoice->paid = bccomp($paid, '0', 2) < 0 ? '0.00' : $paid;
                    $invoice->refreshBalance();
                    $invoice->save();
                }
                $allocation->delete();
            }

            $payment->forceFill([
                'status' => 'void',
                'void_reason' => mb_substr($reason, 0, 255),
                'unallocated' => '0.00',
            ])->save();

            AuditLogger::log('voided', $payment, "Voided receipt {$payment->receipt_no}: {$reason}", module: 'fees');

            // Other credit on the account may now settle the re-opened invoices.
            if ($payment->student) {
                $this->applyCredits($payment->student);
            }

            return $payment;
        });
    }

    /** Reject a duplicate payment reference for the same method (idempotency). */
    public function assertUniqueReference(string $method, ?string $reference): void
    {
        if ($reference === null) {
            return;
        }

        $existing = Payment::where('method', $method)->where('reference', $reference)->first(['receipt_no']);
        if ($existing) {
            throw ValidationException::withMessages([
                'reference' => "Reference {$reference} has already been used for a ".str_replace('_', ' ', $method)." payment (receipt {$existing->receipt_no}). Duplicate payments are not allowed.",
            ]);
        }
    }

    protected function apply(Payment $payment, Invoice $invoice, string $amount): void
    {
        if (bccomp($amount, '0', 2) <= 0) {
            return;
        }

        $allocation = PaymentAllocation::where('payment_id', $payment->id)->where('invoice_id', $invoice->id)->first();
        if ($allocation) {
            $allocation->update(['amount' => bcadd((string) $allocation->amount, $amount, 2)]);
        } else {
            PaymentAllocation::create(['payment_id' => $payment->id, 'invoice_id' => $invoice->id, 'amount' => $amount]);
        }

        $invoice->paid = bcadd((string) $invoice->paid, $amount, 2);
        $invoice->refreshBalance();
        $invoice->save();
    }

    /** @param  array<int, string>  $values */
    protected function min(array $values): string
    {
        $min = array_shift($values);
        foreach ($values as $v) {
            if (bccomp($v, $min, 2) < 0) {
                $min = $v;
            }
        }

        return bcadd($min, '0', 2);
    }
}
