<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** School calendar entry (holiday, exam, meeting, sports, trip, event, deadline). */
class Event extends SchoolModel
{
    public const TYPES = ['holiday', 'exam', 'meeting', 'sports', 'trip', 'event', 'deadline'];

    public const AUDIENCES = ['all', 'staff', 'parents', 'students'];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'all_day' => 'boolean'];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
