<?php

namespace App\Http\Middleware;

use App\Models\School;
use App\Support\Tenancy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Establishes the tenant/school context from the authenticated user.
 *
 * Super administrators may "enter" any school (stored in session) for
 * support purposes; everyone else is pinned to their own tenant.
 */
class SetSchoolContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        if (($user->status ?? 'active') !== 'active') {
            Auth::guard('web')->logout();
            $request->session()->invalidate();

            return redirect()->route('login')->withErrors(['email' => 'Your account has been disabled. Contact the school administrator.']);
        }

        $schoolId = $request->session()->get('school_id', $user->school_id);
        $school = $schoolId ? School::with('tenant.plan')->find($schoolId) : null;

        // A non-super-admin can only ever act inside their own tenant.
        if ($school && ! $user->is_super_admin && $school->tenant_id !== $user->tenant_id) {
            $school = $user->school_id ? School::with('tenant.plan')->find($user->school_id) : null;
            $request->session()->forget('school_id');
        }

        if ($school && ! $user->is_super_admin && ! $school->tenant->isAccessible()) {
            if (! $request->routeIs('subscription.suspended', 'logout')) {
                return redirect()->route('subscription.suspended');
            }
        }

        app(Tenancy::class)->setSchool($school);

        return $next($request);
    }
}
