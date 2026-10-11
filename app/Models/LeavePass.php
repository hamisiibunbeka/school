<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeavePass extends SchoolModel
{
    public const STATUSES = ['pending', 'approved', 'rejected', 'out', 'returned'];

    protected $appends = ['is_overdue'];

    protected function casts(): array
    {
        return [
            'departure_at' => 'datetime:Y-m-d\TH:i',
            'expected_return_at' => 'datetime:Y-m-d\TH:i',
            'returned_at' => 'datetime:Y-m-d\TH:i',
        ];
    }

    /** Out of school and past the expected return time. */
    public function getIsOverdueAttribute(): bool
    {
        return $this->status === 'out' && $this->expected_return_at && $this->expected_return_at->isPast();
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->where('status', 'out')->where('expected_return_at', '<', now());
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
