<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeeStructure extends SchoolModel
{
    public const RESIDENCE_TYPES = ['all', 'day', 'boarding'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'due_date' => 'date'];
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function term(): BelongsTo
    {
        return $this->belongsTo(Term::class);
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function feeCategory(): BelongsTo
    {
        return $this->belongsTo(FeeCategory::class);
    }

    /** Whether this line applies to a student with the given residence type. */
    public function appliesTo(?string $residence): bool
    {
        return $this->residence_type === 'all' || $this->residence_type === ($residence ?: 'day');
    }
}
