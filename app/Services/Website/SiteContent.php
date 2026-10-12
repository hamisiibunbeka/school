<?php

namespace App\Services\Website;

use App\Models\AcademicYear;
use App\Models\School;
use App\Models\SchoolWebsite;
use App\Models\WebsiteMedia;
use App\Models\WebsitePage;
use App\Models\WebsitePost;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Builds the data every public website page needs. Must be called inside the
 * school's tenancy context. Content mixes CMS entries with live school data
 * (enrolment, staff, classes, calendar events, public announcements, fees),
 * filtered by what the subscription plan allows.
 */
class SiteContent
{
    public function __construct(private School $school, private SchoolWebsite $site, private WebsiteEntitlements $plan) {}

    public function base(): string
    {
        return '/sites/'.$this->school->slug;
    }

    /** "/" when this site is the platform homepage or is being viewed on its custom domain. */
    public function homeUrl(): string
    {
        $host = strtolower(request()->getHost());
        $domain = strtolower((string) $this->site->custom_domain);
        $onCustomDomain = $domain !== '' && in_array($host, [$domain, "www.{$domain}", preg_replace('/^www\./', '', $domain)], true);

        return $onCustomDomain || HomepageSite::isPlatformHomepage($this->school) ? '/' : $this->base();
    }

    /** Header/footer/theme data shared by all public pages. */
    public function chrome(): array
    {
        $s = $this->site;
        $base = $this->base();

        $nav = [['label' => 'Home', 'href' => $this->homeUrl()], ['label' => 'About', 'href' => "{$base}/about"], ['label' => 'Academics', 'href' => "{$base}/academics"]];
        if ($this->plan->allows('online_admission') && $s->admissionSetting('enabled', true)) {
            $nav[] = ['label' => 'Admissions', 'href' => "{$base}/admissions"];
        }
        if ($this->plan->allows('news')) {
            $nav[] = ['label' => 'News & Events', 'href' => "{$base}/news"];
        }
        if ($this->plan->allows('gallery') && $s->section('gallery')) {
            $nav[] = ['label' => 'Gallery', 'href' => "{$base}/gallery"];
        }
        foreach ($this->menuPages() as $page) {
            $nav[] = ['label' => $page->title, 'href' => "{$base}/p/{$page->slug}"];
        }
        $nav[] = ['label' => 'Contact', 'href' => "{$base}/contact"];
        // "/" may now show this website, so give staff, parents and students a way into the system.
        $nav[] = auth()->check() ? ['label' => 'Dashboard', 'href' => '/dashboard', 'portal' => true] : ['label' => 'Portal login', 'href' => '/login', 'portal' => true];

        return [
            'slug' => $this->school->slug,
            'base' => $base,
            'name' => $this->school->name,
            'motto' => $this->school->motto,
            'tagline' => $s->tagline,
            'logo_url' => $this->school->logo_url,
            'template' => $this->plan->allowsTemplate($s->template) ? $s->template : $this->plan->templates()[0],
            'colors' => ['primary' => $s->primary_color, 'secondary' => $s->secondary_color],
            'contact' => array_merge(['phone' => $this->school->phone, 'email' => $this->school->email, 'address' => $this->school->address], array_filter($s->contact ?? [])),
            'social' => array_filter($s->social ?? []),
            'nav' => $nav,
            'admissions_open' => $this->admissionsOpen(),
            'show_branding' => ! $this->plan->allows('remove_branding'),
            'platform' => config('app.name'),
            'seo' => ['title' => $s->seo_title ?: $this->school->name, 'description' => $s->seo_description],
            'is_preview' => ! $s->is_published,
            'year' => (int) now()->format('Y'),
        ];
    }

    public function home(): array
    {
        $s = $this->site;

        return [
            'hero' => [
                'title' => $s->hero_title ?: "Welcome to {$this->school->name}",
                'subtitle' => $s->hero_subtitle,
                'image_url' => SchoolWebsite::url($s->hero_image_path),
            ],
            'about' => ['title' => $s->about_title, 'excerpt' => Str::limit(strip_tags((string) $s->about_body), 420), 'image_url' => SchoolWebsite::url($s->about_image_path)],
            'mission' => $s->mission,
            'vision' => $s->vision,
            'values' => array_values(array_filter(array_map('trim', preg_split('/\r?\n|,/', (string) $s->core_values)))),
            'highlights' => $s->section('highlights') ? array_values($s->highlights ?? []) : [],
            'stats' => $s->section('stats') ? $this->stats() : null,
            'leader' => $s->section('leadership') && $s->head_message ? [
                'name' => $s->head_name, 'title' => $s->head_title, 'message' => $s->head_message, 'photo_url' => SchoolWebsite::url($s->head_photo_path),
            ] : null,
            'news' => $this->plan->allows('news') && $s->section('news') ? $this->posts(['news', 'notice'], 3) : [],
            'events' => $s->section('events') ? $this->upcomingEvents(4) : [],
            'notices' => $this->notices(3),
            'gallery' => $this->plan->allows('gallery') && $s->section('gallery') ? $this->gallery(8) : [],
            'testimonials' => $s->section('testimonials') ? array_values($s->testimonials ?? []) : [],
            'faqs' => $s->section('faqs') ? array_values($s->faqs ?? []) : [],
        ];
    }

