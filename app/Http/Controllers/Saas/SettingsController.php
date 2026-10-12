<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Models\School;
use App\Models\SchoolWebsite;
use App\Services\Website\HomepageSite;
use App\Services\Website\WebsiteEntitlements;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Platform-wide settings: which school website is served on the main domain ("/"). */
class SettingsController extends Controller
{
    public function index(): Response
    {
        $websites = SchoolWebsite::withoutGlobalScopes()->get()->keyBy('school_id');

        $schools = School::with('tenant.plan')->orderBy('name')->get()->map(function (School $s) use ($websites) {
            $website = $websites->get($s->id);
            $available = WebsiteEntitlements::for($s)->siteAvailable();

            return [
                'id' => $s->id,
                'name' => $s->name,
                'tenant' => $s->tenant?->name,
                'plan' => $s->tenant?->plan?->name,
                'site_url' => url('/sites/'.$s->slug),
                'template' => $website?->template,
                'published' => (bool) $website?->is_published,
                'available' => $available,
                'custom_domain' => $website?->custom_domain,
            ];
        });

        return Inertia::render('saas/settings', [
            'homepage' => HomepageSite::setting(),
            'schools' => $schools,
            'appUrl' => url('/'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'school_id' => ['nullable', 'required_if:enabled,true', 'integer', 'exists:schools,id'],
        ], ['school_id.required_if' => 'Choose the school whose website should load on the main domain.']);

        $old = HomepageSite::setting();
        $new = ['enabled' => (bool) $data['enabled'], 'school_id' => $data['school_id'] ? (int) $data['school_id'] : null];
        PlatformSetting::put('homepage', $new);

        $school = $new['school_id'] ? School::find($new['school_id']) : null;
        $this->audit('homepage_updated', null, $new['enabled'] ? "Main domain now shows the website of {$school?->name}" : 'Main domain homepage website disabled (redirects to login)', 'saas', $old, $new);

        $published = $school && SchoolWebsite::withoutGlobalScopes()->where('school_id', $school->id)->value('is_published');
        if ($new['enabled'] && ! $published) {
            $this->toast("Saved — but {$school->name}'s website is not published yet, so the main domain will keep redirecting to login until it is.", 'warning');
        } else {
            $this->toast($new['enabled'] ? 'Main domain now loads the school website.' : 'Main domain now redirects to the login page.');
        }

        return back();
    }
}
