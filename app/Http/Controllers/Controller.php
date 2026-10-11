<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Model;
use Inertia\Inertia;

abstract class Controller
{
    /** Flash a toast message shown by the frontend (success | error | info | warning). */
    protected function toast(string $message, string $type = 'success'): void
    {
        Inertia::flash('toast', ['type' => $type, 'message' => $message]);
    }

    /**
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    protected function audit(string $action, ?Model $subject, string $description, ?string $module = null, ?array $old = null, ?array $new = null): void
    {
        AuditLogger::log($action, $subject, $description, $old, $new, $module);
    }

    protected function tenancy(): Tenancy
    {
        return app(Tenancy::class);
    }

    /** Standard per-page value honoured by every listing (bounded for safety). */
    protected function perPage(): int
    {
        return min(max((int) request('per_page', 15), 5), 100);
    }
}
