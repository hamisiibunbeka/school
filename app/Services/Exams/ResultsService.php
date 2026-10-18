<?php

namespace App\Services\Exams;

use App\Models\ClassSubject;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\GradeScale;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Student;
use App\Models\Subject;
use App\Support\EducationLevel;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Computes examination results from stored marks.
 *
 * Rules (documented for schools, SRS 4.6 / 15.2):
 * - Percentage = score / exam.max_score × 100.
 * - Subject grade & points come from the school's grade scale and are FROZEN on the
 *   exam_marks row when the mark is saved, so editing the grade scale later never
 *   silently changes previously published results.
 * - Student average = mean percentage of subjects sat (absent subjects excluded).
 * - O-Level division (NECTA CSEE): add the points of the best 7 subjects sat
 *   (lowest points = best). 7–17 → I, 18–21 → II, 22–25 → III, 26–33 → IV, 34–35 → 0.
 *   Students who sat fewer than 7 subjects get "INC" (incomplete).
 * - A-Level division (NECTA ACSEE): each student takes the subjects of their stream's
 *   combination. Add the points (A=1 … F=7) of the 3 principal subjects; General
 *   Studies and BAM are subsidiaries — graded and shown but never counted.
 *   3–9 → I, 10–12 → II, 13–17 → III, 18–19 → IV, 20–21 → 0. Fewer than 3 principal
 *   subjects sat → "INC". Verified against NECTA's published ACSEE results.
 * - Position: O-Level ranks by average; A-Level ranks by division points (fewest
 *   first), then by average. Ties share a position (1, 2, 2, 4); students who sat
 *   nothing are not ranked.
 * - Pass mark = lowest min_score of every grade except the failing grade (the grade
 *   with the highest points value). With the default NECTA scale that is 30% (D).
 */
class ResultsService
{
    public const BEST_OF = 7;

    public const A_LEVEL_PRINCIPALS = 3;

    /** @var array<string, Collection> */
    private array $scales = [];

    /** Grade scale rows of an education level, best grade first. */
    public function scale(string $level = EducationLevel::O_LEVEL): Collection
    {
        return $this->scales[$level] ??= GradeScale::where('education_level', $level)->orderByDesc('min_score')->get();
    }

    /** @return array{grade:string, points:float, remark:?string}|null */
    public function grade(?float $percentage, string $level = EducationLevel::O_LEVEL): ?array
    {
        if ($percentage === null) {
            return null;
        }

        $scale = $this->scale($level);
        $row = $scale->first(fn ($g) => (float) $g->min_score <= $percentage && (float) $g->max_score >= $percentage)
            ?? $scale->first(fn ($g) => (float) $g->min_score <= $percentage);

        return $row ? ['grade' => $row->grade, 'points' => (float) $row->points, 'remark' => $row->remark] : null;
    }

    public function percentage(Exam $exam, float|string|null $score): ?float
    {
        if ($score === null || $score === '') {
            return null;
        }
        $max = (float) $exam->max_score ?: 100;

        return round((float) $score / $max * 100, 2);
    }

    public function passMark(string $level = EducationLevel::O_LEVEL): float
    {
        $scale = $this->scale($level);
        if ($scale->isEmpty()) {
            return 30.0;
        }
        $failPoints = $scale->max(fn ($g) => (float) $g->points);
        // A-Level: a subsidiary pass (S) is not a principal pass.
        $passing = $scale->filter(fn ($g) => (float) $g->points < $failPoints && ($level !== EducationLevel::A_LEVEL || $g->grade !== 'S'));

        return $passing->isEmpty() ? 0.0 : (float) $passing->min(fn ($g) => (float) $g->min_score);
    }

