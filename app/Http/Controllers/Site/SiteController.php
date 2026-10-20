<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\School;
use App\Models\SchoolWebsite;
use App\Models\User;
use App\Models\WebsiteInquiry;
use App\Models\WebsitePage;
use App\Models\WebsitePost;
use App\Notifications\SchoolNotification;
use App\Services\AuditLogger;
use App\Services\DocumentNumber;
use App\Services\Website\SiteContent;
use App\Services\Website\WebsiteEntitlements;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public school website (no login). The school is resolved from /sites/{slug}
 * by ResolveSchoolSite, which also sets the tenancy context — every query here
 * therefore only ever sees that school's data.
 */
class SiteController extends Controller
{
    private function ctx(Request $request): array
    {
        /** @var School $school */
        $school = $request->attributes->get('site_school');
        /** @var SchoolWebsite $website */
        $website = $request->attributes->get('site_website');
        /** @var WebsiteEntitlements $plan */
        $plan = $request->attributes->get('site_plan');

        return [$school, $website, $plan, new SiteContent($school, $website, $plan)];
    }

    private function render(Request $request, string $page, array $props = []): Response
    {
        [, , , $content] = $this->ctx($request);

        return Inertia::render("site/{$page}", ['site' => $content->chrome(), ...$props]);
    }

    public function home(Request $request): Response
    {
        [, , , $content] = $this->ctx($request);

        return $this->render($request, 'home', ['home' => $content->home()]);
    }

    public function about(Request $request): Response
    {
        [, , , $content] = $this->ctx($request);

        return $this->render($request, 'about', ['about' => $content->about()]);
    }

    public function academics(Request $request): Response
    {
        [, , , $content] = $this->ctx($request);

        return $this->render($request, 'academics', ['academics' => $content->academics()]);
    }

    public function news(Request $request): Response
    {
        [, , $plan, $content] = $this->ctx($request);
        abort_unless($plan->allows('news'), 404);

        $type = in_array($request->query('type'), WebsitePost::TYPES, true) ? $request->query('type') : null;
        $posts = WebsitePost::published()->when($type, fn ($q) => $q->where('type', $type))
            ->latest('published_at')->paginate(9)->withQueryString()
            ->through(fn (WebsitePost $p) => $content->postCard($p));

        return $this->render($request, 'news', [
            'posts' => $posts,
            'type' => $type,
            'events' => $content->upcomingEvents(6),
            'notices' => $content->notices(5),
        ]);
    }

    public function post(Request $request, string $site, string $slug): Response
    {
        [, , , $content] = $this->ctx($request);
        $post = WebsitePost::published()->where('slug', $slug)->firstOrFail();

        return $this->render($request, 'post', [
            'post' => [...$content->postCard($post), 'body' => $post->body, 'event_ends_at' => $post->event_ends_at?->toDateTimeString()],
            'related' => collect($content->posts([$post->type], 4))->where('slug', '!=', $post->slug)->take(3)->values(),
        ]);
    }

    public function gallery(Request $request): Response
    {
        [, $website, $plan, $content] = $this->ctx($request);
        abort_unless($plan->allows('gallery') && $website->section('gallery'), 404);

        $album = $request->query('album') ?: null;

        return $this->render($request, 'gallery', [
            'images' => $content->gallery(null, $album),
            'albums' => \App\Models\WebsiteMedia::where('is_published', true)->distinct()->orderBy('album')->pluck('album'),
            'album' => $album,
        ]);
    }

    public function page(Request $request, string $site, string $slug): Response
    {
        $page = WebsitePage::where('is_published', true)->where('slug', $slug)->firstOrFail();

        return $this->render($request, 'page', [
            'page' => ['title' => $page->title, 'summary' => $page->summary, 'body' => $page->body, 'cover_url' => SchoolWebsite::url($page->cover_image_path)],
        ]);
    }

    public function contact(Request $request): Response
    {
        return $this->render($request, 'contact');
    }

    public function sendContact(Request $request): RedirectResponse
    {
        if (filled($request->input('website'))) { // honeypot
            return back();
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:150', 'required_without:phone'],
            'phone' => ['nullable', 'string', 'max:25', 'required_without:email'],
            'subject' => ['nullable', 'string', 'max:150'],
            'message' => ['required', 'string', 'max:3000'],
        ]);

