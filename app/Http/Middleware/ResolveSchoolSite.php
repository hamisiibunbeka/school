<?php

namespace App\Http\Middleware;

use App\Models\School;
use App\Services\Website\WebsiteDefaults;
use App\Services\Website\WebsiteEntitlements;
use App\Support\Tenancy;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Public school websites: resolve the school from /sites/{slug}, switch the
 * tenancy context to it (so all content is that school's only) and enforce
 * publication + subscription state.
 */
class ResolveSchoolSite
{
    public function handle(Request $request, Closure $next): Response
    {
        $school = School::with('tenant.plan')->where('slug', $request->route('site'))->first();
        abort_unless($school, 404);

        [$website, $plan] = self::prepare($request, $school);

        if (! $plan->siteAvailable()) {
            return Inertia::render('site/unavailable', ['name' => $school->name, 'reason' => 'suspended'])->toResponse($request)->setStatusCode(503);
        }

        // Unpublished sites are visible only to signed-in staff of that school (preview).
        $user = $request->user();
        $canPreview = $user && ($user->is_super_admin || ((int) $user->school_id === (int) $school->id && $user->hasPermission('website.view'))
            || ($user->tenant_id === $school->tenant_id && $user->hasPermission('website.view')));

        if (! $website->is_published && ! $canPreview) {
            return Inertia::render('site/unavailable', ['name' => $school->name, 'reason' => 'coming_soon', 'logo_url' => $school->logo_url])->toResponse($request)->setStatusCode(200);
        }

        return $next($request);
    }

    /**
     * Switch tenancy to the school and attach its website + entitlements to the request.
     *
     * @return array{0: \App\Models\SchoolWebsite, 1: WebsiteEntitlements}
     */
    public static function prepare(Request $request, School $school): array
    {
        app(Tenancy::class)->setSchool($school);
        $website = WebsiteDefaults::ensure($school);
        $plan = WebsiteEntitlements::for($school);

        $request->attributes->set('site_school', $school);
        $request->attributes->set('site_website', $website);
        $request->attributes->set('site_plan', $plan);

        return [$website, $plan];
    }
}
