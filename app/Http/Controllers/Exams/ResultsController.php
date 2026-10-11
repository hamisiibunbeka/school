<?php

namespace App\Http\Controllers\Exams;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\Term;
use App\Services\Exams\ResultsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Class results analysis and printable report cards (SRS 4.6, acceptance 15.2). */
class ResultsController extends Controller
{
    public function __construct(private ResultsService $results) {}

    public function show(Request $request, Exam $exam): Response
    {
        $exam->load(['classes' => fn ($q) => $q->with('streams:id,school_class_id,name')->orderBy('level'), 'term:id,name', 'academicYear:id,name']);

        $classId = $request->integer('class') ?: $exam->classes->first()?->id;
        if ($classId && ! $exam->classes->contains('id', $classId)) {
            $classId = $exam->classes->first()?->id;
        }
        $streamId = $request->integer('stream') ?: null;

        return Inertia::render('exams/results', [
            'exam' => $this->examInfo($exam),
            'filters' => ['class' => $classId ? (string) $classId : '', 'stream' => $streamId ? (string) $streamId : ''],
            'classes' => $this->classOptions($exam),
            'analysis' => $classId ? $this->results->classResults($exam, $classId, $streamId) : null,
            'scale' => $this->results->scale()->map(fn ($g) => ['grade' => $g->grade, 'min' => (float) $g->min_score, 'max' => (float) $g->max_score, 'points' => (float) $g->points, 'remark' => $g->remark])->values(),
        ]);
    }

    public function reportCards(Request $request): Response
    {
        $exams = Exam::with(['classes' => fn ($q) => $q->with('streams:id,school_class_id,name')->orderBy('level'), 'term:id,name', 'academicYear:id,name'])
            ->orderByRaw("status = 'published' DESC")->orderByDesc('start_date')->get();

        $exam = $exams->firstWhere('id', $request->integer('exam')) ?? null;
        $classId = $request->integer('class') ?: null;
        $streamId = $request->integer('stream') ?: null;
        $studentId = $request->integer('student') ?: null;

        if ($exam && $studentId && ! $classId) {
            $classId = ExamMark::where('exam_id', $exam->id)->where('student_id', $studentId)->value('school_class_id');
        }
        if ($exam && $classId && ! $exam->classes->contains('id', $classId)) {
            $classId = null;
        }

        $cards = [];
        $studentOptions = [];
        $context = null;
        if ($exam && $classId) {
            $analysis = $this->results->classResults($exam, $classId, $streamId);
            $studentOptions = collect($analysis['students'])->map(fn ($s) => ['value' => $s['id'], 'label' => "{$s['full_name']} · {$s['admission_no']}"])->values();
            $students = collect($analysis['students'])->when($studentId, fn ($c) => $c->where('id', $studentId))->values();

            // Attendance for the exam's term (to date).
            [$from, $to] = $this->termRange($exam);
            $attendance = $from
                ? DB::table('attendance_records')->where('school_id', $this->tenancy()->schoolId())
                    ->whereIn('student_id', $students->pluck('id'))->whereBetween('date', [$from, $to])
                    ->selectRaw('student_id, status, COUNT(*) as total')->groupBy('student_id', 'status')->get()->groupBy('student_id')
                : collect();

            $teachersByStream = [];
            $subjects = collect($analysis['subjects'])->keyBy('id');
            $classTeacher = DB::table('streams')->leftJoin('employees', 'employees.id', '=', 'streams.class_teacher_id')
                ->where('streams.school_id', $this->tenancy()->schoolId())->where('streams.school_class_id', $classId)
                ->selectRaw("streams.id, CONCAT(employees.first_name, ' ', employees.last_name) as name")->pluck('name', 'streams.id');

            foreach ($students as $s) {
                $sid = $s['stream_id'] ? (int) $s['stream_id'] : null;
                $teachersByStream[$sid ?? 0] ??= $this->results->subjectTeachers($classId, $sid);
                $att = collect($attendance->get($s['id'], []))->pluck('total', 'status');
                $days = (int) $att->sum();

                $cards[] = $s + [
                    'class_teacher' => $sid ? ($classTeacher[$sid] ?? null) : null,
                    'subjects' => collect($s['marks'])->filter()->map(fn ($m, $subjectId) => $m + [
                        'subject' => $subjects[$subjectId]['name'] ?? '',
                        'teacher' => $teachersByStream[$sid ?? 0][$subjectId] ?? null,
                        'remark' => $m['is_absent'] ? 'Absent' : ($m['percentage'] !== null ? ($this->results->grade($m['percentage'])['remark'] ?? null) : null),
                    ])->values()->all(),
                    'attendance' => [
                        'days' => $days,
                        'present' => (int) ($att['present'] ?? 0),
                        'late' => (int) ($att['late'] ?? 0),
                        'absent' => (int) ($att['absent'] ?? 0),
                        'excused' => (int) ($att['excused'] ?? 0),
                        'rate' => $days ? round((($att['present'] ?? 0) + ($att['late'] ?? 0)) / $days * 100, 1) : null,
                    ],
                    'comment' => $this->comment($s['average'], $s['first_name'] ?? explode(' ', $s['full_name'])[0]),
                ];
                unset($cards[array_key_last($cards)]['marks']);
            }

            $context = [
                'class_size' => $analysis['summary']['class_size'],
                'class_average' => $analysis['summary']['average'],
                'next_term' => $this->nextTermOpening($exam),
                'term_range' => $from ? [$from, $to] : null,
            ];
        }

        return Inertia::render('exams/report-cards', [
            'exams' => $exams->map(fn ($e) => [
                'value' => $e->id,
                'label' => "{$e->name} — {$e->academicYear?->name}".($e->status !== 'published' ? ' (provisional)' : ''),
                'status' => $e->status,
                'classes' => $e->classes->map(fn ($c) => ['value' => $c->id, 'label' => $c->name, 'streams' => $c->streams->map(fn ($s) => ['value' => $s->id, 'label' => $s->name])->values()])->values(),
            ])->values(),
            'exam' => $exam ? $this->examInfo($exam) : null,
            'filters' => [
                'exam' => $exam ? (string) $exam->id : '',
                'class' => $classId ? (string) $classId : '',
                'stream' => $streamId ? (string) $streamId : '',
                'student' => $studentId ? (string) $studentId : '',
            ],
            'students' => $studentOptions,
            'cards' => $cards,
            'context' => $context,
            'scale' => $this->results->scale()->map(fn ($g) => ['grade' => $g->grade, 'min' => (float) $g->min_score, 'max' => (float) $g->max_score, 'points' => (float) $g->points, 'remark' => $g->remark])->values(),
        ]);
    }