        $inquiry = WebsiteInquiry::create($data + ['status' => 'new', 'ip_address' => $request->ip()]);
        $this->notifyStaff('website.view', 'New website enquiry', "{$inquiry->name}: ".Str::limit($inquiry->message, 80), '/website/inquiries', 'info');

        Inertia::flash('site_status', 'Thank you — your message has been sent. The school office will get back to you soon.');

        return back();
    }

    /* ------------------------------------------------------------------ */
    /*  Online admission                                                   */
    /* ------------------------------------------------------------------ */

    public function admissions(Request $request): Response
    {
        [, $website, $plan, $content] = $this->ctx($request);
        abort_unless($plan->allows('online_admission'), 404);

        $yearId = $website->admissionSetting('academic_year_id');

        return $this->render($request, 'admissions', [
            'admission' => [
                'open' => $content->admissionsOpen(),
                'intro' => $website->admissionSetting('intro'),
                'fee_note' => $website->admissionSetting('fee_note'),
                'closing_date' => $website->admissionSetting('closing_date'),
                'year' => $yearId ? AcademicYear::find($yearId)?->name : AcademicYear::current()?->name,
                'classes' => $content->admissionClasses(),
                'residence_options' => $this->residenceOptions($request),
                'documents' => $plan->allows('document_uploads') ? [
                    'enabled' => true,
                    'required' => (bool) $website->admissionSetting('require_documents', false),
                    'max_files' => config('website.admission_documents.max_files'),
                    'max_mb' => (int) (config('website.admission_documents.max_kb') / 1024),
                ] : ['enabled' => false, 'required' => false],
                'fees' => $website->section('fees') ? $content->fees() : [],
            ],
        ]);
    }

    public function apply(Request $request): RedirectResponse
    {
        [$school, $website, $plan, $content] = $this->ctx($request);
        abort_unless($plan->allows('online_admission'), 404);

        if (filled($request->input('website'))) { // honeypot — silently ignore bots
            return back();
        }
        if (! $content->admissionsOpen()) {
            throw ValidationException::withMessages(['form' => 'Online admission is currently closed.']);
        }

        $classIds = array_column($content->admissionClasses(), 'value');
        $docs = config('website.admission_documents');
        $docsAllowed = $plan->allows('document_uploads');

        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'gender' => ['required', Rule::in(['male', 'female'])],
            'date_of_birth' => ['required', 'date', 'before:today', 'after:'.now()->subYears(30)->toDateString()],
            'nationality' => ['nullable', 'string', 'max:60'],
            'school_class_id' => ['required', Rule::in($classIds)],
            'residence_type' => ['required', Rule::in(array_column($this->residenceOptions($request), 'value'))],
            'previous_school' => ['nullable', 'string', 'max:150'],
            'guardian_name' => ['required', 'string', 'max:150'],
            'guardian_relationship' => ['required', 'string', 'max:40'],
            'guardian_phone' => ['required', 'string', 'max:25', 'regex:/^[+0-9 ()-]{9,20}$/'],
            'guardian_email' => ['nullable', 'email', 'max:150'],
            'guardian_occupation' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:255'],
            'medical_notes' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:1500'],
            'documents' => [$docsAllowed && $website->admissionSetting('require_documents') ? 'required' : 'nullable', 'array', 'max:'.$docs['max_files']],
            'documents.*' => ['file', 'max:'.$docs['max_kb'], 'mimes:'.implode(',', $docs['mimes'])],
            'consent' => ['accepted'],
        ], ['consent.accepted' => 'Please confirm the information is correct and consent to it being processed.', 'guardian_phone.regex' => 'Enter a valid phone number.'], [
            'school_class_id' => 'class applying for', 'guardian_phone' => 'parent/guardian phone',
        ]);

        // Duplicate guard: same child + phone already applied and still open.
        $duplicate = AdmissionApplication::where('first_name', $data['first_name'])->where('last_name', $data['last_name'])
            ->whereDate('date_of_birth', $data['date_of_birth'])->where('guardian_phone', $data['guardian_phone'])
            ->whereNotIn('status', ['rejected', 'withdrawn'])->first();
        if ($duplicate) {
            Inertia::flash('site_status', 'We already have an application for this child — here are its details.');

            return redirect("/sites/{$school->slug}/admissions/submitted/{$duplicate->tracking_code}");
        }

        $application = DB::transaction(function () use ($data, $request, $website, $docsAllowed, $school) {
            $application = AdmissionApplication::create([
                ...collect($data)->except(['documents', 'consent'])->all(),
                'application_no' => DocumentNumber::next('application'),
                'tracking_code' => strtoupper(Str::random(8)),
                'academic_year_id' => $website->admissionSetting('academic_year_id') ?: AcademicYear::current()?->id,
                'status' => 'submitted',
                'source' => 'online',
                'submitted_ip' => $request->ip(),
            ]);

            if ($docsAllowed && $request->hasFile('documents')) {
                $files = [];
                foreach ($request->file('documents') as $file) {
                    $files[] = [
                        'title' => Str::limit($file->getClientOriginalName(), 120, ''),
                        'path' => $file->store("admissions/{$school->id}/{$application->id}", 'local'),
                        'size' => $file->getSize(),
                        'mime' => $file->getClientMimeType(),
                    ];
                }
                $application->update(['documents' => $files]);
            }

            return $application;
        });

        AuditLogger::log('online_application', $application, "Online application {$application->application_no} received for {$application->full_name}", null, ['source' => 'online'], 'admissions');
        $this->notifyStaff('admissions.view', 'New online application', "{$application->full_name} applied online ({$application->application_no}).", "/admissions/{$application->id}", 'success');

        return redirect("/sites/{$school->slug}/admissions/submitted/{$application->tracking_code}");
    }

    public function submitted(Request $request, string $site, string $code): Response
    {
        $application = AdmissionApplication::with('schoolClass:id,name')->where('tracking_code', $code)->firstOrFail();

        return $this->render($request, 'admission-status', ['application' => $this->applicationSummary($application), 'justSubmitted' => true]);
    }

    public function track(Request $request): Response
    {
        $application = null;
        $notFound = false;

        if ($request->filled(['reference', 'phone'])) {
            $reference = trim((string) $request->query('reference'));
            $phoneDigits = preg_replace('/\D/', '', (string) $request->query('phone'));
            $candidate = AdmissionApplication::with('schoolClass:id,name')
                ->where(fn ($q) => $q->where('application_no', $reference)->orWhere('tracking_code', strtoupper($reference)))->first();
            if ($candidate && str_ends_with(preg_replace('/\D/', '', $candidate->guardian_phone), substr($phoneDigits, -9))) {
                $application = $this->applicationSummary($candidate);
            } else {
                $notFound = true;
            }
        }

        return $this->render($request, 'admission-status', ['application' => $application, 'notFound' => $notFound, 'justSubmitted' => false]);
    }

    private function applicationSummary(AdmissionApplication $a): array
    {
        $labels = [
            'submitted' => 'Received — awaiting review', 'under_review' => 'Under review', 'interview' => 'Invited for interview / assessment',
            'accepted' => 'Accepted — the school will contact you', 'waitlisted' => 'Waitlisted', 'rejected' => 'Not successful',
            'awaiting_fees' => 'Admitted — pay the first fee installment to complete enrolment', 'enrolled' => 'Enrolled — welcome!', 'withdrawn' => 'Withdrawn',
        ];

        return [
            'application_no' => $a->application_no,
            'tracking_code' => $a->tracking_code,
            'name' => $a->full_name,
            'class' => $a->schoolClass?->name,
            'status' => $a->status,
            'status_label' => $labels[$a->status] ?? Str::title($a->status),
            'submitted_at' => $a->created_at?->toDateString(),
            'interview_date' => $a->interview_date?->toDateString(),
        ];
    }

    private function residenceOptions(Request $request): array
    {
        $school = $request->attributes->get('site_school');

        return match ($school->residence_type) {
            'day' => [['value' => 'day', 'label' => 'Day scholar']],
            'boarding' => [['value' => 'boarding', 'label' => 'Boarder']],
            default => [['value' => 'day', 'label' => 'Day scholar'], ['value' => 'boarding', 'label' => 'Boarder']],
        };
    }

    /** In-app notification to every active staff member of this school holding $permission. */
    private function notifyStaff(string $permission, string $title, string $message, string $url, string $type): void
    {
        $schoolId = app(\App\Support\Tenancy::class)->schoolId();
        User::with('role')->where('school_id', $schoolId)->where('status', 'active')->get()
            ->filter(fn (User $u) => $u->hasPermission($permission))
            ->each(fn (User $u) => $u->notify(new SchoolNotification($title, $message, $url, $type)));
    }
}
