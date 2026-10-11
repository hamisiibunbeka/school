<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Services\Messaging\AnnouncementNotifier;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** School notices with audience targeting and a publish/expiry window (SRS 4.18, 6.1). */
class AnnouncementController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'audience' => '', 'status' => '', 'priority' => ''], $request->only(['search', 'audience', 'status', 'priority']));

        $announcements = Announcement::query()
            ->with(['schoolClass:id,name', 'creator:id,name'])
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('title', 'like', "%{$v}%")->orWhere('body', 'like', "%{$v}%")))
            ->when($filters['audience'], fn ($q, $v) => $q->where('audience', $v))
            ->when($filters['priority'], fn ($q, $v) => $q->where('priority', $v))
            ->when($filters['status'] === 'published', fn ($q) => $q->live())
            ->when($filters['status'] === 'scheduled', fn ($q) => $q->where('publish_at', '>', now()))
            ->when($filters['status'] === 'expired', fn ($q) => $q->where('expires_at', '<=', now()))
            ->orderByRaw('COALESCE(publish_at, created_at) DESC')
            ->paginate($request->filled('per_page') ? $this->perPage() : 12)
            ->withQueryString()
            ->through(fn (Announcement $a) => [
                'id' => $a->id,
                'title' => $a->title,
                'body' => $a->body,
                'audience' => $a->audience,
                'school_class_id' => $a->school_class_id,
                'class' => $a->schoolClass?->name,
                'priority' => $a->priority,
                'publish_at' => $a->publish_at?->toIso8601String(),
                'expires_at' => $a->expires_at?->toIso8601String(),
                'notified_at' => $a->notified_at?->toIso8601String(),
                'status' => $a->status(),
                'author' => $a->creator?->name,
                'created_at' => $a->created_at?->toIso8601String(),
            ]);

        return Inertia::render('communication/announcements', [
            'announcements' => $announcements,
            'filters' => $filters,
            'classes' => Lookups::classes(),
            'stats' => [
                'live' => Announcement::live()->count(),
                'scheduled' => Announcement::where('publish_at', '>', now())->count(),
                'expired' => Announcement::where('expires_at', '<=', now())->count(),
                'urgent' => Announcement::live()->where('priority', 'urgent')->count(),
            ],
        ]);
    }

    public function store(Request $request, AnnouncementNotifier $notifier): RedirectResponse
    {
        $data = $this->validated($request);
        $announcement = new Announcement($data);
        $announcement->created_by = $request->user()->id;
        $announcement->save();

        $notified = $this->maybeNotify($announcement, $notifier);

        $this->audit('created', $announcement, "Created announcement \"{$announcement->title}\" for {$announcement->audience}", 'communication');
        $this->toast($notified !== null ? "Announcement published and {$notified} users notified." : 'Announcement scheduled.');

        return back();
    }

    public function update(Request $request, Announcement $announcement, AnnouncementNotifier $notifier): RedirectResponse
    {
        $data = $this->validated($request);
        $old = $announcement->only(['title', 'audience', 'priority', 'publish_at', 'expires_at']);

        // Re-targeting to a different audience should notify the new audience.
        if ($announcement->audience !== $data['audience'] || (int) $announcement->school_class_id !== (int) ($data['school_class_id'] ?? 0)) {
            $announcement->notified_at = null;
        }

        $announcement->fill($data)->save();
        $this->maybeNotify($announcement, $notifier);

        $this->audit('updated', $announcement, "Updated announcement \"{$announcement->title}\"", 'communication', $old, $announcement->only(array_keys($old)));
        $this->toast('Announcement updated.');

        return back();
    }

    /** Publish a scheduled announcement immediately. */
    public function publish(Announcement $announcement, AnnouncementNotifier $notifier): RedirectResponse
    {
        $announcement->update(['publish_at' => now(), 'expires_at' => $announcement->expires_at?->isPast() ? null : $announcement->expires_at]);
        $count = $notifier->notify($announcement);

        $this->audit('published', $announcement, "Published announcement \"{$announcement->title}\"", 'communication');
        $this->toast("Announcement published. {$count} users notified.");

        return back();
    }

    /** End an announcement now (unpublish). */
    public function expire(Announcement $announcement): RedirectResponse
    {
        $announcement->update(['expires_at' => now()]);
        $this->audit('unpublished', $announcement, "Unpublished announcement \"{$announcement->title}\"", 'communication');
        $this->toast('Announcement unpublished.');

        return back();
    }

    public function destroy(Announcement $announcement): RedirectResponse
    {
        $announcement->delete();
        $this->audit('deleted', $announcement, "Deleted announcement \"{$announcement->title}\"", 'communication');
        $this->toast('Announcement deleted.');

        return back();
    }

    private function maybeNotify(Announcement $announcement, AnnouncementNotifier $notifier): ?int
    {
        if ($announcement->status() !== 'published') {
            return null;
        }

        return $notifier->notify($announcement);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:5000'],
            'audience' => ['required', Rule::in(Announcement::AUDIENCES)],
            'school_class_id' => ['nullable', 'required_if:audience,class', Rule::exists('school_classes', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'priority' => ['required', Rule::in(Announcement::PRIORITIES)],
            'publish_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after:now', ...($request->filled('publish_at') ? ['after:publish_at'] : [])],
        ], [], ['school_class_id' => 'class']);

        if ($data['audience'] !== 'class') {
            $data['school_class_id'] = null;
        }

        return $data;
    }
}
