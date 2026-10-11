<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DormitoryRoom extends SchoolModel
{
    public function dormitory(): BelongsTo
    {
        return $this->belongsTo(Dormitory::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(BedAllocation::class);
    }

    public function activeAllocations(): HasMany
    {
        return $this->hasMany(BedAllocation::class)->where('status', 'active');
    }
}
