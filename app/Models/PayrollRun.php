<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollRun extends SchoolModel
{
    public const STATUSES = ['draft', 'approved', 'paid'];

    protected function casts(): array
    {
        return [
            'payment_date' => 'date',
            'approved_at' => 'datetime',
            'paid_at' => 'datetime',
            'rules_snapshot' => 'array',
            'total_gross' => 'decimal:2',
            'total_deductions' => 'decimal:2',
            'total_net' => 'decimal:2',
            'total_employer' => 'decimal:2',
        ];
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    public function paymentJournal(): BelongsTo
    {
        return $this->belongsTo(Journal::class, 'payment_journal_id');
    }

    public function paymentAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'payment_account_id');
    }

    /** "2026-03" => "March 2026" */
    public function getPeriodLabelAttribute(): string
    {
        return CarbonImmutable::createFromFormat('Y-m-d', $this->period.'-01')->format('F Y');
    }

    public function periodEnd(): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('Y-m-d', $this->period.'-01')->endOfMonth()->startOfDay();
    }
}
