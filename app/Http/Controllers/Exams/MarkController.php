<?php

namespace App\Http\Controllers\Exams;

use App\Http\Controllers\Controller;
use App\Models\ClassSubject;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\Student;
use App\Models\Subject;
use App\Models\User;
use App\Services\Exams\ResultsService;
use App\Services\Exams\TeacherAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Mark entry grid. Open while the exam is in marks_entry (teachers: own allocations
 * only) or moderation (approvers only). Published exams are locked.
 */
class MarkController extends Controller
{
    public function __construct(private TeacherAccess $access, private ResultsService $results) {}

    public function index(Request $request, Exam $exam): Response
    {
        $exam->load(['classes' => fn ($q) => $q->with('streams:id,school_class_id,name')->orderBy('level'), 'term:id,name', 'academicYear:id,name']);
        $user = $request->user();
        $scopes = $this->access->markScopes($user);

        $classId = $request->integer('class') ?: null;
        $streamId = $request->integer('stream') ?: null;
        $subjectId = $request->integer('subject') ?: null;
        if ($classId && ! $exam->classes->contains('id', $classId)) {
            $classId = $streamId = $subjectId = null;
        }

        // Class/stream options (teachers: only where they teach something).
        $classes = $exam->classes->map(function ($c) use ($scopes) {
            $streams = $c->streams->map(fn ($s) => ['value' => $s->id, 'label' => $s->name]);
            if ($scopes !== null) {
                $mine = collect($scopes)->where('class_id', $c->id);
                if ($mine->isEmpty()) {
                    return null;
                }
                if (! $mine->contains(fn ($s) => $s['stream_id'] === null)) {
                    $streams = $streams->filter(fn ($s) => $mine->pluck('stream_id')->contains($s['value']));
                }
            }

            return ['value' => $c->id, 'label' => $c->name, 'streams' => $streams->values()->all()];
        })->filter()->values();

        $subjects = [];
        if ($classId) {
            $ids = ClassSubject::where('school_class_id', $classId)
                ->when($scopes !== null, fn ($q) => $q->where('employee_id', $this->access->employeeId($user)))
                ->pluck('subject_id')->unique();
            $subjects = Subject::whereIn('id', $ids)->orderBy('name')->get(['id', 'name', 'code'])
                ->map(fn ($s) => ['value' => $s->id, 'label' => $s->code ? "{$s->name} ({$s->code})" : $s->name])->values();
        }

        $roster = [];
        $canEdit = false;
        $lockReason = $this->lockReason($exam, $user);
        $teacher = null;
        if ($classId && $subjectId) {
            $allowed = $this->access->canEnterMarks($user, $classId, $streamId, $subjectId);
            if (! $allowed) {
                $lockReason ??= $scopes !== null && ! $streamId
                    ? 'You are allocated to specific streams for this subject — choose your stream.'
                    : 'This subject is not allocated to you for this class.';
            }
            $canEdit = $allowed && $lockReason === null;

            $marks = ExamMark::with('enteredBy:id,name')->where('exam_id', $exam->id)->where('school_class_id', $classId)->where('subject_id', $subjectId)->get()->keyBy('student_id');
            $students = Student::withTrashed()->with('stream:id,name')
                ->where(fn ($q) => $q->whereIn('id', $marks->keys())
                    ->orWhere(fn ($w) => $w->where('school_class_id', $classId)->where('status', 'active')->whereNull('deleted_at')))
                ->when($streamId, fn ($q) => $q->where('stream_id', $streamId))
                ->orderBy('first_name')->orderBy('last_name')
                ->get();

            $roster = $students->map(fn (Student $s) => [
                'id' => $s->id,
                'admission_no' => $s->admission_no,
                'full_name' => $s->full_name,
                'stream' => $s->stream?->name,
                'score' => $marks->get($s->id)?->score !== null ? (float) $marks->get($s->id)->score : null,
                'is_absent' => (bool) $marks->get($s->id)?->is_absent,
                'remarks' => $marks->get($s->id)?->remarks,
                'grade' => $marks->get($s->id)?->grade,
                'entered_by' => $marks->get($s->id)?->enteredBy?->name,
            ])->values();

            $teacher = $this->results->subjectTeachers($classId, $streamId)[$subjectId] ?? null;
        }

        return Inertia::render('exams/marks', [
            'exam' => [
                'id' => $exam->id,
                'name' => $exam->name,
                'status' => $exam->status,
                'max_score' => (float) $exam->max_score,
                'term' => $exam->term?->name,
                'year' => $exam->academicYear?->name,
            ],
            'filters' => ['class' => $classId ? (string) $classId : '', 'stream' => $streamId ? (string) $streamId : '', 'subject' => $subjectId ? (string) $subjectId : ''],
            'classes' => $classes,
            'subjects' => $subjects,
            'roster' => $roster,
            'canEdit' => $canEdit,
            'lockReason' => $lockReason,
            'teacher' => $teacher,
            'scale' => $this->results->scale()->map(fn ($g) => ['grade' => $g->grade, 'min' => (float) $g->min_score, 'max' => (float) $g->max_score, 'points' => (float) $g->points, 'remark' => $g->remark])->values(),
        ]);
    }

