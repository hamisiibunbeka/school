<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Site\SiteController;
use App\Http\Middleware\ResolveSchoolSite;
use App\Services\Website\HomepageSite;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * "/": serves a school website when one is configured for this host
 * (custom domain, or the platform's main-domain homepage); otherwise the
 * app entry point (dashboard when signed in, else login).
 */
class HomeController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $school = HomepageSite::forRequest($request);

        if (! $school) {
            return redirect($request->user() ? '/dashboard' : '/login');
        }

        ResolveSchoolSite::prepare($request, $school);

        return app(SiteController::class)->home($request)->toResponse($request);
    }
}
