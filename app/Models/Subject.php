<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subject extends SchoolModel
{
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }
}
