<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Movement of money between two of the school's own cash / bank / mobile-money accounts. */
class FundTransfer extends SchoolModel
{
    public const STATUSES = ['pending', 'posted', 'rejected', 'void'];

    public const METHODS = ['bank_transfer', 'cash_deposit', 'cash_withdrawal', 'mobile_money', 'cheque'];

    protected function casts(): array
    {
        return ['date' => 'date', 'amount' => 'decimal:2', 'charges' => 'decimal:2'];
    }

    public function fromAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'from_account_id');
    }

    public function toAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'to_account_id');
    }

    public function chargeAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'charge_account_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    /** Total leaving the source account (amount + charges). */
    public function totalOut(): string
    {
        return bcadd((string) $this->amount, (string) $this->charges, 2);
    }
}
