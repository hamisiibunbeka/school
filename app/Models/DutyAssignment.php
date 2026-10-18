<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/** One person (staff or student) rostered on a duty for a date range. */
class DutyAssignment extends SchoolModel
{
    protected function casts(): array
    {
        return ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d'];
    }

    public function dutyType(): BelongsTo
    {
        return $this->belongsTo(DutyType::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(DutyLog::class);
    }

    /** Assignments whose date range overlaps [from, to]. */
    public function scopeOverlapping(Builder $query, CarbonInterface|string $from, CarbonInterface|string $to): Builder
    {
        return $query->whereDate('start_date', '<=', Carbon::parse($to)->toDateString())->whereDate('end_date', '>=', Carbon::parse($from)->toDateString());
    }

    public function scopeCovering(Builder $query, CarbonInterface|string $date): Builder
    {
        return $query->overlapping($date, $date);
    }

    public function personName(): ?string
    {
        return $this->employee?->full_name ?? $this->student?->full_name;
    }

    public function status(?CarbonInterface $today = null): string
    {
        $today ??= today();

        return $this->end_date->lt($today) ? 'ended' : ($this->start_date->gt($today) ? 'upcoming' : 'current');
    }
}
