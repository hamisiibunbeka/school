<?php

namespace App\Services\Fees;

use App\Models\FeeCategory;
use App\Models\FeeDiscount;
use App\Models\FeeStructure;
use App\Models\Invoice;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Term;
use App\Services\Accounting\LedgerService;
use App\Services\AuditLogger;
use App\Services\DocumentNumber;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Fee billing: builds invoice lines from fee structures and discounts,
 * issues invoices and posts them to the general ledger.
 *
 * Posting rule (issue):   Dr 1300 Student Fees Receivable  (invoice total)
 *                         Cr <category income account>     (net of discount, per category; fallback 4100)
 * Posting rule (cancel):  mirror-image reversal journal (only when nothing has been paid).
 */
class BillingService
{
    public function __construct(
        protected LedgerService $ledger,
        protected PaymentService $payments,
        protected FeeAccounts $accounts,
    ) {}

    /**
     * Invoice lines for one student from the structures of their class for a term.
     *
     * @param  Collection<int, FeeStructure>  $structures  structures of the student's class for the term
     * @param  Collection<int, FeeDiscount>  $discounts  the student's active discounts
     * @return array<int, array{fee_category_id:int, description:string, amount:string, discount:string, due_date:?string}>
     */
    public function linesFor(Student $student, Collection $structures, Collection $discounts): array
    {
        $lines = [];

        foreach ($structures as $structure) {
            if (! $structure->appliesTo($student->residence_type)) {
                continue;
            }

            $lines[] = [
                'fee_category_id' => $structure->fee_category_id,
                'description' => $structure->feeCategory?->name ?? 'Fee',
                'amount' => bcadd((string) $structure->amount, '0', 2),
                'discount' => '0.00',
                'due_date' => $structure->due_date?->toDateString(),
            ];
        }

        return $this->applyDiscounts($lines, $discounts);
    }

    /**
     * Apply discounts to lines: category-specific discounts hit their category,
     * general percentage discounts hit every line, and general fixed discounts
     * are consumed once across the lines in order.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @param  Collection<int, FeeDiscount>  $discounts
     * @return array<int, array<string, mixed>>
     */
    public function applyDiscounts(array $lines, Collection $discounts): array
    {
        $fixedPool = '0.00';

        foreach ($discounts as $d) {
            if (! $d->fee_category_id && $d->type === 'fixed') {
                $fixedPool = bcadd($fixedPool, (string) $d->value, 2);
            }
        }

        foreach ($lines as &$line) {
            $discount = '0.00';

            foreach ($discounts as $d) {
                $applies = $d->fee_category_id
                    ? (int) $d->fee_category_id === (int) $line['fee_category_id']
                    : $d->type === 'percent';

                if ($applies) {
                    $discount = bcadd($discount, $d->amountFor($line['amount']), 2);
                }
            }

            $room = bcsub($line['amount'], $discount, 2);
            if (bccomp($fixedPool, '0', 2) > 0 && bccomp($room, '0', 2) > 0) {
                $take = bccomp($fixedPool, $room, 2) > 0 ? $room : $fixedPool;
                $discount = bcadd($discount, $take, 2);
                $fixedPool = bcsub($fixedPool, $take, 2);
            }

            $line['discount'] = bccomp($discount, $line['amount'], 2) > 0 ? $line['amount'] : $discount;
        }
        unset($line);

        return $lines;
    }

    /**
     * Preview a batch run without writing anything.
     *
     * @param  array<int, int>  $classIds
     * @return array{students:int, to_invoice:int, skipped:int, subtotal:string, discount:string, total:string, by_class: array<int, array<string, mixed>>, missing: array<int,string>}
     */
    public function preview(Term $term, array $classIds): array
    {
        $plan = $this->plan($term, $classIds);

        $summary = ['students' => 0, 'to_invoice' => 0, 'skipped' => 0, 'subtotal' => '0.00', 'discount' => '0.00', 'total' => '0.00', 'by_class' => [], 'missing' => []];

        foreach ($plan as $row) {
            $summary['students'] += $row['students'];
            $summary['skipped'] += $row['skipped'];
            $summary['to_invoice'] += count($row['invoices']);
            $class = ['class' => $row['class'], 'students' => $row['students'], 'skipped' => $row['skipped'], 'invoices' => count($row['invoices']), 'total' => '0.00', 'has_structure' => $row['has_structure']];

            foreach ($row['invoices'] as $inv) {
                foreach ($inv['lines'] as $l) {
                    $summary['subtotal'] = bcadd($summary['subtotal'], $l['amount'], 2);
                    $summary['discount'] = bcadd($summary['discount'], $l['discount'], 2);
                    $net = bcsub($l['amount'], $l['discount'], 2);
                    $summary['total'] = bcadd($summary['total'], $net, 2);
                    $class['total'] = bcadd($class['total'], $net, 2);
                }
            }

            if (! $row['has_structure']) {
                $summary['missing'][] = $row['class'];
            }
            $summary['by_class'][] = $class;
        }

        return $summary;
    }

