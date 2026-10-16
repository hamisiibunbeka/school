<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Models\School;
use App\Models\SchoolWebsite;
use App\Services\Messaging\Beem\BeemClient;
use App\Services\Messaging\Beem\BeemException;
use App\Services\Messaging\Beem\BeemSmsGateway;
use App\Services\Website\HomepageSite;
use App\Services\Website\WebsiteEntitlements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Platform-wide settings: the school website served on the main domain ("/") and the SMS provider status. */
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
            'sms' => [
                'driver' => config('services.sms.driver'),
                'configured' => BeemClient::configured(),
                'default_sender' => config('services.beem.sender_id'),
                'key_hint' => BeemClient::configured() ? '…'.substr((string) config('services.beem.api_key'), -4) : null,
            ],
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

    /** Live Beem status: credit balance and sender IDs with their approval status. */
    public function smsStatus(): JsonResponse
    {
        try {
            $client = BeemClient::fromConfig();

            return response()->json(['ok' => true, 'balance' => $client->balance(), 'senders' => $client->senderNames()]);
        } catch (BeemException $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }
    }

    /** Send a one-off test SMS straight through Beem (not counted against any school). */
    public function smsTest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'sender' => ['nullable', 'string', 'max:11', 'regex:/^[A-Za-z0-9 ]*$/'],
        ]);
        $dest = BeemSmsGateway::destination($data['phone']);
        if (! $dest) {
            return response()->json(['ok' => false, 'message' => 'Enter a valid phone number, e.g. 0712 345 678 or +255712345678.'], 422);
        }

        try {
            $result = BeemClient::fromConfig()->send($data['sender'] ?: (string) config('services.beem.sender_id'), 'Test message from '.config('app.name').'. Your SMS connection works.', [1 => $dest]);
            $this->audit('sms_test', null, "Sent a test SMS to {$dest} (Beem request {$result['request_id']})", 'saas');

            return response()->json(['ok' => true, 'request_id' => $result['request_id'], 'message' => "Submitted to Beem (request {$result['request_id']})."]);
        } catch (BeemException $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }
    }
}