<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends SchoolModel
{
    public const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

    protected function casts(): array
    {
        return ['is_control' => 'boolean', 'is_postable' => 'boolean', 'is_active' => 'boolean'];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Account::class, 'parent_id')->orderBy('code');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    public function scopePostable(Builder $query): Builder
    {
        return $query->where('is_postable', true)->where('is_active', true);
    }

    /** Cash and bank accounts that can receive money. */
    public function scopeCashOrBank(Builder $query): Builder
    {
        return $query->whereIn('sub_type', ['cash', 'bank', 'mobile_money']);
    }

    /** Look up an account by its system sub_type (e.g. "receivable") or code. */
    public static function bySubType(string $subType): ?self
    {
        return static::where('sub_type', $subType)->where('is_postable', true)->orderBy('code')->first();
    }

    public static function byCode(string $code): ?self
    {
        return static::where('code', $code)->first();
    }
}
