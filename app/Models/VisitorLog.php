<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VisitorLog extends SchoolModel
{
    protected function casts(): array
    {
        return ['check_in' => 'datetime:Y-m-d\TH:i', 'check_out' => 'datetime:Y-m-d\TH:i'];
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
