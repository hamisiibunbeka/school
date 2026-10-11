<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class Dormitory extends SchoolModel
{
    public const GENDERS = ['male', 'female', 'mixed'];

    public function rooms(): HasMany
    {
        return $this->hasMany(DormitoryRoom::class)->orderBy('name');
    }

    public function warden(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'warden_id');
    }

    public function allocations(): HasManyThrough
    {
        return $this->hasManyThrough(BedAllocation::class, DormitoryRoom::class);
    }

    public function rollCalls(): HasMany
    {
        return $this->hasMany(RollCall::class);
    }

    /** Keep the dormitory capacity equal to the sum of its rooms. */
    public function syncCapacity(): void
    {
        $this->forceFill(['capacity' => (int) $this->rooms()->sum('capacity')])->save();
    }

    /** Whether a student of the given gender may be placed in this dormitory. */
    public function accepts(?string $gender): bool
    {
        return $this->gender === 'mixed' || $this->gender === $gender;
    }
}