    public function about(): array
    {
        $s = $this->site;

        return [
            'title' => $s->about_title ?: "About {$this->school->name}",
            'body' => $s->about_body,
            'image_url' => SchoolWebsite::url($s->about_image_path),
            'mission' => $s->mission,
            'vision' => $s->vision,
            'values' => array_values(array_filter(array_map('trim', preg_split('/\r?\n|,/', (string) $s->core_values)))),
            'leader' => $s->head_message ? ['name' => $s->head_name, 'title' => $s->head_title, 'message' => $s->head_message, 'photo_url' => SchoolWebsite::url($s->head_photo_path)] : null,
            'stats' => $this->stats(),
            'registration_no' => $this->school->registration_no,
            'level' => $this->school->level,
            'residence_type' => $this->school->residence_type,
        ];
    }

    /** Live academic offering from the school system. */
    public function academics(): array
    {
        $sid = $this->school->id;

        $classes = DB::table('school_classes')->where('school_id', $sid)->orderBy('level')->get(['id', 'name', 'level'])->map(fn ($c) => [
            'name' => $c->name,
            'streams' => DB::table('streams')->where('school_class_id', $c->id)->count(),
            'subjects' => DB::table('class_subjects')->join('subjects', 'subjects.id', '=', 'class_subjects.subject_id')
                ->where('class_subjects.school_class_id', $c->id)->distinct()->orderBy('subjects.name')->pluck('subjects.name')->values(),
        ]);

        $subjects = DB::table('subjects')->leftJoin('departments', 'departments.id', '=', 'subjects.department_id')
            ->where('subjects.school_id', $sid)->orderBy('subjects.name')
            ->get(['subjects.name', 'subjects.type', 'departments.name as department']);

        return [
            'classes' => $classes,
            'subjects' => $subjects->groupBy(fn ($s) => $s->department ?: 'General')->map(fn ($g) => $g->map(fn ($s) => ['name' => $s->name, 'type' => $s->type])->values()),
            'fees' => $this->site->section('fees') ? $this->fees() : [],
            'calendar' => DB::table('terms')->join('academic_years', 'academic_years.id', '=', 'terms.academic_year_id')
                ->where('terms.school_id', $sid)->where('academic_years.id', AcademicYear::current()?->id)
                ->orderBy('terms.start_date')->get(['terms.name', 'terms.start_date', 'terms.end_date']),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function posts(array $types, int $limit): array
    {
        return WebsitePost::published()->whereIn('type', $types)->latest('published_at')->limit($limit)->get()
            ->map(fn (WebsitePost $p) => $this->postCard($p))->all();
    }

    public function postCard(WebsitePost $p): array
    {
        return [
            'slug' => $p->slug,
            'type' => $p->type,
            'title' => $p->title,
            'excerpt' => $p->excerpt ?: Str::limit(strip_tags((string) $p->body), 160),
            'cover_url' => SchoolWebsite::url($p->cover_image_path),
            'published_at' => $p->published_at?->toDateString() ?? $p->created_at?->toDateString(),
            'event_starts_at' => $p->event_starts_at?->toDateTimeString(),
            'event_location' => $p->event_location,
            'href' => $this->base().'/news/'.$p->slug,
        ];
    }

    /** CMS events + public school-calendar events, soonest first. */
    public function upcomingEvents(int $limit): array
    {
        $cms = WebsitePost::published()->where('type', 'event')->where('event_starts_at', '>=', now()->startOfDay())->orderBy('event_starts_at')->limit($limit)->get()
            ->map(fn ($p) => ['title' => $p->title, 'starts_at' => $p->event_starts_at->toDateTimeString(), 'location' => $p->event_location, 'type' => 'event', 'href' => $this->base().'/news/'.$p->slug]);

        $calendar = DB::table('events')->where('school_id', $this->school->id)->whereIn('audience', ['all', 'parents', 'students'])
            ->where('starts_at', '>=', now()->startOfDay())->orderBy('starts_at')->limit($limit)
            ->get(['title', 'starts_at', 'location', 'type'])
            ->map(fn ($e) => ['title' => $e->title, 'starts_at' => $e->starts_at, 'location' => $e->location, 'type' => $e->type, 'href' => null]);

        return $cms->concat($calendar)->sortBy('starts_at')->take($limit)->values()->all();
    }

    /** Public announcements from Communication (audience "all"/"parents", within their publish window). */
    public function notices(int $limit): array
    {
        return DB::table('announcements')->where('school_id', $this->school->id)->whereIn('audience', ['all', 'parents'])
            ->where(fn ($q) => $q->whereNull('publish_at')->orWhere('publish_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()))
            ->latest()->limit($limit)->get(['title', 'body', 'priority', 'created_at'])
            ->map(fn ($a) => ['title' => $a->title, 'body' => Str::limit($a->body, 220), 'priority' => $a->priority, 'date' => substr((string) $a->created_at, 0, 10)])->all();
    }

    public function gallery(?int $limit = null, ?string $album = null): array
    {
        return WebsiteMedia::where('is_published', true)->when($album, fn ($q) => $q->where('album', $album))
            ->orderBy('sort')->latest()->when($limit, fn ($q) => $q->limit($limit))->get()
            ->map(fn ($m) => ['id' => $m->id, 'url' => SchoolWebsite::url($m->file_path), 'title' => $m->title, 'caption' => $m->caption, 'album' => $m->album])->all();
    }

    public function stats(): array
    {
        $sid = $this->school->id;
        $founded = $this->school->setting('founded_year');

        return [
            'students' => DB::table('students')->where('school_id', $sid)->whereNull('deleted_at')->where('status', 'active')->count(),
            'teachers' => DB::table('employees')->where('school_id', $sid)->where('status', 'active')->where('category', 'teaching')->count(),
            'classes' => DB::table('school_classes')->where('school_id', $sid)->count(),
            'subjects' => DB::table('subjects')->where('school_id', $sid)->count(),
            'years' => $founded ? max(1, (int) now()->format('Y') - (int) $founded) : null,
        ];
    }

    /** Current-year fee structure (tuition etc.) per class, if the school chooses to publish it. */
    public function fees(): array
    {
        $year = AcademicYear::current();
        if (! $year) {
            return [];
        }

        return DB::table('fee_structures')
            ->join('school_classes', 'school_classes.id', '=', 'fee_structures.school_class_id')
            ->join('fee_categories', 'fee_categories.id', '=', 'fee_structures.fee_category_id')
            ->leftJoin('terms', 'terms.id', '=', 'fee_structures.term_id')
            ->where('fee_structures.school_id', $this->school->id)->where('fee_structures.academic_year_id', $year->id)
            ->orderBy('school_classes.level')
            ->get(['school_classes.name as class', 'fee_categories.name as category', 'fee_structures.residence_type', 'fee_structures.amount', 'terms.name as term'])
            ->groupBy('class')
            ->map(fn ($rows, $class) => ['class' => $class, 'items' => $rows->map(fn ($r) => [
                'category' => $r->category, 'term' => $r->term, 'residence' => $r->residence_type, 'amount' => (string) $r->amount,
            ])->values()])->values()->all();
    }

    /** Classes applicants can choose, from the admission settings (or all classes). */
    public function admissionClasses(): array
    {
        $ids = $this->site->admissionSetting('class_ids', []);

        return DB::table('school_classes')->where('school_id', $this->school->id)
            ->when($ids, fn ($q) => $q->whereIn('id', $ids))
            ->orderBy('level')->get(['id', 'name'])->map(fn ($c) => ['value' => $c->id, 'label' => $c->name])->all();
    }

    public function admissionsOpen(): bool
    {
        if (! $this->plan->allows('online_admission') || ! $this->site->admissionSetting('enabled', true)) {
            return false;
        }
        $closing = $this->site->admissionSetting('closing_date');

        return ! $closing || now()->toDateString() <= $closing;
    }

    /** @return \Illuminate\Support\Collection<int, WebsitePage> */
    public function menuPages()
    {
        return WebsitePage::where('is_published', true)->where('show_in_menu', true)->orderBy('sort')->orderBy('title')->get(['title', 'slug']);
    }
}
