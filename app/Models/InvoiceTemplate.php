<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A platform sample invoice layout. Exclusive to one school once claimed. */
class InvoiceTemplate extends Model
{
    protected $fillable = ['code', 'name', 'description', 'layout', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return ['layout' => 'array', 'claimed_at' => 'datetime', 'is_active' => 'boolean'];
    }

    /** Layouts a school may see: unclaimed ones plus the one it owns. */
    public function scopeVisibleTo(Builder $query, ?int $schoolId): Builder
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('claimed_by_school_id')->when($schoolId, fn ($q) => $q->orWhere('claimed_by_school_id', $schoolId)));
    }

    public function claimer(): BelongsTo
    {
        return $this->belongsTo(School::class, 'claimed_by_school_id');
    }
}
