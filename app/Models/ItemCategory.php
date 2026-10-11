<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class ItemCategory extends SchoolModel
{
    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class);
    }
}
