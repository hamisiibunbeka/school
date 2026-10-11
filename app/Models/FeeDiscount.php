<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeeDiscount extends SchoolModel
{
    public const TYPES = ['percent', 'fixed'];

    protected function casts(): array
    {
        return ['value' => 'decimal:2', 'is_active' => 'boolean'];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function feeCategory(): BelongsTo
    {
        return $this->belongsTo(FeeCategory::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** Discount amount (decimal string) this rule gives on a line of the given amount. */
    public function amountFor(string $lineAmount): string
    {
        $discount = $this->type === 'percent'
            ? bcdiv(bcmul($lineAmount, (string) $this->value, 4), '100', 2)
            : bcadd((string) $this->value, '0', 2);

        return bccomp($discount, $lineAmount, 2) > 0 ? bcadd($lineAmount, '0', 2) : $discount;
    }
}
