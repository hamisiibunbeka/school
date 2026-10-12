<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompliancePayment extends SchoolModel
{
    protected function casts(): array
    {
        return ['period_start' => 'date', 'period_end' => 'date', 'paid_on' => 'date', 'amount' => 'decimal:2', 'base_amount' => 'decimal:2'];
    }

    public function obligation(): BelongsTo
    {
        return $this->belongsTo(ComplianceObligation::class, 'compliance_obligation_id');
    }

    public function paymentAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'payment_account_id');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
