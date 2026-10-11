<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Daily staff attendance (separate from student attendance, SRS 4.7). */
class StaffAttendance extends SchoolModel
{
    public const STATUSES = ['present', 'absent', 'late', 'on_leave'];

    protected function casts(): array
    {
        return ['date' => 'date'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