    /**
     * Generate invoices for every active student in the classes for a term.
     *
     * @param  array<int, int>  $classIds
     * @return array{count:int, total:string}
     */
    public function generate(Term $term, array $classIds, string $issueDate, ?string $dueDate = null, ?string $notes = null): array
    {
        $plan = $this->plan($term, $classIds);
        $count = 0;
        $total = '0.00';

        DB::transaction(function () use ($plan, $term, $issueDate, $dueDate, $notes, &$count, &$total) {
            foreach ($plan as $row) {
                foreach ($row['invoices'] as $inv) {
                    $invoice = $this->issue($inv['student'], $inv['lines'], [
                        'academic_year_id' => $term->academic_year_id,
                        'term_id' => $term->id,
                        'issue_date' => $issueDate,
                        'due_date' => $dueDate ?: ($inv['due_date'] ?? null),
                        'notes' => $notes,
                    ], audit: false);
                    $count++;
                    $total = bcadd($total, (string) $invoice->total, 2);
                }
            }
        });

        return ['count' => $count, 'total' => $total];
    }

    /**
     * Issue (create + post) one invoice.
     *
     * @param  array<int, array{fee_category_id?:int|null, description:string, amount:string|int|float, discount?:string|int|float|null}>  $lines
     * @param  array{academic_year_id?:int|null, term_id?:int|null, issue_date:string, due_date?:string|null, notes?:string|null}  $meta
     */
    public function issue(Student $student, array $lines, array $meta, bool $audit = true): Invoice
    {
        $clean = [];
        $subtotal = '0.00';
        $discount = '0.00';

        foreach ($lines as $line) {
            $amount = bcadd((string) ($line['amount'] ?: '0'), '0', 2);
            $lineDiscount = bcadd((string) (($line['discount'] ?? null) ?: '0'), '0', 2);

            if (bccomp($amount, '0', 2) <= 0) {
                continue;
            }
            if (bccomp($lineDiscount, '0', 2) < 0 || bccomp($lineDiscount, $amount, 2) > 0) {
                throw ValidationException::withMessages(['lines' => 'A line discount cannot be negative or exceed the line amount.']);
            }

            $clean[] = [
                'fee_category_id' => $line['fee_category_id'] ?? null,
                'description' => mb_substr((string) $line['description'], 0, 255),
                'amount' => $amount,
                'discount' => $lineDiscount,
            ];
            $subtotal = bcadd($subtotal, $amount, 2);
            $discount = bcadd($discount, $lineDiscount, 2);
        }

        if (! $clean) {
            throw ValidationException::withMessages(['lines' => 'An invoice needs at least one line with an amount.']);
        }

        $total = bcsub($subtotal, $discount, 2);

        return DB::transaction(function () use ($student, $clean, $meta, $subtotal, $discount, $total, $audit) {
            $invoice = Invoice::create([
                'invoice_no' => DocumentNumber::next('invoice'),
                'student_id' => $student->id,
                'academic_year_id' => $meta['academic_year_id'] ?? null,
                'term_id' => $meta['term_id'] ?? null,
                'issue_date' => $meta['issue_date'],
                'due_date' => $meta['due_date'] ?? null,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'paid' => '0.00',
                'balance' => $total,
                'status' => bccomp($total, '0', 2) > 0 ? 'unpaid' : 'paid',
                'notes' => isset($meta['notes']) ? mb_substr((string) $meta['notes'], 0, 255) : null,
                'created_by' => auth()->id(),
            ]);
            $invoice->items()->createMany($clean);

            if (bccomp($total, '0', 2) > 0) {
                $journal = $this->ledger->record([
                    'date' => $invoice->issue_date->toDateString(),
                    'type' => 'fees',
                    'reference' => $invoice->invoice_no,
                    'narration' => "Fee invoice {$invoice->invoice_no} — {$student->full_name} ({$student->admission_no})",
                ], $this->journalLines($clean, $total), $invoice);

                $invoice->forceFill(['journal_id' => $journal->id])->save();

                // Any unapplied credit on earlier receipts settles the new invoice straight away.
                $this->payments->applyCredits($student);
            }

            if ($audit) {
                AuditLogger::log('created', $invoice, "Issued invoice {$invoice->invoice_no} for {$student->full_name}: {$total}", module: 'fees');
            }

            return $invoice->fresh();
        });
    }

