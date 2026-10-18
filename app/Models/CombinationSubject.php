<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CombinationSubject extends SchoolModel
{
    public function combination(): BelongsTo
    {
        return $this->belongsTo(Combination::class);
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }
}
