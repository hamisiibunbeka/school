<?php

namespace App\Http\Controllers\Website;

use App\Http\Controllers\Controller;
use App\Models\AdmissionApplication;
use App\Models\Plan;
use App\Models\SchoolWebsite;
use App\Models\WebsiteInquiry;
use App\Models\WebsiteMedia;
use App\Models\WebsitePage;
use App\Models\WebsitePost;
use App\Services\Website\WebsiteDefaults;
use App\Services\Website\WebsiteEntitlements;
use App\Support\HtmlSanitizer;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Website CMS: template, theme, home-page content, admissions form settings, SEO and publishing. */
class WebsiteController extends Controller
{
    public function index(Request $request): Response
    {
        $school = $this->tenancy()->school();
        $website = WebsiteDefaults::ensure($school);
        $plan = WebsiteEntitlements::for($school);

        // Cheapest active plan offering each template, for the "unlock with …" badge.
        $plans = Plan::where('is_active', true)->orderBy('price')->get();
        $templates = collect(config('website.templates'))->map(fn ($t, $key) => $t + [
            'key' => $key,
            'locked' => ! $plan->allowsTemplate($key),
            'unlocked_by' => $plans->first(fn (Plan $p) => in_array($key, WebsiteEntitlements::resolve($p)['templates'] ?? [], true))?->name,
        ])->values();

        return Inertia::render('website/index', [
            'website' => [
                ...$website->toArray(),
                'sections' => ($website->sections ?? []) + SchoolWebsite::SECTION_DEFAULTS,
                'hero_image_url' => SchoolWebsite::url($website->hero_image_path),
                'about_image_url' => SchoolWebsite::url($website->about_image_path),
                'head_photo_url' => SchoolWebsite::url($website->head_photo_path),
                'contact' => $website->contact ?? [],
                'social' => $website->social ?? [],
                'admission_settings' => ($website->admission_settings ?? []) + ['enabled' => true, 'class_ids' => []],
            ],
            'school' => ['name' => $school->name, 'slug' => $school->slug, 'logo_url' => $school->logo_url, 'motto' => $school->motto],
            'siteUrl' => url('/sites/'.$school->slug),
            'templates' => $templates,
            'plan' => $plan->toArray(),
            'counts' => [
                'pages' => WebsitePage::count(),
                'posts' => WebsitePost::where('status', 'published')->count(),
                'gallery' => WebsiteMedia::count(),
                'inquiries_new' => WebsiteInquiry::where('status', 'new')->count(),
                'online_applications' => AdmissionApplication::where('source', 'online')->count(),
                'online_pending' => AdmissionApplication::where('source', 'online')->where('status', 'submitted')->count(),
            ],
            'classes' => Lookups::classes(),
            'years' => Lookups::academicYears(),
            'canManage' => $request->user()->can('website.manage'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $school = $this->tenancy()->school();
        $website = WebsiteDefaults::ensure($school);
        $plan = WebsiteEntitlements::for($school);
        $schoolId = $school->id;

        $data = $request->validate([
            'template' => ['sometimes', Rule::in(array_keys(config('website.templates')))],
            'primary_color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'secondary_color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:150'],
            'hero_title' => ['sometimes', 'nullable', 'string', 'max:150'],
            'hero_subtitle' => ['sometimes', 'nullable', 'string', 'max:500'],
            'about_title' => ['sometimes', 'nullable', 'string', 'max:150'],
            'about_body' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'mission' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'vision' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'core_values' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'head_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'head_title' => ['sometimes', 'nullable', 'string', 'max:120'],
            'head_message' => ['sometimes', 'nullable', 'string', 'max:3000'],
            'highlights' => ['sometimes', 'nullable', 'array', 'max:8'],
            'highlights.*.icon' => ['nullable', 'string', 'max:30'],
            'highlights.*.title' => ['required', 'string', 'max:80'],
            'highlights.*.text' => ['nullable', 'string', 'max:250'],
            'testimonials' => ['sometimes', 'nullable', 'array', 'max:10'],
            'testimonials.*.name' => ['required', 'string', 'max:80'],
            'testimonials.*.role' => ['nullable', 'string', 'max:80'],
            'testimonials.*.quote' => ['required', 'string', 'max:500'],
            'faqs' => ['sometimes', 'nullable', 'array', 'max:20'],
            'faqs.*.question' => ['required', 'string', 'max:200'],
            'faqs.*.answer' => ['required', 'string', 'max:1000'],
            'sections' => ['sometimes', 'array'],
            'sections.*' => ['boolean'],
            'contact' => ['sometimes', 'array'],
            'contact.phone' => ['nullable', 'string', 'max:40'],
            'contact.email' => ['nullable', 'email', 'max:150'],
            'contact.address' => ['nullable', 'string', 'max:255'],
            'contact.office_hours' => ['nullable', 'string', 'max:120'],
            'contact.map_embed_url' => ['nullable', 'url', 'max:1000', 'regex:#^https://(www\.)?google\.[a-z.]+/maps/embed#'],
            'social' => ['sometimes', 'array'],
            'social.*' => ['nullable', 'url', 'max:255'],
            'admission_settings' => ['sometimes', 'array'],
            'admission_settings.enabled' => ['boolean'],
            'admission_settings.intro' => ['nullable', 'string', 'max:1000'],
            'admission_settings.academic_year_id' => ['nullable', Rule::exists('academic_years', 'id')->where('school_id', $schoolId)],
            'admission_settings.class_ids' => ['nullable', 'array'],
            'admission_settings.class_ids.*' => [Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'admission_settings.require_documents' => ['boolean'],
            'admission_settings.fee_note' => ['nullable', 'string', 'max:500'],
            'admission_settings.closing_date' => ['nullable', 'date'],
            'seo_title' => ['sometimes', 'nullable', 'string', 'max:120'],
            'seo_description' => ['sometimes', 'nullable', 'string', 'max:300'],
            'custom_domain' => ['sometimes', 'nullable', 'string', 'max:150', 'regex:/^(?!-)[a-z0-9.-]+\.[a-z]{2,}$/i', Rule::unique('school_websites', 'custom_domain')->ignore($website->id)],
            'hero_image' => ['nullable', 'image', 'max:4096'],
            'about_image' => ['nullable', 'image', 'max:4096'],
            'head_photo' => ['nullable', 'image', 'max:2048'],
            'remove_images' => ['nullable', 'array'],
        ], [
            'contact.map_embed_url.regex' => 'Paste the "Embed a map" link from Google Maps (starts with https://www.google.com/maps/embed).',
        ]);

        if (isset($data['template']) && ! $plan->allowsTemplate($data['template'])) {
            return back()->withErrors(['template' => 'This template is not included in your '.$plan->plan().' plan. Upgrade from Administration → Subscription.']);
        }
        if (array_key_exists('custom_domain', $data) && $data['custom_domain'] && ! $plan->allows('custom_domain')) {
            return back()->withErrors(['custom_domain' => 'Custom domains are available on the Enterprise plan.']);
        }

        if (isset($data['about_body'])) {
            $data['about_body'] = HtmlSanitizer::clean($data['about_body']);
        }
        if (isset($data['sections'])) {
            $data['sections'] = array_intersect_key(array_map('boolval', $data['sections']), SchoolWebsite::SECTION_DEFAULTS) + ($website->sections ?? []);
        }
        if (isset($data['admission_settings'])) {
            $data['admission_settings']['class_ids'] = array_map('intval', $data['admission_settings']['class_ids'] ?? []);
        }
        foreach (['contact', 'social', 'admission_settings'] as $json) {
            if (isset($data[$json])) {
                $data[$json] = array_merge($website->{$json} ?? [], $data[$json]);
            }
        }

        foreach (['hero_image' => 'hero_image_path', 'about_image' => 'about_image_path', 'head_photo' => 'head_photo_path'] as $input => $column) {
            if (in_array($input, $data['remove_images'] ?? [], true) && $website->{$column}) {
                Storage::disk('public')->delete($website->{$column});
                $data[$column] = null;
            }
            if ($request->hasFile($input)) {
                if ($website->{$column}) {
                    Storage::disk('public')->delete($website->{$column});
                }
                $data[$column] = $request->file($input)->store("websites/{$schoolId}", 'public');
            }
            unset($data[$input]);
        }
        unset($data['remove_images']);

        $website->fill($data);
        $website->updated_by = $request->user()->id;
        $website->save();

        $this->audit('updated', $website, 'Updated website content ('.implode(', ', array_keys($data)).')', 'website');
        $this->toast('Website saved.');

        return back();
    }

    public function publish(Request $request): RedirectResponse
    {
        $school = $this->tenancy()->school();
        $website = WebsiteDefaults::ensure($school);
        $publish = $request->boolean('publish');

        $website->forceFill(['is_published' => $publish, 'published_at' => $publish ? ($website->published_at ?? now()) : $website->published_at])->save();

        $this->audit($publish ? 'published' : 'unpublished', $website, $publish ? 'Website published' : 'Website taken offline', 'website');
        $this->toast($publish ? 'Your website is live! 🎉' : 'Website unpublished — visitors now see a “coming soon” page.', $publish ? 'success' : 'warning');

        return back();
    }
}
