<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageLog extends SchoolModel
{
    public const STATUSES = ['queued', 'sent', 'delivered', 'failed'];

    protected function casts(): array
    {
        return ['credits' => 'integer', 'delivery_checked_at' => 'datetime', 'delivered_at' => 'datetime'];
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}
