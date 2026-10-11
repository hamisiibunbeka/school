<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['permissions' => 'array', 'is_system' => 'boolean'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function allows(string $ability): bool
    {
        $permissions = $this->permissions ?? [];

        if (in_array($ability, $permissions, true)) {
            return true;
        }

        // "<module>.manage" implies "<module>.view"
        if (str_ends_with($ability, '.view')) {
            return in_array(substr($ability, 0, -5).'.manage', $permissions, true);
        }

        return false;
    }

    /** Create the default role set for a tenant. */
    public static function seedDefaultsFor(Tenant $tenant): void
    {
        foreach (config('permissions.roles') as $slug => $role) {
            $model = static::firstOrNew(['tenant_id' => $tenant->id, 'slug' => $slug]);
            $model->tenant_id = $tenant->id;
            $model->fill([
                'name' => $role['name'],
                'description' => $role['description'],
                'permissions' => $role['permissions'],
                'is_system' => true,
            ])->save();
        }
    }
}