    /** @return array<string, mixed> */
    private function examInfo(Exam $exam): array
    {
        return [
            'id' => $exam->id,
            'name' => $exam->name,
            'type' => $exam->type,
            'status' => $exam->status,
            'term' => $exam->term?->name,
            'year' => $exam->academicYear?->name,
            'max_score' => (float) $exam->max_score,
            'start_date' => $exam->start_date?->toDateString(),
            'end_date' => $exam->end_date?->toDateString(),
            'published_at' => $exam->published_at?->toIso8601String(),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function classOptions(Exam $exam): array
    {
        return $exam->classes->map(fn ($c) => [
            'value' => $c->id,
            'label' => $c->name,
            'streams' => $c->streams->map(fn ($s) => ['value' => $s->id, 'label' => $s->name])->values(),
        ])->values()->all();
    }

    /** @return array{0:?string, 1:?string} */
    private function termRange(Exam $exam): array
    {
        $term = $exam->term_id ? Term::find($exam->term_id) : null;
        if (! $term) {
            return [null, null];
        }
        $to = min($term->end_date->toDateString(), now()->toDateString());

        return [$term->start_date->toDateString(), $to];
    }

    private function nextTermOpening(Exam $exam): ?string
    {
        $term = $exam->term_id ? Term::find($exam->term_id) : null;
        if ($term) {
            $next = Term::whereDate('start_date', '>', $term->end_date)->orderBy('start_date')->first();
            if ($next) {
                return $next->start_date->toDateString();
            }
        }
        $setting = $this->tenancy()->school()?->setting('next_term_opens');

        return is_string($setting) ? $setting : null;
    }

    /** Suggested class-teacher comment; teachers can overwrite it on the printed card. */
    private function comment(?float $average, string $name): ?string
    {
        if ($average === null) {
            return null;
        }

        return match (true) {
            $average >= 75 => "Excellent performance, {$name}. Keep up the outstanding work.",
            $average >= 65 => "Very good work, {$name}. Aim even higher next term.",
            $average >= 45 => "Good effort, {$name}. More consistency will raise your grades.",
            $average >= 30 => "{$name} needs to work harder and seek help in weaker subjects.",
            default => "Performance is below expectation. {$name} needs close follow-up from school and home.",
        };
    }
}
