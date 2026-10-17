<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One sponsor supporting one student for a period (full or partial coverage). */
class StudentSponsorship extends SchoolModel
{
    protected $hidden = ['attachment_path'];

    protected function casts(): array
    {
        return ['percentage' => 'decimal:2', 'start_date' => 'date', 'end_date' => 'date'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function sponsor(): BelongsTo
    {
        return $this->belongsTo(Sponsor::class);
    }
}
