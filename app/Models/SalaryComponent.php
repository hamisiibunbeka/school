<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalaryComponent extends SchoolModel
{
    public const TYPES = ['allowance', 'deduction', 'employer_contribution'];

    public const CALCULATIONS = ['fixed', 'percent_of_basic', 'paye'];

    protected function casts(): array
    {
        return [
            'value' => 'decimal:4',
            'is_statutory' => 'boolean',
            'applies_to_all' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(EmployeeSalaryComponent::class);
    }
}
