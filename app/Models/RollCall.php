<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RollCall extends SchoolModel
{
    public const SESSIONS = ['morning', 'evening', 'night'];

    public const STATUSES = ['present', 'absent', 'on_leave'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }

    public function dormitory(): BelongsTo
    {
        return $this->belongsTo(Dormitory::class);
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
