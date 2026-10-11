<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Fortify\TwoFactorAuthenticatable;

/**
 * @property int $id
 * @property int|null $tenant_id
 * @property int|null $school_id
 * @property int|null $role_id
 * @property bool $is_super_admin
 * @property string $name
 * @property string $email
 * @property string|null $phone
 * @property string $status
 * @property Carbon|null $email_verified_at
 * @property string $password
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property Carbon|null $two_factor_confirmed_at
 * @property string|null $remember_token
 * @property Carbon|null $last_login_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, TwoFactorAuthenticatable;

    protected $fillable = ['name', 'email', 'password', 'phone', 'status', 'role_id', 'school_id', 'avatar_path'];

    protected $appends = ['avatar_url'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_super_admin' => 'boolean',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function guardian(): HasOne
    {
        return $this->hasOne(Guardian::class)->withoutGlobalScopes();
    }

    public function student(): HasOne
    {
        return $this->hasOne(Student::class)->withoutGlobalScopes();
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class)->withoutGlobalScopes();
    }

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path ? Storage::url($this->avatar_path) : null;
    }

    public function hasPermission(string $ability): bool
    {
        if ($this->is_super_admin) {
            return true;
        }

        return (bool) $this->role?->allows($ability);
    }

    /** @return array<int, string> */
    public function permissionList(): array
    {
        if ($this->is_super_admin) {
            return ['*'];
        }

        $permissions = $this->role?->permissions ?? [];

        // Expand manage => view so the UI can check a single string.
        foreach ($permissions as $permission) {
            if (str_ends_with($permission, '.manage')) {
                $permissions[] = substr($permission, 0, -7).'.view';
            }
        }

        return array_values(array_unique($permissions));
    }

    public function isParent(): bool
    {
        return $this->role?->slug === 'parent';
    }

    public function isStudent(): bool
    {
        return $this->role?->slug === 'student';
    }

    /** Owners / school admins of a tenant may switch between its schools. */
    public function canSwitchSchools(): bool
    {
        return $this->is_super_admin || $this->role?->slug === 'school-admin';
    }
}
