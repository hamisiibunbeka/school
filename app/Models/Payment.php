<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payment extends SchoolModel
{
    public const METHODS = ['cash', 'bank', 'mobile_money', 'cheque', 'card'];

    public const STATUSES = ['posted', 'void'];

    /** Default deposit account code per payment method. */
    public const DEFAULT_ACCOUNTS = [
        'cash' => '1100',
        'bank' => '1210',
        'mobile_money' => '1250',
        'cheque' => '1200',
        'card' => '1200',
    ];

    protected function casts(): array
    {
        return ['payment_date' => 'date', 'amount' => 'decimal:2', 'unallocated' => 'decimal:2'];
    }

    public function scopePosted(Builder $query): Builder
    {
        return $query->where('status', 'posted');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class);
    }

    public function depositAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'deposit_account_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }
}