    /**
     * @param  array<int, float>  $points  points of every subject sat
     * @return array{division:string, points:?float}
     */
    public function division(array $points, string $level = EducationLevel::O_LEVEL): array
    {
        if ($level === EducationLevel::A_LEVEL) {
            return $this->aLevelDivision($points);
        }

        if (count($points) < self::BEST_OF) {
            return ['division' => 'INC', 'points' => count($points) ? array_sum($points) : null];
        }
        sort($points);
        $total = array_sum(array_slice($points, 0, self::BEST_OF));

        $division = match (true) {
            $total <= 17 => 'I',
            $total <= 21 => 'II',
            $total <= 25 => 'III',
            $total <= 33 => 'IV',
            default => '0',
        };

        return ['division' => $division, 'points' => $total];
    }

    /**
     * ACSEE: sum of the 3 principal subjects' points (best 3 if a combination has more).
     *
     * @param  array<int, float>  $principalPoints
     * @return array{division:string, points:?float}
     */
    public function aLevelDivision(array $principalPoints): array
    {
        if (count($principalPoints) < self::A_LEVEL_PRINCIPALS) {
            return ['division' => 'INC', 'points' => count($principalPoints) ? array_sum($principalPoints) : null];
        }
        sort($principalPoints);
        $total = array_sum(array_slice($principalPoints, 0, self::A_LEVEL_PRINCIPALS));

        $division = match (true) {
            $total <= 9 => 'I',
            $total <= 12 => 'II',
            $total <= 17 => 'III',
            $total <= 19 => 'IV',
            default => '0',
        };

        return ['division' => $division, 'points' => $total];
    }

    /**
     * A-Level class: combination of each stream (stream_id => [code, principal ids, all subject ids]).
     *
     * @return array<int, array{code:string, principal:array<int,int>, subjects:array<int,int>}>
     */
    public function streamCombinations(int $classId): array
    {
        return Stream::with('combination.items')->where('school_class_id', $classId)->whereNotNull('combination_id')->get()
            ->mapWithKeys(fn (Stream $s) => [$s->id => [
                'code' => $s->combination->code,
                'principal' => $s->combination->principalIds(),
                'subjects' => $s->combination->subjectIds(),
            ]])->all();
    }

    /** Subjects offered in a class (from allocations), plus any subject already holding marks. */
    public function classSubjects(Exam $exam, int $classId): Collection
    {
        $ids = ClassSubject::where('school_class_id', $classId)->pluck('subject_id')
            ->merge(ExamMark::where('exam_id', $exam->id)->where('school_class_id', $classId)->distinct()->pluck('subject_id'))
            ->merge(collect($this->streamCombinations($classId))->pluck('subjects')->flatten())
            ->unique()->values();

        return Subject::whereIn('id', $ids)->orderBy('name')->get(['id', 'name', 'code']);
    }

