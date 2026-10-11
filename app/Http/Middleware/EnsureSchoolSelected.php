<?php

namespace App\Http\Middleware;

use App\Support\Tenancy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** School-level pages require an active school context. */
class EnsureSchoolSelected
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app(Tenancy::class)->hasSchool()) {
            return $request->user()?->is_super_admin
                ? redirect()->route('saas.dashboard')
                : abort(403, 'Your account is not linked to a school.');
        }

        return $next($request);
    }
}
