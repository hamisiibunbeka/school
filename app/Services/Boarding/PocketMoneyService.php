<?php

namespace App\Services\Boarding;

use App\Models\PocketMoneyAccount;
use App\Models\PocketMoneyCashCount;
use App\Models\PocketMoneyTransaction;
use App\Models\Student;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\DocumentNumber;
use App\Services\Messaging\MessageService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Custodial pocket money held by patrons/matrons on behalf of boarders.
 *
 * Rules that keep the books dispute-free:
 *  - every movement is a numbered transaction carrying the running balance;
 *  - balances can never go negative and are updated under a row lock;
 *  - nothing is edited or deleted — errors are corrected by a reversal;
 *  - an optional student PIN and daily limit guard withdrawals;
 *  - cash counts compare the custodian's physical cash with the system.
 *
 * This is money held in trust, not school income, so it is kept off the
 * General Ledger.
 */
class PocketMoneyService
{
    public const MAX_PIN_ATTEMPTS = 5;

    public function accountFor(Student $student): PocketMoneyAccount
    {
        return PocketMoneyAccount::firstOrCreate(['student_id' => $student->id], ['custodian_id' => auth()->id()]);
    }

    /**
     * Entries are always stamped "now" (no back-dating) so the running
     * balance reads correctly in time order.
     *
     * @param  array{amount: string|int|float, method?: string|null, counterparty?: string|null, counterparty_phone?: string|null, description?: string|null}  $data
     */
    public function deposit(PocketMoneyAccount $account, array $data): PocketMoneyTransaction
    {
        $amount = $this->amount($data['amount']);

        return DB::transaction(function () use ($account, $data, $amount) {
            $account = PocketMoneyAccount::lockForUpdate()->findOrFail($account->id);
            $this->assertActive($account);

            $txn = $this->post($account, 'deposit', $amount, [
                'method' => $data['method'] ?? 'cash',
                'counterparty' => $data['counterparty'] ?? null,
                'counterparty_phone' => $data['counterparty_phone'] ?? null,
                'description' => $data['description'] ?? null,
                'transacted_at' => now(),
            ]);

            AuditLogger::log('deposit', $txn, "Pocket money {$txn->reference}: ".number_format((float) $amount)." received for {$account->student?->full_name}", module: 'boarding');

            return $txn;
        });
    }

    /** @param  array{amount: string|int|float, category: string, description?: string|null, pin?: string|null, limit_override_reason?: string|null, counterparty?: string|null}  $data */
    public function withdraw(PocketMoneyAccount $account, array $data): PocketMoneyTransaction
    {
        $amount = $this->amount($data['amount']);
        $this->assertActive($account);
        $pinVerified = $this->verifyPin($account, $data['pin'] ?? null);

        return DB::transaction(function () use ($account, $data, $amount, $pinVerified) {
            $account = PocketMoneyAccount::lockForUpdate()->findOrFail($account->id);
            $this->assertActive($account);

            if (bccomp($amount, (string) $account->balance, 2) > 0) {
                throw ValidationException::withMessages(['amount' => 'Insufficient balance: only '.number_format((float) $account->balance).' is available.']);
            }

            $override = trim((string) ($data['limit_override_reason'] ?? '')) ?: null;
            if ($account->daily_limit !== null) {
                $after = bcadd($account->withdrawnToday(), $amount, 2);
                if (bccomp($after, (string) $account->daily_limit, 2) > 0 && ! $override) {
                    throw ValidationException::withMessages(['limit_override_reason' => 'This exceeds the daily limit of '.number_format((float) $account->daily_limit).' (already given today: '.number_format((float) $account->withdrawnToday()).'). Give a reason to override.']);
                }
                if (bccomp($after, (string) $account->daily_limit, 2) <= 0) {
                    $override = null;
                }
            } else {
                $override = null;
            }

            $txn = $this->post($account, 'withdrawal', bcmul($amount, '-1', 2), [
                'category' => $data['category'],
                'description' => $data['description'] ?? null,
                'counterparty' => $data['counterparty'] ?? null,
                'pin_verified' => $pinVerified,
                'limit_override_reason' => $override,
                'transacted_at' => now(),
            ]);

            AuditLogger::log('withdrawal', $txn, "Pocket money {$txn->reference}: ".number_format((float) $amount)." given to {$account->student?->full_name} ({$txn->category})".($override ? " — daily limit overridden: {$override}" : ''), module: 'boarding');

            return $txn;
        });
    }

