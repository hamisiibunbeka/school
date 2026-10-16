<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** Immutable pocket money movement; corrected only by a reversal entry. */
class PocketMoneyTransaction extends SchoolModel
{
    public const CATEGORIES = ['canteen', 'toiletries', 'stationery', 'transport', 'medical', 'uniform', 'contribution', 'refund', 'other'];

    public const METHODS = ['cash', 'mobile_money', 'bank'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'balance_after' => 'decimal:2',
            'transacted_at' => 'datetime',
            'reversed_at' => 'datetime',
            'pin_verified' => 'boolean',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(PocketMoneyAccount::class, 'pocket_money_account_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function reversalOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reversal_of_id');
    }

    public function reversal(): HasOne
    {
        return $this->hasOne(self::class, 'reversal_of_id');
    }

    public function isReversible(): bool
    {
        return $this->type !== 'reversal' && $this->reversed_at === null;
    }
}
