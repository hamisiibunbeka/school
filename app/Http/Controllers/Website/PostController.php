<?php

namespace App\Http\Controllers\Website;

use App\Http\Controllers\Controller;
use App\Models\SchoolWebsite;
use App\Models\WebsitePost;
use App\Support\HtmlSanitizer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Website news, events and notices. */
class PostController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = ['search' => $request->string('search')->toString(), 'type' => $request->string('type')->toString(), 'status' => $request->string('status')->toString()];

        $posts = WebsitePost::with('author:id,name')
            ->when($filters['search'], fn ($q, $s) => $q->where('title', 'like', "%{$s}%"))
            ->when($filters['type'], fn ($q, $t) => $q->where('type', $t))
            ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
            ->latest('updated_at')->paginate($this->perPage())->withQueryString()
            ->through(fn (WebsitePost $p) => [
                ...$p->only(['id', 'type', 'title', 'slug', 'excerpt', 'body', 'status', 'is_featured', 'event_location']),
                'cover_url' => SchoolWebsite::url($p->cover_image_path),
                'published_at' => $p->published_at?->toDateTimeString(),
                'event_starts_at' => $p->event_starts_at?->format('Y-m-d\TH:i'),
                'event_ends_at' => $p->event_ends_at?->format('Y-m-d\TH:i'),
                'author' => $p->author?->name,
            ]);

        return Inertia::render('website/posts', [
            'posts' => $posts,
            'filters' => $filters,
            'siteUrl' => url('/sites/'.$this->tenancy()->school()->slug),
            'canManage' => $request->user()->can('website.manage'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $post = WebsitePost::create($data + ['created_by' => $request->user()->id]);
        $this->audit('created', $post, "Created website {$post->type}: {$post->title}", 'website');
        $this->toast($post->status === 'published' ? 'Published to the website.' : 'Saved as draft.');

        return back();
    }

    public function update(Request $request, WebsitePost $post): RedirectResponse
    {
        $post->update($this->validated($request, $post));
        $this->audit('updated', $post, "Updated website {$post->type}: {$post->title}", 'website');
        $this->toast('Saved.');

        return back();
    }

    public function destroy(WebsitePost $post): RedirectResponse
    {
        if ($post->cover_image_path) {
            Storage::disk('public')->delete($post->cover_image_path);
        }
        $post->delete();
        $this->audit('deleted', $post, "Deleted website {$post->type}: {$post->title}", 'website');
        $this->toast('Deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?WebsitePost $post = null): array
    {
        $schoolId = $this->tenancy()->schoolId();
        $slug = Str::slug($request->input('slug') ?: $request->input('title'));
        // Keep slugs unique automatically.
        $base = $slug;
        $n = 2;
        while (WebsitePost::where('slug', $slug)->when($post, fn ($q) => $q->where('id', '!=', $post->id))->exists()) {
            $slug = $base.'-'.$n++;
        }
        $request->merge(['slug' => $slug]);

        $data = $request->validate([
            'type' => ['required', Rule::in(WebsitePost::TYPES)],
            'title' => ['required', 'string', 'max:180'],
            'slug' => ['required', 'string', 'max:190'],
            'excerpt' => ['nullable', 'string', 'max:400'],
            'body' => ['nullable', 'string', 'max:50000'],
            'status' => ['required', Rule::in(['draft', 'published'])],
            'published_at' => ['nullable', 'date'],
            'is_featured' => ['boolean'],
            'event_starts_at' => ['nullable', 'required_if:type,event', 'date'],
            'event_ends_at' => ['nullable', 'date', 'after_or_equal:event_starts_at'],
            'event_location' => ['nullable', 'string', 'max:150'],
            'cover_image' => ['nullable', 'image', 'max:4096'],
        ], [], ['event_starts_at' => 'event start']);

        $data['body'] = HtmlSanitizer::clean($data['body'] ?? null);
        if ($data['status'] === 'published' && empty($data['published_at'])) {
            $data['published_at'] = $post?->published_at ?? now();
        }
        if ($request->hasFile('cover_image')) {
            if ($post?->cover_image_path) {
                Storage::disk('public')->delete($post->cover_image_path);
            }
            $data['cover_image_path'] = $request->file('cover_image')->store("websites/{$schoolId}/posts", 'public');
        }
        unset($data['cover_image']);

        return $data;
    }
}
