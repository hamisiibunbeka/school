<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FeeCategory extends SchoolModel
{
    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function incomeAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'income_account_id');
    }

    public function structures(): HasMany
    {
        return $this->hasMany(FeeStructure::class);
    }

    public function discounts(): HasMany
    {
        return $this->hasMany(FeeDiscount::class);
    }
}
