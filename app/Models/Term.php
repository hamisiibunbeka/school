<?php

namespace App\Models;

use App\Support\EducationLevel;
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

    /** Current term of an education level (A-Level terms run July–May). */
    public static function current(string $level = EducationLevel::O_LEVEL): ?self
    {
        $q = fn () => static::whereHas('academicYear', fn ($y) => $y->where('education_level', $level));

        return $q()->where('is_current', true)->first()
            ?? $q()->whereDate('start_date', '<=', now())->whereDate('end_date', '>=', now())->first()
            ?? $q()->latest('start_date')->first();
    }
}
