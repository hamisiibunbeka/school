<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A parent's authorized request to pay fees later (special agreement). The student proceeds while the
 * promised amount is outstanding; the agreement is honoured once the student's receipts since it was
 * made reach the promised amount, and is followed up when the agreed date nears or passes.
 */
class FeePaymentAgreement extends SchoolModel
{
    public const STATUSES = ['active', 'honoured', 'defaulted', 'cancelled'];

    protected $appends = ['is_overdue'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_baseline' => 'decimal:2',
            'due_date' => 'date',
            'settled_at' => 'datetime',
            'due_soon_notified_on' => 'date',
            'overdue_notified_on' => 'date',
        ];
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->status === 'active' && $this->due_date && $this->due_date->lt(today());
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(AdmissionApplication::class, 'admission_application_id');
    }

    public function authorizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }
}
