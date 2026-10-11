<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Support\Lookups;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** School calendar of holidays, exams, meetings and activities (SRS 4.8). */
class CalendarController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['month' => '', 'type' => '', 'audience' => ''], $request->only(['month', 'type', 'audience']));

        $month = preg_match('/^\d{4}-\d{2}$/', (string) $filters['month'])
            ? CarbonImmutable::createFromFormat('Y-m-d', $filters['month'].'-01')->startOfDay()
            : CarbonImmutable::now()->startOfMonth();

        // Grid covers whole weeks (Monday-first) around the month.
        $gridStart = $month->startOfMonth()->startOfWeek(CarbonImmutable::MONDAY);
        $gridEnd = $month->endOfMonth()->endOfWeek(CarbonImmutable::SUNDAY);

        $scoped = fn () => Event::query()
            ->when($filters['type'], fn ($q, $v) => $q->where('type', $v))
            ->when($filters['audience'], fn ($q, $v) => $q->whereIn('audience', [$v, 'all']));

        $events = $scoped()
            ->where('starts_at', '<=', $gridEnd)
            ->where(fn ($q) => $q->where('ends_at', '>=', $gridStart)->orWhere(fn ($q) => $q->whereNull('ends_at')->where('starts_at', '>=', $gridStart)))
            ->orderBy('starts_at')->get()->map(fn (Event $e) => $this->present($e));

        $upcoming = $scoped()->where(fn ($q) => $q->where('starts_at', '>=', now()->startOfDay())->orWhere('ends_at', '>=', now()->startOfDay()))
            ->orderBy('starts_at')->limit(8)->get()->map(fn (Event $e) => $this->present($e));

        $yearStart = now()->startOfYear();

        return Inertia::render('academics/calendar', [
            'filters' => [...$filters, 'month' => $month->format('Y-m')],
            'events' => $events,
            'upcoming' => $upcoming,
            'types' => Lookups::enum(Event::TYPES),
            'audiences' => Lookups::enum(Event::AUDIENCES),
            'stats' => [
                'year' => Event::whereBetween('starts_at', [$yearStart, $yearStart->endOfYear()])->count(),
                'month' => Event::whereBetween('starts_at', [$month->startOfMonth(), $month->endOfMonth()->endOfDay()])->count(),
                'holidays' => Event::where('type', 'holiday')->whereBetween('starts_at', [$yearStart, $yearStart->endOfYear()])->count(),
                'exams' => Event::where('type', 'exam')->where('starts_at', '>=', now()->startOfDay())->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $event = new Event($this->validated($request));
        $event->created_by = $request->user()->id;
        $event->save();

        $this->audit('created', $event, "Added calendar event: {$event->title}", 'academics');
        $this->toast('Event added to the calendar.');

        return back();
    }

    public function update(Request $request, Event $event): RedirectResponse
    {
        $old = $event->only(['title', 'starts_at', 'ends_at', 'type']);
        $event->update($this->validated($request));
        $this->audit('updated', $event, "Updated calendar event: {$event->title}", 'academics', $old, $event->only(array_keys($old)));
        $this->toast('Event updated.');

        return back();
    }

    public function destroy(Event $event): RedirectResponse
    {
        $event->delete();
        $this->audit('deleted', $event, "Cancelled calendar event: {$event->title}", 'academics');
        $this->toast('Event removed.');

        return back();
    }

    /** @return array<string, mixed> */
    private function present(Event $e): array
    {
        return [
            'id' => $e->id,
            'title' => $e->title,
            'description' => $e->description,
            'type' => $e->type,
            'all_day' => $e->all_day,
            'audience' => $e->audience,
            'location' => $e->location,
            'start_date' => $e->starts_at->toDateString(),
            'end_date' => ($e->ends_at ?? $e->starts_at)->toDateString(),
            'start_time' => $e->all_day ? null : $e->starts_at->format('H:i'),
            'end_time' => $e->all_day || ! $e->ends_at ? null : $e->ends_at->format('H:i'),
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:2000'],
            'type' => ['required', Rule::in(Event::TYPES)],
            'audience' => ['required', Rule::in(Event::AUDIENCES)],
            'location' => ['nullable', 'string', 'max:150'],
            'all_day' => ['boolean'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'start_time' => ['nullable', 'required_if:all_day,false', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
        ], ['start_time.required_if' => 'Give a start time or mark the event as all day.']);

        $allDay = (bool) ($data['all_day'] ?? true);
        $start = CarbonImmutable::parse($data['start_date'].' '.($allDay ? '00:00' : $data['start_time']));
        $endDate = $data['end_date'] ?? $data['start_date'];
        $end = CarbonImmutable::parse($endDate.' '.($allDay ? '23:59' : ($data['end_time'] ?? $data['start_time'])));

        if ($end->lt($start)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['end_time' => 'The event must end after it starts.']);
        }

        return [
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'type' => $data['type'],
            'audience' => $data['audience'],
            'location' => $data['location'] ?? null,
            'all_day' => $allDay,
            'starts_at' => $start,
            'ends_at' => $end,
        ];
    }
}
