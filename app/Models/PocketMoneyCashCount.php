<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PocketMoneyCashCount extends SchoolModel
{
    protected function casts(): array
    {
        return ['counted_at' => 'datetime', 'expected' => 'decimal:2', 'counted' => 'decimal:2', 'variance' => 'decimal:2'];
    }

    public function custodian(): BelongsTo
    {
        return $this->belongsTo(User::class, 'custodian_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handed_over_to');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
