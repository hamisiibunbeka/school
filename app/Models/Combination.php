<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A-Level subject combination (e.g. PCM): 3 principal subjects plus the optional subsidiaries it takes (e.g. BAM).
 * Compulsory subsidiaries are not stored here — they come from the class's A-Level rules (see ALevelRules).
 */
class Combination extends SchoolModel
{
    public const PRINCIPAL = 'principal';

    public const SUBSIDIARY = 'subsidiary';

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
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

    /** Optional subsidiaries this combination takes (e.g. BAM). @return array<int, int> */
    public function optionalIds(): array
    {
        return $this->items->where('role', self::SUBSIDIARY)->pluck('subject_id')->map(fn ($id) => (int) $id)->values()->all();
    }

    /** Principal + optional subjects (without the class's compulsory subsidiaries). @return array<int, int> */
    public function subjectIds(): array
    {
        return $this->items->pluck('subject_id')->map(fn ($id) => (int) $id)->values()->all();
    }
}
