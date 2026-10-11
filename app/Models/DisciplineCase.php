<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DisciplineCase extends SchoolModel
{
    protected function casts(): array
    {
        return ['incident_date' => 'date'];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by');
    }
}
