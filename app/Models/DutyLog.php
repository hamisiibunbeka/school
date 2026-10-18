<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Whether a rostered person did their duty on a given day. */
class DutyLog extends SchoolModel
{
    public const STATUSES = ['done', 'missed', 'excused'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }

    public function assignment(): BelongsTo
    {
        return $this->belongsTo(DutyAssignment::class, 'duty_assignment_id');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
