<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthVisit extends SchoolModel
{
    protected function casts(): array
    {
        return ['visited_at' => 'datetime:Y-m-d\TH:i', 'guardian_notified' => 'boolean'];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
