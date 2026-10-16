<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A school's purchase of an SMS bundle; credits are added once the platform confirms payment. */
class SmsOrder extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'credits' => 'integer', 'submitted_at' => 'datetime', 'paid_at' => 'datetime'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(SmsPackage::class, 'sms_package_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function isOpen(): bool
    {
        return in_array($this->status, ['pending', 'submitted'], true);
    }
}
