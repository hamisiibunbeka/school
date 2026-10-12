<?php

namespace App\Services\Website;

use App\Models\PlatformSetting;
use App\Models\School;
use App\Models\SchoolWebsite;
use Illuminate\Http\Request;

/**
 * Which school website (if any) is served at "/" for the current host:
 *  1. a school whose custom domain matches the host (plan must allow custom domains), else
 *  2. the school chosen in SaaS Console → Platform Settings → Main domain homepage.
 * Only published sites of schools in good standing qualify; otherwise "/" goes to login.
 */
class HomepageSite
{
    public static function setting(): array
    {
        return PlatformSetting::get('homepage', []) + ['enabled' => false, 'school_id' => null];
    }

    public static function forRequest(Request $request): ?School
    {
        return self::byCustomDomain($request->getHost()) ?? self::platformDefault();
    }

    /** Is this school's site the one served at "/" on the main domain? */
    public static function isPlatformHomepage(School $school): bool
    {
        $setting = self::setting();

        return $setting['enabled'] && (int) $setting['school_id'] === (int) $school->id;
    }

    private static function byCustomDomain(string $host): ?School
    {
        $host = strtolower($host);
        $candidates = array_unique([$host, str_starts_with($host, 'www.') ? substr($host, 4) : "www.{$host}"]);
        $website = SchoolWebsite::withoutGlobalScopes()->whereIn('custom_domain', $candidates)->first();
        if (! $website) {
            return null;
        }

        $school = School::with('tenant.plan')->find($website->school_id);

        return $school && WebsiteEntitlements::for($school)->allows('custom_domain') && self::servable($school, $website) ? $school : null;
    }

    private static function platformDefault(): ?School
    {
        $setting = self::setting();
        if (! $setting['enabled'] || ! $setting['school_id']) {
            return null;
        }

        $school = School::with('tenant.plan')->find($setting['school_id']);
        $website = $school ? SchoolWebsite::withoutGlobalScopes()->where('school_id', $school->id)->first() : null;

        return $school && $website && self::servable($school, $website) ? $school : null;
    }

    private static function servable(School $school, SchoolWebsite $website): bool
    {
        return $website->is_published && WebsiteEntitlements::for($school)->siteAvailable();
    }
}
