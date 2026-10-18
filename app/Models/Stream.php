<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Stream extends SchoolModel
{
    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    /** A-Level streams are one subject combination (e.g. "Form Five PCM"). */
    public function combination(): BelongsTo
    {
        return $this->belongsTo(Combination::class);
    }

    public function classTeacher(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'class_teacher_id');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }
}