    /**
     * Full class analysis for one exam.
     *
     * @return array<string, mixed>
     */
    public function classResults(Exam $exam, int $classId, ?int $streamId = null): array
    {
        $level = EducationLevel::forClass($classId);
        $aLevel = $level === EducationLevel::A_LEVEL;
        $combos = $aLevel ? $this->streamCombinations($classId) : [];
        $subjects = $this->classSubjects($exam, $classId);
        $marks = ExamMark::where('exam_id', $exam->id)->where('school_class_id', $classId)->get()->groupBy('student_id');

        $studentQuery = Student::withTrashed()->with('stream:id,name')
            ->where(function ($q) use ($marks, $classId, $exam) {
                $q->whereIn('id', $marks->keys());
                if (! $exam->isPublished()) {
                    $q->orWhere(fn ($w) => $w->where('school_class_id', $classId)->where('status', 'active')->whereNull('deleted_at'));
                }
            });
        $students = $studentQuery->orderBy('first_name')->orderBy('last_name')->get();

        $passMark = $this->passMark($level);
        $rows = [];

        foreach ($students as $student) {
            $studentMarks = $marks->get($student->id, collect())->keyBy('subject_id');
            $combo = $aLevel ? ($combos[$student->stream_id] ?? null) : null;
            $cells = [];
            $percentages = [];
            $points = [];
            $total = 0.0;

            foreach ($subjects as $subject) {
                $m = $studentMarks->get($subject->id);
                // A-Level: only the subjects of the student's own combination count.
                if (! $m || ($aLevel && (! $combo || ! in_array($subject->id, $combo['subjects'], true)))) {
                    $cells[$subject->id] = null;

                    continue;
                }
                $principal = ! $aLevel || in_array($subject->id, $combo['principal'], true);
                $pct = $m->is_absent ? null : $this->percentage($exam, $m->score);
                $grade = $m->grade ?? $this->grade($pct, $level)['grade'] ?? null;
                $pts = $m->points !== null ? (float) $m->points : ($this->grade($pct, $level)['points'] ?? null);

                $cells[$subject->id] = [
                    'role' => $aLevel ? ($principal ? 'principal' : 'subsidiary') : null,
                    'score' => $m->score !== null ? (float) $m->score : null,
                    'percentage' => $pct,
                    'grade' => $m->is_absent ? 'ABS' : $grade,
                    'points' => $m->is_absent ? null : $pts,
                    'is_absent' => (bool) $m->is_absent,
                    'remarks' => $m->remarks,
                ];

                // A-Level: average, total and division use principal subjects only.
                if ($pct !== null && $principal) {
                    $percentages[] = $pct;
                    $total += (float) $m->score;
                    if ($pts !== null) {
                        $points[] = $pts;
                    }
                }
            }

            $average = $percentages ? round(array_sum($percentages) / count($percentages), 2) : null;
            $division = $this->division($points, $level);
            $overall = $this->grade($average, $level);

            $rows[] = [
                'id' => $student->id,
                'admission_no' => $student->admission_no,
                'full_name' => $student->full_name,
                'gender' => $student->gender,
                'stream_id' => $student->stream_id,
                'stream' => $student->stream?->name,
                'combination' => $combo['code'] ?? null,
                'marks' => $cells,
                'sat' => count($percentages),
                'total' => round($total, 2),
                'average' => $average,
                'grade' => $overall['grade'] ?? null,
                'remark' => $overall['remark'] ?? null,
                'points' => $division['points'],
                'division' => $division['division'],
                'passed' => $aLevel ? in_array($division['division'], ['I', 'II', 'III', 'IV'], true) : ($average !== null && $average >= $passMark),
                'position' => null,
            ];
        }

        // Competition ranking across the whole class (A-Level: fewest division points first).
        $key = fn ($r) => $aLevel ? [$r['division'] === 'INC' ? 1 : 0, $r['points'] ?? PHP_INT_MAX, -$r['average']] : [-$r['average']];
        $ranked = collect($rows)->filter(fn ($r) => $r['average'] !== null)->sort(fn ($a, $b) => $key($a) <=> $key($b))->values();
        $positions = [];
        $prev = null;
        $rank = 0;
        foreach ($ranked as $i => $r) {
            if ($prev === null || $key($r) !== $prev) {
                $rank = $i + 1;
            }
            $positions[$r['id']] = $rank;
            $prev = $key($r);
        }
        $classSize = count($positions);
        foreach ($rows as &$r) {
            $r['position'] = $positions[$r['id']] ?? null;
        }
        unset($r);

        if ($streamId) {
            $rows = array_values(array_filter($rows, fn ($r) => (int) $r['stream_id'] === $streamId));
        }
        usort($rows, fn ($a, $b) => ($a['position'] ?? PHP_INT_MAX) <=> ($b['position'] ?? PHP_INT_MAX) ?: strcmp($a['full_name'], $b['full_name']));

        $teachers = $this->subjectTeachers($classId, $streamId);
        $grades = $this->scale($level)->pluck('grade')->all();

        $subjectStats = $subjects->map(function ($subject) use ($rows, $passMark, $grades, $teachers, $level) {
            $cells = collect($rows)->pluck("marks.{$subject->id}")->filter();
            $sat = $cells->where('is_absent', false)->whereNotNull('percentage');
            $dist = array_fill_keys($grades, 0);
            foreach ($sat as $c) {
                if (isset($dist[$c['grade']])) {
                    $dist[$c['grade']]++;
                }
            }

            return [
                'id' => $subject->id,
                'name' => $subject->name,
                'code' => $subject->code,
                'teacher' => $teachers[$subject->id] ?? null,
                'entered' => $cells->count(),
                'sat' => $sat->count(),
                'absent' => $cells->where('is_absent', true)->count(),
                'average' => $sat->count() ? round($sat->avg('percentage'), 1) : null,
                'highest' => $sat->count() ? $sat->max('percentage') : null,
                'lowest' => $sat->count() ? $sat->min('percentage') : null,
                'pass_rate' => $sat->count() ? round($sat->filter(fn ($c) => $c['percentage'] >= $passMark)->count() / $sat->count() * 100, 1) : null,
                'grade' => $sat->count() ? ($this->grade(round($sat->avg('percentage'), 2), $level)['grade'] ?? null) : null,
                // NECTA-style subject GPA: mean grade points (A-Level: A=1 … F=7; lower is better).
                'gpa' => $sat->whereNotNull('points')->count() ? round($sat->whereNotNull('points')->avg('points'), 4) : null,
                'distribution' => $dist,
            ];
        })->values()->all();

        $ranked = collect($rows)->whereNotNull('average');
        $gradeDistribution = array_fill_keys($grades, 0);
        foreach ($ranked as $r) {
            if (isset($gradeDistribution[$r['grade']])) {
                $gradeDistribution[$r['grade']]++;
            }
        }
        $divisions = array_fill_keys(['I', 'II', 'III', 'IV', '0', 'INC'], 0);
        foreach ($ranked as $r) {
            $divisions[$r['division']]++;
        }

        $byCombination = [];
        if ($aLevel) {
            foreach ($ranked as $r) {
                $code = $r['combination'] ?? '—';
                $byCombination[$code] ??= array_fill_keys(['I', 'II', 'III', 'IV', '0', 'INC'], 0);
                $byCombination[$code][$r['division']]++;
            }
            ksort($byCombination);
        }

        return [
            'level' => $level,
            'combinations' => $byCombination,
            'unassigned' => $aLevel ? collect($rows)->whereNull('combination')->count() : 0,
            'subjects' => $subjects->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'code' => $s->code ?: $s->name])->values()->all(),
            'students' => $rows,
            'subjectStats' => $subjectStats,
            'gradeDistribution' => $gradeDistribution,
            'divisions' => $divisions,
            'summary' => [
                'students' => count($rows),
                'ranked' => $ranked->count(),
                'class_size' => $classSize,
                'average' => $ranked->count() ? round($ranked->avg('average'), 1) : null,
                'pass_rate' => $ranked->count() ? round($ranked->where('passed', true)->count() / $ranked->count() * 100, 1) : null,
                'highest' => $ranked->max('average'),
                'lowest' => $ranked->min('average'),
                'pass_mark' => $passMark,
            ],
        ];
    }

    /** @return array<int, string> subject_id => teacher name (stream allocation wins over class-wide). */
    public function subjectTeachers(int $classId, ?int $streamId = null): array
    {
        return ClassSubject::with('teacher:id,first_name,last_name')
            ->where('school_class_id', $classId)
            ->where(fn ($q) => $q->whereNull('stream_id')->when($streamId, fn ($w) => $w->orWhere('stream_id', $streamId)))
            ->orderByRaw('stream_id IS NULL DESC')
            ->get()
            ->filter(fn ($cs) => $cs->teacher)
            ->mapWithKeys(fn ($cs) => [$cs->subject_id => $cs->teacher->full_name])
            ->all();
    }

    /**
     * Mark-entry completion per class × subject.
     *
     * @return array{subjects: array<int, array{id:int, name:string, code:string}>, rows: array<int, array<string, mixed>>, overall: float}
     */
    public function progress(Exam $exam): array
    {
        $schoolId = $exam->school_id;
        $classes = $exam->classes()->orderBy('level')->get();

        $entered = DB::table('exam_marks')->where('school_id', $schoolId)->where('exam_id', $exam->id)
            ->where(fn ($q) => $q->whereNotNull('score')->orWhere('is_absent', true))
            ->selectRaw('school_class_id, subject_id, COUNT(*) as total')
            ->groupBy('school_class_id', 'subject_id')->get()
            ->groupBy('school_class_id');

        $sitting = DB::table('exam_marks')->where('school_id', $schoolId)->where('exam_id', $exam->id)
            ->selectRaw('school_class_id, COUNT(DISTINCT student_id) as total')->groupBy('school_class_id')->pluck('total', 'school_class_id');

        $active = DB::table('students')->where('school_id', $schoolId)->where('status', 'active')->whereNull('deleted_at')
            ->selectRaw('school_class_id, COUNT(*) as total')->groupBy('school_class_id')->pluck('total', 'school_class_id');

        $offered = DB::table('class_subjects')->where('school_id', $schoolId)->whereIn('school_class_id', $classes->pluck('id'))
            ->select('school_class_id', 'subject_id')->distinct()->get()->groupBy('school_class_id');

        $subjectIds = collect($offered)->flatten(1)->pluck('subject_id')
            ->merge(collect($entered)->flatten(1)->pluck('subject_id'))->unique();
        $subjects = Subject::whereIn('id', $subjectIds)->orderBy('name')->get(['id', 'name', 'code']);

        $done = 0;
        $expectedAll = 0;
        $rows = $classes->map(function (SchoolClass $class) use ($subjects, $entered, $sitting, $active, $offered, $exam, &$done, &$expectedAll) {
            $expected = $exam->isPublished()
                ? (int) ($sitting[$class->id] ?? 0)
                : max((int) ($active[$class->id] ?? 0), (int) ($sitting[$class->id] ?? 0));
            $classOffered = collect($offered->get($class->id, []))->pluck('subject_id')->map(fn ($v) => (int) $v)->all();
            $classEntered = collect($entered->get($class->id, []))->pluck('total', 'subject_id');

            // A-Level: each subject is expected only from students whose combination includes it.
            $perSubject = null;
            if ($class->isALevel()) {
                $streamCounts = Student::where('school_class_id', $class->id)->where('status', 'active')->whereNotNull('stream_id')
                    ->selectRaw('stream_id, COUNT(*) as total')->groupBy('stream_id')->pluck('total', 'stream_id');
                $perSubject = [];
                foreach ($this->streamCombinations($class->id) as $streamId => $combo) {
                    foreach ($combo['subjects'] as $sid) {
                        $perSubject[$sid] = ($perSubject[$sid] ?? 0) + (int) ($streamCounts[$streamId] ?? 0);
                    }
                }
            }

            $cells = [];
            foreach ($subjects as $subject) {
                $isOffered = in_array($subject->id, $classOffered, true) || isset($classEntered[$subject->id]);
                $count = (int) ($classEntered[$subject->id] ?? 0);
                $subjectExpected = $expected;
                if ($perSubject !== null) {
                    $isOffered = isset($perSubject[$subject->id]) || isset($classEntered[$subject->id]);
                    $subjectExpected = $exam->isPublished() ? $count : max($perSubject[$subject->id] ?? 0, $count);
                }
                if ($isOffered) {
                    $done += min($count, $subjectExpected);
                    $expectedAll += $subjectExpected;
                }
                $cells[$subject->id] = $isOffered ? [
                    'entered' => $count,
                    'expected' => $subjectExpected,
                    'percent' => $subjectExpected ? min(100, round($count / $subjectExpected * 100)) : 0,
                ] : null;
            }

            return ['class_id' => $class->id, 'class' => $class->name, 'expected' => $expected, 'cells' => $cells];
        })->values()->all();

        return [
            'subjects' => $subjects->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'code' => $s->code ?: $s->name])->values()->all(),
            'rows' => $rows,
            'overall' => $expectedAll ? round($done / $expectedAll * 100, 1) : 0.0,
        ];
    }
}