    public function store(Request $request, Exam $exam): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $user = $request->user();
        $max = (float) $exam->max_score;

        $data = $request->validate([
            'school_class_id' => ['required', 'integer', Rule::in($exam->classes()->pluck('school_classes.id')->all())],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'subject_id' => ['required', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'marks' => ['required', 'array', 'min:1'],
            'marks.*.student_id' => ['required', 'integer'],
            'marks.*.score' => ['nullable', 'numeric', 'min:0', "max:{$max}"],
            'marks.*.is_absent' => ['boolean'],
            'marks.*.remarks' => ['nullable', 'string', 'max:255'],
        ], ['marks.*.score.max' => "Scores cannot exceed the maximum of {$max}."], ['marks.*.score' => 'score', 'school_class_id' => 'class']);

        if ($reason = $this->lockReason($exam, $user)) {
            $this->toast($reason, 'error');

            return back();
        }

        $classId = (int) $data['school_class_id'];
        $streamId = isset($data['stream_id']) ? (int) $data['stream_id'] : null;
        $subjectId = (int) $data['subject_id'];
        abort_unless($this->access->canEnterMarks($user, $classId, $streamId, $subjectId), 403, 'You can only enter marks for your allocated class/subject.');

        $existing = ExamMark::where('exam_id', $exam->id)->where('subject_id', $subjectId)->where('school_class_id', $classId)->get()->keyBy('student_id');
        $valid = Student::withTrashed()
            ->where(fn ($q) => $q->whereIn('id', $existing->keys())->orWhere('school_class_id', $classId))
            ->when($streamId, fn ($q) => $q->where('stream_id', $streamId))
            ->whereIn('id', collect($data['marks'])->pluck('student_id'))
            ->pluck('id')->flip();

        $now = now();
        $rows = [];
        $changes = [];
        foreach ($data['marks'] as $m) {
            if (! isset($valid[$m['student_id']])) {
                continue;
            }
            $absent = (bool) ($m['is_absent'] ?? false);
            $score = $absent || ! isset($m['score']) || $m['score'] === '' ? null : round((float) $m['score'], 2);
            $old = $existing->get($m['student_id']);
            if (! $old && $score === null && ! $absent) {
                continue; // nothing entered yet
            }
            $grade = $score !== null ? $this->results->grade($this->results->percentage($exam, $score)) : null;

            if ($old && ((float) $old->score !== (float) $score || (bool) $old->is_absent !== $absent || ($old->score === null) !== ($score === null))) {
                $changes[$m['student_id']] = ['from' => $old->is_absent ? 'ABS' : $old->score, 'to' => $absent ? 'ABS' : $score];
            }

            $rows[] = [
                'tenant_id' => $this->tenancy()->tenantId(),
                'school_id' => $schoolId,
                'exam_id' => $exam->id,
                'student_id' => $m['student_id'],
                'subject_id' => $subjectId,
                'school_class_id' => $classId,
                'score' => $score,
                'is_absent' => $absent,
                'grade' => $grade['grade'] ?? null,
                'points' => $grade['points'] ?? null,
                'remarks' => $m['remarks'] ?? null,
                'entered_by' => $user->id,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if (! $rows) {
            throw ValidationException::withMessages(['marks' => 'Enter at least one score or mark a student absent.']);
        }

        DB::transaction(fn () => DB::table('exam_marks')->upsert($rows, ['exam_id', 'student_id', 'subject_id'],
            ['school_class_id', 'score', 'is_absent', 'grade', 'points', 'remarks', 'entered_by', 'updated_at']));

        $subject = Subject::find($subjectId)?->name;
        $this->audit($changes && $exam->status === 'moderation' ? 'moderated' : 'marks_entered', $exam,
            "Saved {$subject} marks (".count($rows).' students'.($changes ? ', '.count($changes).' changed' : '').')', 'exams',
            $changes ? collect($changes)->map(fn ($c) => $c['from'])->all() : null,
            $changes ? collect($changes)->map(fn ($c) => $c['to'])->all() : null);

        $this->toast("{$subject} marks saved for ".count($rows).' students.');

        return back();
    }

    private function lockReason(Exam $exam, ?User $user): ?string
    {
        return match ($exam->status) {
            'draft' => 'Mark entry has not been opened for this exam yet.',
            'published' => 'Results are published and locked. An approver must unpublish (with a reason) before corrections.',
            'moderation' => $this->access->canApprove($user) ? null : 'This exam is under moderation — only moderators can change marks now.',
            default => null,
        };
    }
}
