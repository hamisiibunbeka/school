<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A-Level subject combination (e.g. PCM): principal subjects plus subsidiaries (GS, BAM). */
class Combination extends SchoolModel
{
    public const PRINCIPAL = 'principal';

    public const SUBSIDIARY = 'subsidiary';

    protected function casts(): array
    {
        return ['requires_bam' => 'boolean', 'is_active' => 'boolean'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function items(): HasMany
    {
        return $this->hasMany(CombinationSubject::class);
    }

    public function streams(): HasMany
    {
        return $this->hasMany(Stream::class);
    }

    /** @return array<int, int> */
    public function principalIds(): array
    {
        return $this->items->where('role', self::PRINCIPAL)->pluck('subject_id')->map(fn ($id) => (int) $id)->values()->all();
    }

    /** @return array<int, int> */
    public function subjectIds(): array
    {
        return $this->items->pluck('subject_id')->map(fn ($id) => (int) $id)->values()->all();
    }
}
