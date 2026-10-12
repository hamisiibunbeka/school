<?php

namespace App\Http\Controllers\Website;

use App\Http\Controllers\Controller;
use App\Models\SchoolWebsite;
use App\Models\WebsitePage;
use App\Services\Website\WebsiteEntitlements;
use App\Support\HtmlSanitizer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Custom website pages (e.g. Boarding life, Uniform, Clubs, Prospectus). */
class PageController extends Controller
{
    public function index(Request $request): Response
    {
        $plan = WebsiteEntitlements::for($this->tenancy()->school());

        return Inertia::render('website/pages', [
            'pages' => WebsitePage::orderBy('sort')->orderBy('title')->get()->map(fn (WebsitePage $p) => [
                ...$p->only(['id', 'title', 'slug', 'summary', 'body', 'show_in_menu', 'sort', 'is_published']),
                'cover_url' => SchoolWebsite::url($p->cover_image_path),
                'updated_at' => $p->updated_at?->toDateTimeString(),
            ]),
            'limit' => $plan->limit('max_pages'),
            'siteUrl' => url('/sites/'.$this->tenancy()->school()->slug),
            'canManage' => $request->user()->can('website.manage'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $plan = WebsiteEntitlements::for($this->tenancy()->school());
        $limit = $plan->limit('max_pages');
        if ($limit !== null && WebsitePage::count() >= $limit) {
            return back()->withErrors(['title' => "Your {$plan->plan()} plan allows {$limit} custom pages. Upgrade for more."]);
        }

        $page = WebsitePage::create($this->validated($request));
        $this->audit('created', $page, "Created website page {$page->title}", 'website');
        $this->toast('Page created.');

        return back();
    }

    public function update(Request $request, WebsitePage $page): RedirectResponse
    {
        $page->update($this->validated($request, $page));
        $this->audit('updated', $page, "Updated website page {$page->title}", 'website');
        $this->toast('Page saved.');

        return back();
    }

    public function destroy(WebsitePage $page): RedirectResponse
    {
        if ($page->cover_image_path) {
            Storage::disk('public')->delete($page->cover_image_path);
        }
        $page->delete();
        $this->audit('deleted', $page, "Deleted website page {$page->title}", 'website');
        $this->toast('Page deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?WebsitePage $page = null): array
    {
        $schoolId = $this->tenancy()->schoolId();
        $request->merge(['slug' => Str::slug($request->input('slug') ?: $request->input('title'))]);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'slug' => ['required', 'string', 'max:120', 'alpha_dash', Rule::notIn(['about', 'academics', 'admissions', 'news', 'gallery', 'contact']),
                Rule::unique('website_pages')->where('school_id', $schoolId)->ignore($page?->id)],
            'summary' => ['nullable', 'string', 'max:300'],
            'body' => ['nullable', 'string', 'max:50000'],
            'show_in_menu' => ['boolean'],
            'is_published' => ['boolean'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:999'],
            'cover_image' => ['nullable', 'image', 'max:4096'],
        ]);

        $data['body'] = HtmlSanitizer::clean($data['body'] ?? null);
        $data['sort'] ??= 0;
        if ($request->hasFile('cover_image')) {
            if ($page?->cover_image_path) {
                Storage::disk('public')->delete($page->cover_image_path);
            }
            $data['cover_image_path'] = $request->file('cover_image')->store("websites/{$schoolId}/pages", 'public');
        }
        unset($data['cover_image']);

        return $data;
    }
}
