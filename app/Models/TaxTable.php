<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A versioned PAYE table. When the law changes, admins create a new table with
 * a new effective date; payroll picks the table in force for the pay period,
 * so historical payrolls stay reproducible.
 */
class TaxTable extends SchoolModel
{
    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'is_active' => 'boolean',
            'secondary_rate' => 'decimal:3',
            'non_resident_rate' => 'decimal:3',
        ];
    }

    public function bands(): HasMany
    {
        return $this->hasMany(TaxBand::class)->orderBy('lower_limit');
    }

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /** The active table in force on a date (latest effective_from on or before it). */
    public static function inForce(string|\DateTimeInterface $date): ?self
    {
        return static::with('bands')->where('is_active', true)
            ->whereDate('effective_from', '<=', $date)
            ->orderByDesc('effective_from')->orderByDesc('id')
            ->first();
    }

    /**
     * Bands in the calculator format (rate as a fraction).
     *
     * @return array<int, array{from: string, to: string|null, rate: string, base_tax: string}>
     */
    public function toRuleBands(): array
    {
        return $this->bands->map(fn (TaxBand $b) => [
            'from' => (string) $b->lower_limit,
            'to' => $b->upper_limit === null ? null : (string) $b->upper_limit,
            'rate' => bcdiv((string) $b->rate, '100', 6),
            'base_tax' => (string) $b->base_tax,
        ])->values()->all();
    }
}