    /** Correct a mistaken entry with a mirror-image transaction. */
    public function reverse(PocketMoneyTransaction $original, string $reason): PocketMoneyTransaction
    {
        return DB::transaction(function () use ($original, $reason) {
            $original = PocketMoneyTransaction::lockForUpdate()->findOrFail($original->id);
            if (! $original->isReversible()) {
                throw ValidationException::withMessages(['reason' => 'This transaction has already been reversed or is itself a reversal.']);
            }

            $account = PocketMoneyAccount::lockForUpdate()->findOrFail($original->pocket_money_account_id);
            $amount = bcmul((string) $original->amount, '-1', 2);

            if (bccomp(bcadd((string) $account->balance, $amount, 2), '0', 2) < 0) {
                throw ValidationException::withMessages(['reason' => 'Cannot reverse: the student has already spent part of this deposit (balance would go negative).']);
            }

            $reversal = $this->post($account, 'reversal', $amount, [
                'description' => "Reversal of {$original->reference}: {$reason}",
                'reversal_of_id' => $original->id,
                'transacted_at' => now(),
            ]);
            $original->forceFill(['reversed_at' => now()])->save();

            AuditLogger::log('reversed', $original, "Pocket money {$original->reference} reversed by {$reversal->reference}: {$reason}", module: 'boarding');

            return $reversal;
        });
    }

    /** Hand the remaining balance back and close the wallet (student leaving / end of year). */
    public function close(PocketMoneyAccount $account, ?string $collectedBy, ?string $note): ?PocketMoneyTransaction
    {
        return DB::transaction(function () use ($account, $collectedBy, $note) {
            $account = PocketMoneyAccount::lockForUpdate()->findOrFail($account->id);
            $this->assertActive($account);

            $refund = null;
            if (bccomp((string) $account->balance, '0', 2) > 0) {
                $refund = $this->post($account, 'withdrawal', bcmul((string) $account->balance, '-1', 2), [
                    'category' => 'refund',
                    'description' => $note ?: 'Balance refunded on closing the wallet',
                    'counterparty' => $collectedBy,
                    'transacted_at' => now(),
                ]);
            }

            $account->forceFill(['status' => 'closed', 'closed_at' => now()])->save();
            AuditLogger::log('closed', $account, "Pocket money wallet closed for {$account->student?->full_name}".($refund ? ', refunded '.number_format((float) $refund->amount * -1) : ''), module: 'boarding');

            return $refund;
        });
    }

    public function reopen(PocketMoneyAccount $account): void
    {
        $account->forceFill(['status' => 'active', 'closed_at' => null])->save();
        AuditLogger::log('reopened', $account, "Pocket money wallet reopened for {$account->student?->full_name}", module: 'boarding');
    }

    public function setPin(PocketMoneyAccount $account, ?string $pin): void
    {
        $account->forceFill(['pin_hash' => $pin ? Hash::make($pin) : null, 'failed_pin_attempts' => 0])->save();
        AuditLogger::log($pin ? 'pin_set' : 'pin_removed', $account, ($pin ? 'Withdrawal PIN set' : 'Withdrawal PIN removed')." for {$account->student?->full_name}", module: 'boarding');
    }

    /**
     * Record a physical cash count for a custodian; optionally hand all of
     * their wallets over to another user (shift change, leave, transfer).
     *
     * @param  array{custodian_id: int, counted: string|int|float, handed_over_to?: int|null, notes?: string|null}  $data
     */
    public function cashCount(array $data): PocketMoneyCashCount
    {
        return DB::transaction(function () use ($data) {
            $wallets = PocketMoneyAccount::active()->where('custodian_id', $data['custodian_id'])->lockForUpdate()->get(['id', 'balance']);
            $expected = $wallets->reduce(fn ($sum, $w) => bcadd($sum, (string) $w->balance, 2), '0');
            $counted = $this->amount($data['counted'], allowZero: true);
            $receiver = $data['handed_over_to'] ?? null;

            $count = PocketMoneyCashCount::create([
                'custodian_id' => $data['custodian_id'],
                'counted_at' => now(),
                'accounts' => $wallets->count(),
                'expected' => $expected,
                'counted' => $counted,
                'variance' => bcsub($counted, $expected, 2),
                'handed_over_to' => $receiver,
                'notes' => $data['notes'] ?? null,
                'recorded_by' => auth()->id(),
            ]);

            if ($receiver) {
                PocketMoneyAccount::whereIn('id', $wallets->pluck('id'))->update(['custodian_id' => $receiver]);
            }

            $who = User::find($data['custodian_id'])?->name;
            AuditLogger::log($receiver ? 'handover' : 'cash_count', $count, "Pocket money cash count for {$who}: expected ".number_format((float) $expected).', counted '.number_format((float) $counted).', variance '.number_format((float) $count->variance).($receiver ? ' — handed over to '.User::find($receiver)?->name : ''), module: 'boarding');

            return $count;
        });
    }

