<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One bulk SMS / email send to one or more stakeholder audiences. */
class Broadcast extends SchoolModel
{
    public const STATUSES = ['draft', 'scheduled', 'queued', 'sending', 'completed', 'cancelled'];

    protected function casts(): array
    {
        return [
            'audiences' => 'array',
            'scheduled_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function logs(): HasMany
    {
        return $this->hasMany(MessageLog::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return array<int, string> */
    public function channels(): array
    {
        return $this->channel === 'both' ? ['sms', 'email'] : [$this->channel];
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'scheduled'], true);
    }
}
