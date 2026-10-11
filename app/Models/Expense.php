<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Payment voucher / expense (SRS 4.10, 13): pending → paid (approved & posted) | rejected; paid → void (reversed).
 */
class Expense extends SchoolModel
{
    public const STATUSES = ['pending', 'approved', 'paid', 'rejected', 'void'];

    public const METHODS = ['cash', 'bank_transfer', 'cheque', 'mobile_money'];

    protected function casts(): array
    {
        return ['date' => 'date', 'amount' => 'decimal:2'];
    }

    public function expenseAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'expense_account_id');
    }

    public function paymentAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'payment_account_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** Supplier name or free-text payee. */
    public function payeeName(): string
    {
        return $this->supplier?->name ?? $this->payee ?? '—';
    }
}
