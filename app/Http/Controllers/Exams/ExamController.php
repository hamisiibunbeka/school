<?php

namespace App\Http\Controllers\Exams;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\Exam;
use App\Models\Student;
use App\Models\Term;
use App\Notifications\SchoolNotification;
use App\Services\Exams\ResultsService;
use App\Services\Exams\TeacherAccess;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Examinations and the results workflow (SRS 4.6, 13):
 * draft → marks_entry → moderation → published; published results are locked and
 * can only be corrected by an approver "unpublishing with a reason" (audited).
 */
class ExamController extends Controller
{
    public function __construct(private TeacherAccess $access, private ResultsService $results) {}

    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'year', 'term', 'status']);

        $exams = Exam::query()
            ->with(['academicYear:id,name', 'term:id,name', 'classes:id,name,level'])
            ->withCount(['marks as marks_count' => fn ($q) => $q->where(fn ($w) => $w->whereNotNull('score')->orWhere('is_absent', true))])
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where('name', 'like', "%{$v}%"))
            ->when($filters['year'] ?? null, fn ($q, $v) => $q->where('academic_year_id', $v))
            ->when($filters['term'] ?? null, fn ($q, $v) => $q->where('term_id', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->orderByDesc('start_date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Exam $e) => $this->row($e));

        $year = AcademicYear::current();
        $yearQuery = fn () => Exam::query()->when($year, fn ($q) => $q->where('academic_year_id', $year->id));

        return Inertia::render('exams/index', [
            'exams' => $exams,
            'filters' => array_merge(['search' => '', 'year' => '', 'term' => '', 'status' => ''], $filters),
            'years' => Lookups::academicYears(),
            'terms' => Lookups::terms(),
            'classes' => Lookups::classes(),
            'types' => Lookups::enum(Exam::TYPES),
            'statuses' => Lookups::enum(Exam::STATUSES),
            'defaults' => ['academic_year_id' => $year?->id, 'term_id' => Term::current()?->id],
            'canApprove' => $this->access->canApprove($request->user()),
            'stats' => [
                'total' => $yearQuery()->count(),
                'marks_entry' => $yearQuery()->where('status', 'marks_entry')->count(),
                'moderation' => $yearQuery()->where('status', 'moderation')->count(),
                'published' => $yearQuery()->where('status', 'published')->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        abort_unless($this->access->canApprove($request->user()), 403, 'Only academic administrators can create examinations.');
        $data = $this->validated($request);

        $exam = DB::transaction(function () use ($data) {
            $exam = Exam::create(collect($data)->except('class_ids')->all() + ['status' => 'draft']);
            $exam->classes()->sync($data['class_ids']);

            return $exam;
        });

        $this->audit('created', $exam, "Created exam {$exam->name}", 'exams');
        $this->toast("{$exam->name} created as draft.");

        return to_route('exams.show', $exam);
    }

    public function update(Request $request, Exam $exam): RedirectResponse
    {
        abort_unless($this->access->canApprove($request->user()), 403, 'Only academic administrators can edit examinations.');
        if ($exam->isPublished()) {
            $this->toast('Published exams are locked. Unpublish with a reason first.', 'error');

            return back();
        }

        $data = $this->validated($request, $exam);
        if ((float) $data['max_score'] !== (float) $exam->max_score && $exam->marks()->whereNotNull('score')->exists()) {
            throw ValidationException::withMessages(['max_score' => 'Maximum score cannot change after marks have been entered.']);
        }

        $old = $exam->only(['name', 'type', 'max_score', 'weight', 'start_date', 'end_date']);
        DB::transaction(function () use ($exam, $data) {
            $exam->update(collect($data)->except('class_ids')->all());
            $exam->classes()->sync($data['class_ids']);
        });

        $this->audit('updated', $exam, "Updated exam {$exam->name}", 'exams', $old, $exam->only(array_keys($old)));
        $this->toast('Exam updated.');

        return back();
    }

    public function destroy(Request $request, Exam $exam): RedirectResponse
    {
        abort_unless($this->access->canApprove($request->user()), 403);
        if ($exam->status !== 'draft' || $exam->marks()->exists()) {
            $this->toast('Only draft exams without marks can be deleted.', 'error');

            return back();
        }

        $exam->delete();
        $this->audit('deleted', $exam, "Deleted exam {$exam->name}", 'exams');
        $this->toast('Exam deleted.');

        return to_route('exams.index');
    }

    public function show(Request $request, Exam $exam): Response
    {
        $exam->load(['academicYear:id,name', 'term:id,name', 'classes:id,name,level', 'publisher:id,name']);
        $user = $request->user();

        $history = AuditLog::with('user:id,name')
            ->where('auditable_type', $exam->getMorphClass())->where('auditable_id', $exam->id)
            ->latest('created_at')->limit(15)
            ->get()
            ->map(fn ($l) => ['id' => $l->id, 'action' => $l->action, 'description' => $l->description, 'user' => $l->user?->name, 'created_at' => $l->created_at?->toIso8601String()]);

        $scopes = $this->access->markScopes($user);
        $classIds = $exam->classes->pluck('id')->all();
        $myAllocations = null;
        if ($scopes !== null) {
            $subjects = collect(Lookups::subjects())->keyBy('value');
            $streams = collect(Lookups::streams())->keyBy('value');
            $classNames = $exam->classes->pluck('name', 'id');
            $myAllocations = collect($scopes)->filter(fn ($s) => in_array($s['class_id'], $classIds, true))
                ->map(fn ($s) => $s + [
                    'label' => ($s['stream_id'] ? ($streams[$s['stream_id']]['label'] ?? '') : ($classNames[$s['class_id']] ?? '')).' · '.($subjects[$s['subject_id']]['label'] ?? ''),
                ])->values();
        }

        return Inertia::render('exams/show', [
            'exam' => $this->row($exam) + [
                'published_by' => $exam->publisher?->name,
                'term_id' => $exam->term_id,
                'academic_year_id' => $exam->academic_year_id,
            ],
            'progress' => $this->results->progress($exam),
            'history' => $history,
            'canApprove' => $this->access->canApprove($user),
            'canEnter' => $this->canEnterStatus($exam, $user),
            'myAllocations' => $myAllocations,
            'years' => Lookups::academicYears(),
            'terms' => Lookups::terms(),
            'classes' => Lookups::classes(),
            'types' => Lookups::enum(Exam::TYPES),
        ]);
    }

    /** Workflow transitions. Approvers only; return/unpublish require a reason. */
    public function transition(Request $request, Exam $exam): RedirectResponse
    {
        abort_unless($this->access->canApprove($request->user()), 403, 'Only principals / academic administrators can move exams through the results workflow.');

        $data = $request->validate([
            'action' => ['required', Rule::in(['open', 'submit', 'return', 'publish', 'unpublish', 'draft'])],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $map = [
            'open' => ['draft', 'marks_entry', 'Opened mark entry'],
            'draft' => ['marks_entry', 'draft', 'Returned to draft'],
            'submit' => ['marks_entry', 'moderation', 'Submitted for moderation'],
            'return' => ['moderation', 'marks_entry', 'Returned for mark corrections'],
            'publish' => ['moderation', 'published', 'Approved & published results'],
            'unpublish' => ['published', 'moderation', 'Unpublished results for correction'],
        ];
        [$from, $to, $label] = $map[$data['action']];

        if ($exam->status !== $from) {
            $this->toast("This exam is ".str_replace('_', ' ', $exam->status).' — that action is not available.', 'error');

            return back();
        }
        if (in_array($data['action'], ['return', 'unpublish'], true) && blank($data['reason'] ?? null)) {
            throw ValidationException::withMessages(['reason' => 'A reason is required for this action.']);
        }
        if ($data['action'] === 'draft' && $exam->marks()->exists()) {
            $this->toast('Marks have already been entered; the exam cannot return to draft.', 'error');

            return back();
        }
        if ($data['action'] === 'publish' && ! $exam->marks()->whereNotNull('score')->exists()) {
            $this->toast('No marks have been entered yet — nothing to publish.', 'error');

            return back();
        }

        $exam->status = $to;
        if ($to === 'published') {
            $exam->published_at = now();
            $exam->published_by = $request->user()->id;
        } elseif ($from === 'published') {
            $exam->published_at = null;
            $exam->published_by = null;
        }
        $exam->save();

        $this->audit($data['action'] === 'publish' ? 'published' : ($data['action'] === 'unpublish' ? 'unpublished' : 'status_changed'), $exam,
            $label.(filled($data['reason'] ?? null) ? ': '.$data['reason'] : ''), 'exams', ['status' => $from], ['status' => $to]);

        $notified = $to === 'published' ? $this->notifyPublication($exam) : 0;
        $this->toast($label.'.'.($notified ? " {$notified} parent/student account(s) notified." : ''));

        return back();
    }

    /** Alert guardians and students with portal accounts that results are out. */
    private function notifyPublication(Exam $exam): int
    {
        $studentIds = $exam->marks()->distinct()->pluck('student_id');
        $users = collect();
        Student::with(['guardians.user', 'user'])->whereIn('id', $studentIds)->chunkById(200, function ($students) use (&$users) {
            foreach ($students as $s) {
                if ($s->user) {
                    $users->push($s->user);
                }
                foreach ($s->guardians as $g) {
                    if ($g->user) {
                        $users->push($g->user);
                    }
                }
            }
        });
        $users = $users->unique('id');
        if ($users->isNotEmpty()) {
            Notification::send($users, new SchoolNotification('Results published', "{$exam->name} results are now available.", '/portal', 'success'));
        }

        return $users->count();
    }

    private function canEnterStatus(Exam $exam, ?\App\Models\User $user): bool
    {
        return $exam->status === 'marks_entry' || ($exam->status === 'moderation' && $this->access->canApprove($user));
    }

    /** @return array<string, mixed> */
    private function row(Exam $e): array
    {
        return [
            'id' => $e->id,
            'name' => $e->name,
            'type' => $e->type,
            'academic_year_id' => $e->academic_year_id,
            'term_id' => $e->term_id,
            'year' => $e->academicYear?->name,
            'term' => $e->term?->name,
            'start_date' => $e->start_date?->toDateString(),
            'end_date' => $e->end_date?->toDateString(),
            'max_score' => (float) $e->max_score,
            'weight' => (float) $e->weight,
            'status' => $e->status,
            'published_at' => $e->published_at?->toIso8601String(),
            'classes' => $e->classes->sortBy('level')->pluck('name')->values(),
            'class_ids' => $e->classes->pluck('id')->values(),
            'marks_count' => $e->marks_count ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Exam $exam = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'type' => ['required', Rule::in(Exam::TYPES)],
            'academic_year_id' => ['required', Rule::exists('academic_years', 'id')->where('school_id', $schoolId)],
            'term_id' => ['nullable', Rule::exists('terms', 'id')->where('school_id', $schoolId)->where('academic_year_id', $request->input('academic_year_id'))],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'max_score' => ['required', 'numeric', 'min:1', 'max:1000'],
            'weight' => ['required', 'numeric', 'min:0', 'max:100'],
            'class_ids' => ['required', 'array', 'min:1'],
            'class_ids.*' => ['integer', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
        ], [], ['academic_year_id' => 'academic year', 'term_id' => 'term', 'class_ids' => 'classes']);
    }
}
