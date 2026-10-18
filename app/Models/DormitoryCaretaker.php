<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A patron, matron or assistant looking after a dormitory. */
class DormitoryCaretaker extends SchoolModel
{
    public const ROLES = ['patron', 'matron', 'assistant'];

    public function dormitory(): BelongsTo
    {
        return $this->belongsTo(Dormitory::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
