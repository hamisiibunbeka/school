<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/** A school-defined duty (Teacher on Duty, Prep, Dining hall …) for staff or students. */
class DutyType extends SchoolModel
{
    public const AUDIENCES = ['staff', 'student'];

    public const ROTATIONS = ['daily', 'weekly', 'term', 'custom'];

    protected function casts(): array
    {
        return [
            'days' => 'array',
            'is_active' => 'boolean',
            'people_needed' => 'integer',
            'workload_periods' => 'integer',
        ];
    }

    public function scopeFor(Builder $query, string $audience): Builder
    {
        return $query->where('audience', $audience);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(DutyAssignment::class);
    }

    /** Whether the duty runs on the given date's weekday (no days set = every day). */
    public function runsOn(CarbonInterface|string $date): bool
    {
        $days = $this->days ?: [];

        return $days === [] || in_array(Carbon::parse($date)->isoWeekday(), array_map('intval', $days), true);
    }

    /** "19:30–21:30" or null. */
    public function timeLabel(): ?string
    {
        if (! $this->start_time) {
            return null;
        }

        return substr($this->start_time, 0, 5).($this->end_time ? '–'.substr($this->end_time, 0, 5) : '');
    }
}
