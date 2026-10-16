<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PocketMoneyAccount extends SchoolModel
{
    protected $hidden = ['pin_hash'];

    protected function casts(): array
    {
        return ['balance' => 'decimal:2', 'daily_limit' => 'decimal:2', 'closed_at' => 'datetime'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function custodian(): BelongsTo
    {
        return $this->belongsTo(User::class, 'custodian_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(PocketMoneyTransaction::class);
    }

    public function hasPin(): bool
    {
        return $this->pin_hash !== null;
    }

    /** Total drawn today (net of reversed withdrawals). */
    public function withdrawnToday(): string
    {
        $out = $this->transactions()
            ->where('type', 'withdrawal')
            ->whereNull('reversed_at')
            ->whereDate('transacted_at', now()->toDateString())
            ->sum('amount');

        return bcmul((string) $out, '-1', 2);
    }
}
