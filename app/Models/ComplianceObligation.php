<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A recurring government levy, fee or licence the school must pay (outside payroll). */
class ComplianceObligation extends SchoolModel
{
    public const BASES = ['fixed', 'percent_of_turnover', 'percent_of_payroll'];

    public const FREQUENCIES = ['monthly' => 1, 'quarterly' => 3, 'semi_annual' => 6, 'annual' => 12];

    protected function casts(): array
    {
        return ['rate' => 'decimal:4', 'amount' => 'decimal:2', 'is_active' => 'boolean'];
    }

    public function expenseAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'expense_account_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CompliancePayment::class)->latest('period_end');
    }
}