    /** Text the student's primary guardian about a movement (best effort). */
    public function notifyGuardian(PocketMoneyTransaction $txn): bool
    {
        $student = $txn->student()->with('guardians:id,first_name,last_name,phone')->first();
        $guardian = $student?->guardians->firstWhere('pivot.is_primary', true) ?? $student?->guardians->first();
        $phone = MessageService::normalizePhone($guardian?->phone);
        if (! $phone) {
            return false;
        }

        $currency = app(Tenancy::class)->school()?->currency ?? 'TZS';
        $amount = number_format(abs((float) $txn->amount));
        $balance = number_format((float) $txn->balance_after);
        $body = $txn->type === 'deposit'
            ? "{school_name}: {$currency} {$amount} pocket money received for {$student->first_name} (Ref {$txn->reference}). New balance {$currency} {$balance}."
            : "{school_name}: {$student->first_name} received {$currency} {$amount} pocket money for {$txn->category} (Ref {$txn->reference}). Balance {$currency} {$balance}.";

        $service = app(MessageService::class);
        $stats = $service->dispatch('sms', null, $body, collect([[
            'recipient' => $phone,
            'name' => $guardian->full_name ?? null,
            'vars' => ['school_name' => app(Tenancy::class)->school()?->name],
        ]]), auth()->id());

        return $stats['sent'] > 0;
    }

    /** @param  array<string, mixed>  $attributes */
    private function post(PocketMoneyAccount $account, string $type, string $signedAmount, array $attributes): PocketMoneyTransaction
    {
        $balance = bcadd((string) $account->balance, $signedAmount, 2);
        $account->forceFill(['balance' => $balance])->save();

        return PocketMoneyTransaction::create(array_merge([
            'pocket_money_account_id' => $account->id,
            'student_id' => $account->student_id,
            'reference' => DocumentNumber::next('pocket_money'),
            'type' => $type,
            'amount' => $signedAmount,
            'balance_after' => $balance,
            'recorded_by' => auth()->id(),
        ], $attributes));
    }

    /** Checked outside the posting transaction so failed attempts are persisted. */
    private function verifyPin(PocketMoneyAccount $account, ?string $pin): bool
    {
        if (! $account->hasPin()) {
            return false;
        }

        if ($account->failed_pin_attempts >= self::MAX_PIN_ATTEMPTS) {
            throw ValidationException::withMessages(['pin' => 'PIN locked after too many wrong attempts. Reset the PIN with the student present.']);
        }

        if (! $pin || ! Hash::check($pin, $account->pin_hash)) {
            $account->increment('failed_pin_attempts');
            $left = self::MAX_PIN_ATTEMPTS - $account->failed_pin_attempts;
            throw ValidationException::withMessages(['pin' => $left > 0 ? "Wrong PIN. {$left} attempt(s) left." : 'Wrong PIN. The PIN is now locked.']);
        }

        if ($account->failed_pin_attempts > 0) {
            $account->forceFill(['failed_pin_attempts' => 0])->save();
        }

        return true;
    }

    private function assertActive(PocketMoneyAccount $account): void
    {
        if ($account->status !== 'active') {
            throw ValidationException::withMessages(['amount' => 'This pocket money wallet is closed.']);
        }
    }

    private function amount(string|int|float $value, bool $allowZero = false): string
    {
        $amount = bcadd((string) $value, '0', 2);
        if (bccomp($amount, '0', 2) < 0 || (! $allowZero && bccomp($amount, '0', 2) === 0)) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero.']);
        }

        return $amount;
    }
}
