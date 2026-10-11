<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends SchoolModel
{
    public const STATUSES = ['unpaid', 'partial', 'paid', 'cancelled'];

    protected function casts(): array
    {
        return [
            'issue_date' => 'date',
            'due_date' => 'date',
            'subtotal' => 'decimal:2',
            'discount' => 'decimal:2',
            'total' => 'decimal:2',
            'paid' => 'decimal:2',
            'balance' => 'decimal:2',
        ];
    }

    /** Invoices that still carry a balance (oldest first when allocating). */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['unpaid', 'partial'])->where('balance', '>', 0);
    }

    public function scopeBillable(Builder $query): Builder
    {
        return $query->whereNotIn('status', ['cancelled', 'draft']);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function term(): BelongsTo
    {
        return $this->belongsTo(Term::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Recompute balance and status from the paid amount (bcmath, no floats). */
    public function refreshBalance(): void
    {
        if ($this->status === 'cancelled') {
            return;
        }

        $balance = bcsub((string) $this->total, (string) $this->paid, 2);
        $this->balance = bccomp($balance, '0', 2) < 0 ? '0.00' : $balance;
        $this->status = match (true) {
            bccomp($this->balance, '0', 2) === 0 => 'paid',
            bccomp((string) $this->paid, '0', 2) > 0 => 'partial',
            default => 'unpaid',
        };
    }
}
