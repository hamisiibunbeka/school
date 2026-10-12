<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One band of a TaxTable (no school_id: always reached through its scoped table). */
class TaxBand extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['lower_limit' => 'decimal:2', 'upper_limit' => 'decimal:2', 'rate' => 'decimal:3', 'base_tax' => 'decimal:2'];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(TaxTable::class, 'tax_table_id');
    }
}
