<?php

namespace App\Http\Middleware;

use App\Support\Tenancy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restricts the SaaS console to platform super administrators.
 *
 * Platform pages operate across tenants, so any school context entered for
 * support is cleared for the duration of the request (queries and audit
 * records are then platform-level rather than attributed to that school).
 */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user()?->is_super_admin, 403, 'The SaaS console is restricted to platform administrators.');

        app(Tenancy::class)->setSchool(null);

        return $next($request);
    }
}
