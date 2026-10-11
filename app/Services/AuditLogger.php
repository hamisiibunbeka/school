<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

class AuditLogger
{
    /**
     * Record an auditable action. Sensitive attributes are never stored.
     *
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    public static function log(
        string $action,
        ?Model $subject = null,
        ?string $description = null,
        ?array $old = null,
        ?array $new = null,
        ?string $module = null,
    ): void {
        $hidden = ['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'];
        $strip = fn (?array $values) => $values === null ? null : array_diff_key($values, array_flip($hidden));

        $request = request();

        AuditLog::create([
            'user_id' => auth()->id(),
            'action' => $action,
            'module' => $module,
            'auditable_type' => $subject?->getMorphClass(),
            'auditable_id' => $subject?->getKey(),
            'description' => $description,
            'old_values' => $strip($old),
            'new_values' => $strip($new),
            'ip_address' => $request?->ip(),
            'user_agent' => substr((string) $request?->userAgent(), 0, 250),
        ]);
    }
}
