<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Term extends SchoolModel
{
    protected function casts(): array
    {
        return ['start_date' => 'date', 'end_date' => 'date', 'is_current' => 'boolean'];
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public static function current(): ?self
    {
        return static::where('is_current', true)->first()
            ?? static::whereDate('start_date', '<=', now())->whereDate('end_date', '>=', now())->first()
            ?? static::latest('start_date')->first();
    }
}
