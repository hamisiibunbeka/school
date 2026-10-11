<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends SchoolModel
{
    public const STATUSES = ['draft', 'approved', 'received', 'cancelled'];

    protected function casts(): array
    {
        return ['order_date' => 'date:Y-m-d', 'expected_date' => 'date:Y-m-d', 'total' => 'decimal:2'];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** Display status: approved orders with some goods in are "partial". */
    public function displayStatus(): string
    {
        if ($this->status === 'approved' && $this->items->contains(fn ($i) => bccomp((string) $i->received_quantity, '0', 2) > 0)) {
            return 'partial';
        }

        return $this->status;
    }
}
