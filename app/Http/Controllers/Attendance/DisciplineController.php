<?php

namespace App\Http\Controllers\Attendance;

use App\Http\Controllers\Controller;
use App\Models\DisciplineCase;
use App\Models\Student;
use App\Models\Term;
use App\Notifications\SchoolNotification;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Discipline incidents, awards and commendations (SRS 4.7). Writes need attendance.manage. */
class DisciplineController extends Controller
{
    public const TYPES = ['misconduct', 'award', 'commendation'];

    public const STATUSES = ['open', 'resolved'];

    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'type', 'status', 'class', 'student']);

        $cases = DisciplineCase::query()
            ->with(['student' => fn ($q) => $q->withTrashed()->with(['schoolClass:id,name', 'stream:id,name']), 'reporter:id,name'])
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('title', 'like', "%{$v}%")
                ->orWhereHas('student', fn ($s) => $s->search($v))))
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['class'] ?? null, fn ($q, $v) => $q->whereHas('student', fn ($s) => $s->where('school_class_id', $v)))
            ->when($filters['student'] ?? null, fn ($q, $v) => $q->where('student_id', $v))
            ->latest('incident_date')->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (DisciplineCase $c) => [
                'id' => $c->id,
                'student_id' => $c->student_id,
                'student' => $c->student?->full_name,
                'admission_no' => $c->student?->admission_no,
                'photo_url' => $c->student?->photo_url,
                'class' => trim(($c->student?->schoolClass?->name ?? '').' '.($c->student?->stream?->name ?? '')),
                'incident_date' => $c->incident_date?->toDateString(),
                'type' => $c->type,
                'title' => $c->title,
                'description' => $c->description,
                'action_taken' => $c->action_taken,
                'status' => $c->status,
                'reporter' => $c->reporter?->name,
            ]);

        $term = Term::current();
        $termQuery = fn () => DisciplineCase::query()->when($term, fn ($q) => $q->whereBetween('incident_date', [$term->start_date, $term->end_date]));

        $prefill = null;
        if ($id = $request->integer('student')) {
            $s = Student::with(['schoolClass:id,name', 'stream:id,name'])->find($id);
            $prefill = $s ? ['value' => $s->id, 'label' => "{$s->full_name} · {$s->admission_no}", 'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? ''))] : null;
        }

        return Inertia::render('attendance/discipline', [
            'cases' => $cases,
            'filters' => array_merge(['search' => '', 'type' => '', 'status' => '', 'class' => '', 'student' => ''], $filters),
            'classes' => Lookups::classes(),
            'types' => Lookups::enum(self::TYPES),
            'statuses' => Lookups::enum(self::STATUSES),
            'prefill' => $prefill,
            'term' => $term?->name,
            'stats' => [
                'open' => DisciplineCase::where('type', 'misconduct')->where('status', 'open')->count(),
                'misconduct_term' => $termQuery()->where('type', 'misconduct')->count(),
                'resolved_term' => $termQuery()->where('type', 'misconduct')->where('status', 'resolved')->count(),
                'awards_term' => $termQuery()->whereIn('type', ['award', 'commendation'])->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $notify = (bool) ($data['notify_guardian'] ?? false);
        unset($data['notify_guardian']);

        $case = DisciplineCase::create($data + ['reported_by' => $request->user()->id]);
        $case->load('student');

        $this->audit('created', $case, ucfirst($case->type)." recorded for {$case->student->full_name}: {$case->title}", 'discipline');
        $sent = $notify ? $this->notifyGuardians($case) : 0;
        $this->toast(ucfirst($case->type).' recorded.'.($sent ? " {$sent} guardian(s) notified." : ''));

        return back();
    }

    public function update(Request $request, DisciplineCase $discipline): RedirectResponse
    {
        $data = $this->validated($request);
        $notify = (bool) ($data['notify_guardian'] ?? false);
        unset($data['notify_guardian']);

        $old = $discipline->only(['type', 'title', 'action_taken', 'status']);
        $discipline->update($data);

        $this->audit('updated', $discipline, "Updated case: {$discipline->title}", 'discipline', $old, $discipline->only(array_keys($old)));
        $sent = $notify ? $this->notifyGuardians($discipline->load('student')) : 0;
        $this->toast('Case updated.'.($sent ? " {$sent} guardian(s) notified." : ''));

        return back();
    }

    public function resolve(Request $request, DisciplineCase $discipline): RedirectResponse
    {
        $data = $request->validate(['action_taken' => ['nullable', 'string', 'max:255']]);
        $discipline->update([
            'status' => 'resolved',
            'action_taken' => ($data['action_taken'] ?? null) ?: $discipline->action_taken,
        ]);
        $this->audit('resolved', $discipline, "Resolved case: {$discipline->title}", 'discipline');
        $this->toast('Case marked as resolved.');

        return back();
    }

    public function destroy(DisciplineCase $discipline): RedirectResponse
    {
        $discipline->delete();
        $this->audit('deleted', $discipline, "Deleted case: {$discipline->title}", 'discipline', $discipline->only(['student_id', 'type', 'title', 'incident_date']));
        $this->toast('Case deleted.');

        return back();
    }

    private function notifyGuardians(DisciplineCase $case): int
    {
        $student = Student::with('guardians.user')->find($case->student_id);
        $sent = 0;
        foreach ($student?->guardians ?? [] as $guardian) {
            if ($guardian->user) {
                $positive = $case->type !== 'misconduct';
                $guardian->user->notify(new SchoolNotification(
                    $positive ? 'Recognition for '.$student->first_name : 'Conduct notice for '.$student->first_name,
                    "{$case->title} (".$case->incident_date->format('d/m/Y').')'.($case->action_taken ? " — {$case->action_taken}" : ''),
                    '/portal',
                    $positive ? 'success' : 'warning',
                ));
                $sent++;
            }
        }

        return $sent;
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $schoolId)->whereNull('deleted_at')],
            'incident_date' => ['required', 'date', 'before_or_equal:today'],
            'type' => ['required', Rule::in(self::TYPES)],
            'title' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:2000'],
            'action_taken' => ['nullable', 'string', 'max:255'],
            'status' => ['required', Rule::in(self::STATUSES)],
            'notify_guardian' => ['boolean'],
        ], [], ['student_id' => 'student']);
    }
}
