<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class School extends Model
{
    protected $guarded = ['id', 'tenant_id'];

    protected $appends = ['logo_url'];

    protected function casts(): array
    {
        return ['settings' => 'array', 'is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        // Every school gets a unique public web address: /sites/{slug}
        static::creating(function (School $school) {
            if (! $school->slug) {
                $base = \Illuminate\Support\Str::slug($school->name) ?: 'school';
                $slug = $base;
                $n = 2;
                while (static::where('slug', $slug)->exists()) {
                    $slug = $base.'-'.$n++;
                }
                $school->slug = $slug;
            }
        });
    }

    public function website(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(SchoolWebsite::class)->withoutGlobalScopes();
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? Storage::url($this->logo_path) : null;
    }

    public function setting(string $key, mixed $default = null): mixed
    {
        return data_get($this->settings, $key, $default);
    }
}
