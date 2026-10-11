<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookLoan extends SchoolModel
{
    public const FINE_PER_DAY = '200.00';

    public const MAX_OPEN_LOANS = 3;

    public const LOAN_DAYS = 14;

    protected $appends = ['is_overdue', 'days_overdue'];

    protected function casts(): array
    {
        return ['issued_on' => 'date:Y-m-d', 'due_on' => 'date:Y-m-d', 'returned_on' => 'date:Y-m-d', 'fine' => 'decimal:2'];
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'issued');
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->where('status', 'issued')->whereDate('due_on', '<', now()->toDateString());
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->status === 'issued' && $this->due_on && $this->due_on->lt(now()->startOfDay());
    }

    public function getDaysOverdueAttribute(): int
    {
        if (! $this->due_on) {
            return 0;
        }
        $end = $this->returned_on ?? now()->startOfDay();

        return max(0, (int) $this->due_on->diffInDays($end, false));
    }

    /** Suggested fine at TZS 200 per overdue day. */
    public function suggestedFine(?string $returnedOn = null): string
    {
        $end = $returnedOn ? now()->parse($returnedOn)->startOfDay() : now()->startOfDay();
        $days = max(0, (int) $this->due_on->diffInDays($end, false));

        return bcmul((string) $days, self::FINE_PER_DAY, 2);
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function issuer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by');
    }
}
