<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TransportRoute extends SchoolModel
{
    protected function casts(): array
    {
        return ['fare' => 'decimal:2'];
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function stops(): HasMany
    {
        return $this->hasMany(RouteStop::class)->orderBy('sequence');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(StudentTransport::class);
    }

    public function activeAssignments(): HasMany
    {
        return $this->hasMany(StudentTransport::class)->where('status', 'active');
    }

    public function capacity(): int
    {
        return (int) ($this->vehicle?->capacity ?? 0);
    }
}
