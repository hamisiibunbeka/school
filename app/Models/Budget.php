<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Budget extends SchoolModel
{
    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(FiscalYear::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }
}
