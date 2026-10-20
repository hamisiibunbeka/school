<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Installment settings: the share of an academic year's fees due by a date (a year's shares total 100%). */
class FeeInstallment extends SchoolModel
{
    protected function casts(): array
    {
        return ['percent' => 'decimal:2', 'due_date' => 'date', 'sequence' => 'integer'];
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }
}
