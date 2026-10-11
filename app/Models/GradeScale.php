<?php

namespace App\Models;

class GradeScale extends SchoolModel
{
    protected function casts(): array
    {
        return ['min_score' => 'decimal:2', 'max_score' => 'decimal:2', 'points' => 'decimal:1'];
    }

    /** Resolve the grade row for a percentage score using the school's configured scale. */
    public static function forScore(float|string|null $score): ?self
    {
        if ($score === null) {
            return null;
        }

        return static::where('min_score', '<=', $score)
            ->where('max_score', '>=', $score)
            ->orderByDesc('min_score')
            ->first()
            ?? static::where('min_score', '<=', $score)->orderByDesc('min_score')->first();
    }
}