    /** Cancel an issued invoice that has no payments: reverse its journal and mark it cancelled. */
    public function cancel(Invoice $invoice, string $reason): Invoice
    {
        return DB::transaction(function () use ($invoice, $reason) {
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();

            if ($invoice->status === 'cancelled') {
                throw ValidationException::withMessages(['invoice' => 'This invoice is already cancelled.']);
            }
            if (bccomp((string) $invoice->paid, '0', 2) > 0 || $invoice->allocations()->exists()) {
                throw ValidationException::withMessages(['invoice' => 'This invoice has payments applied. Void those receipts first, then cancel the invoice.']);
            }

            if ($invoice->journal && $invoice->journal->isPosted()) {
                $this->ledger->reverse($invoice->journal, "Invoice {$invoice->invoice_no} cancelled — {$reason}");
            }

            $invoice->forceFill([
                'status' => 'cancelled',
                'balance' => '0.00',
                'notes' => mb_substr(trim(($invoice->notes ? $invoice->notes.' | ' : '')."Cancelled: {$reason}"), 0, 255),
            ])->save();

            AuditLogger::log('cancelled', $invoice, "Cancelled invoice {$invoice->invoice_no}: {$reason}", module: 'fees');

            return $invoice;
        });
    }

    /**
     * @param  array<int, array{fee_category_id:?int, amount:string, discount:string, description:string}>  $lines
     * @return array<int, array{account_id:int, debit?:string, credit?:string, narration?:string}>
     */
    protected function journalLines(array $lines, string $total): array
    {
        $categoryAccounts = FeeCategory::whereIn('id', array_filter(array_column($lines, 'fee_category_id')))
            ->pluck('income_account_id', 'id');

        $credits = [];
        foreach ($lines as $line) {
            $accountId = ($line['fee_category_id'] ? $categoryAccounts[$line['fee_category_id']] ?? null : null) ?: $this->accounts->defaultIncome();
            $net = bcsub($line['amount'], $line['discount'], 2);
            $credits[$accountId] = bcadd($credits[$accountId] ?? '0.00', $net, 2);
        }

        $journal = [['account_id' => $this->accounts->receivable(), 'debit' => $total, 'narration' => 'Student fees receivable']];
        foreach ($credits as $accountId => $amount) {
            $journal[] = ['account_id' => (int) $accountId, 'credit' => $amount, 'narration' => 'Fee income'];
        }

        return $journal;
    }

    /**
     * Work out who gets invoiced and with what lines.
     *
     * @param  array<int, int>  $classIds
     * @return array<int, array{class:string, students:int, skipped:int, has_structure:bool, invoices: array<int, array{student: Student, lines: array, due_date: ?string}>}>
     */
    protected function plan(Term $term, array $classIds): array
    {
        $classes = SchoolClass::whereIn('id', $classIds)->orderBy('level')->orderBy('name')->get();

        $structures = FeeStructure::with('feeCategory:id,name')
            ->where('term_id', $term->id)
            ->whereIn('school_class_id', $classes->pluck('id'))
            ->get()
            ->groupBy('school_class_id');

        $alreadyInvoiced = Invoice::where('term_id', $term->id)->where('status', '!=', 'cancelled')
            ->pluck('student_id')->flip();

        $students = Student::active()->whereIn('school_class_id', $classes->pluck('id'))
            ->orderBy('first_name')->orderBy('last_name')->get()->groupBy('school_class_id');

        $discounts = FeeDiscount::active()->whereIn('student_id', $students->flatten()->pluck('id'))->get()->groupBy('student_id');

        $plan = [];
        foreach ($classes as $class) {
            $classStructures = $structures->get($class->id, collect());
            $classStudents = $students->get($class->id, collect());
            $row = ['class' => $class->name, 'students' => $classStudents->count(), 'skipped' => 0, 'has_structure' => $classStructures->isNotEmpty(), 'invoices' => []];

            foreach ($classStudents as $student) {
                if ($alreadyInvoiced->has($student->id)) {
                    $row['skipped']++;

                    continue;
                }

                $lines = $this->linesFor($student, $classStructures, $discounts->get($student->id, collect()));
                if (! $lines) {
                    continue;
                }

                $dueDates = array_filter(array_column($lines, 'due_date'));
                $row['invoices'][] = ['student' => $student, 'lines' => $lines, 'due_date' => $dueDates ? min($dueDates) : $term->start_date?->addDays(30)->toDateString()];
            }

            $plan[] = $row;
        }

        return $plan;
    }
}
