<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Child of TransportRoute (no school_id) — only reached through a scoped route. */
class RouteStop extends Model
{
    protected $guarded = ['id'];

    public function route(): BelongsTo
    {
        return $this->belongsTo(TransportRoute::class, 'transport_route_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(StudentTransport::class, 'route_stop_id');
    }
}
