<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Announcement extends SchoolModel
{
    public const AUDIENCES = ['all', 'staff', 'parents', 'students', 'class'];

    public const PRIORITIES = ['normal', 'important', 'urgent'];

    protected function casts(): array
    {
        return ['publish_at' => 'datetime', 'expires_at' => 'datetime', 'notified_at' => 'datetime'];
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Published and not yet expired. */
    public function scopeLive(Builder $query): Builder
    {
        return $query->where(fn ($q) => $q->whereNull('publish_at')->orWhere('publish_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    /**
     * Announcements visible to a portal audience.
     *
     * @param  array<int, int>  $classIds
     */
    public function scopeForAudience(Builder $query, string $audience, array $classIds = []): Builder
    {
        return $query->where(function ($q) use ($audience, $classIds) {
            $q->whereIn('audience', ['all', $audience]);
            if ($classIds) {
                $q->orWhere(fn ($q) => $q->where('audience', 'class')->whereIn('school_class_id', $classIds));
            }
        });
    }

    public function status(): string
    {
        if ($this->expires_at && $this->expires_at->isPast()) {
            return 'expired';
        }

        if ($this->publish_at && $this->publish_at->isFuture()) {
            return 'scheduled';
        }

        return 'published';
    }
}
