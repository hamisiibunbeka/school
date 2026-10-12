<?php

namespace App\Http\Controllers\Website;

use App\Http\Controllers\Controller;
use App\Models\SchoolWebsite;
use App\Models\WebsiteMedia;
use App\Services\Website\WebsiteEntitlements;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/** Website photo gallery (albums). */
class GalleryController extends Controller
{
    public function index(Request $request): Response
    {
        $plan = WebsiteEntitlements::for($this->tenancy()->school());

        return Inertia::render('website/gallery', [
            'images' => WebsiteMedia::orderBy('album')->orderBy('sort')->latest()->get()->map(fn (WebsiteMedia $m) => [
                ...$m->only(['id', 'album', 'title', 'caption', 'sort', 'is_published']),
                'url' => SchoolWebsite::url($m->file_path),
            ]),
            'albums' => WebsiteMedia::distinct()->orderBy('album')->pluck('album'),
            'limit' => $plan->limit('max_gallery'),
            'enabled' => $plan->allows('gallery'),
            'canManage' => $request->user()->can('website.manage'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $plan = WebsiteEntitlements::for($this->tenancy()->school());
        abort_unless($plan->allows('gallery'), 403, 'The gallery is not included in your plan.');

        $data = $request->validate([
            'album' => ['required', 'string', 'max:80'],
            'images' => ['required', 'array', 'min:1', 'max:20'],
            'images.*' => ['image', 'max:5120'],
        ]);

        $limit = $plan->limit('max_gallery');
        if ($limit !== null && WebsiteMedia::count() + count($data['images']) > $limit) {
            return back()->withErrors(['images' => "Your {$plan->plan()} plan allows {$limit} gallery photos (".WebsiteMedia::count().' used).']);
        }

        $schoolId = $this->tenancy()->schoolId();
        foreach ($request->file('images') as $i => $file) {
            WebsiteMedia::create([
                'album' => $data['album'],
                'title' => pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
                'file_path' => $file->store("websites/{$schoolId}/gallery", 'public'),
                'sort' => $i,
                'is_published' => true,
            ]);
        }

        $this->audit('uploaded', null, count($data['images'])." photo(s) added to gallery album {$data['album']}", 'website');
        $this->toast(count($data['images']).' photo(s) uploaded.');

        return back();
    }

    public function update(Request $request, WebsiteMedia $media): RedirectResponse
    {
        $media->update($request->validate([
            'album' => ['required', 'string', 'max:80'],
            'title' => ['nullable', 'string', 'max:120'],
            'caption' => ['nullable', 'string', 'max:300'],
            'sort' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_published' => ['boolean'],
        ]));
        $this->toast('Photo updated.');

        return back();
    }

    public function destroy(WebsiteMedia $media): RedirectResponse
    {
        Storage::disk('public')->delete($media->file_path);
        $media->delete();
        $this->toast('Photo deleted.');

        return back();
    }
}
