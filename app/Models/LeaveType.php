<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class LeaveType extends SchoolModel
{
    protected function casts(): array
    {
        return ['is_paid' => 'boolean', 'days_per_year' => 'integer'];
    }

    public function requests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
