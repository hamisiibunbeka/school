<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\ClassSubject;
use App\Models\Exam;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\User;
use App\Services\Exams\ResultsService;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo examinations for the current academic year:
 *  - Term I Midterm, Term I Final Examination, Term II Midterm (published)
 *  - Term II Final Examination (marks_entry, partially filled)
 * Scores follow a per-student ability (normal-ish), subject difficulty and exam noise.
 */
class ExamsDemoSeeder extends Seeder
{
    /** Mean shift per subject code (harder subjects score lower). */
    private const DIFFICULTY = [
        'MATH' => -11, 'PHY' => -8, 'CHEM' => -6, 'BIO' => -2, 'ENG' => -1, 'KISW' => 10,
        'GEO' => 0, 'HIST' => 2, 'CIV' => 6, 'COMM' => 3, 'ICT' => 5,
    ];

    public function run(): void
    {
        $tenancy = app(Tenancy::class);
        $schoolId = $tenancy->schoolId();
        $tenantId = $tenancy->tenantId();
        $year = AcademicYear::current();
        if (! $schoolId || ! $year || Exam::exists()) {
            return;
        }

        mt_srand(4606);
        $results = app(ResultsService::class);
        if ($results->scale()->isEmpty()) {
            return; // grade scale is seeded by SchoolProvisioner
        }

        $terms = $year->terms()->get();
        $termI = $terms->first();
        $termII = $terms->skip(1)->first() ?? $termI;
        $y = (int) $year->start_date->format('Y');

        $principal = User::where('school_id', $schoolId)->where('email', 'principal@mzenzi.test')->value('id') ?? User::where('school_id', $schoolId)->value('id');
        $mathTeacher = User::where('school_id', $schoolId)->where('email', 'teacher@mzenzi.test')->value('id') ?? $principal;

        $classes = SchoolClass::orderBy('level')->get();
        $subjectsByClass = ClassSubject::select('school_class_id', 'subject_id')->distinct()->get()
            ->groupBy('school_class_id')->map(fn ($rows) => $rows->pluck('subject_id')->all());
        $codes = Subject::pluck('code', 'id');
        $students = Student::where('status', 'active')->whereNotNull('school_class_id')->get(['id', 'school_class_id']);

        // Stable learner ability ~ N(56, 13), clamped.
        $ability = [];
        foreach ($students as $s) {
            $ability[$s->id] = max(22, min(92, 56 + 13 * $this->gauss()));
        }
        // Each learner has a couple of personal strong/weak subjects.
        $affinity = [];

        $plan = [
            ['Term I Midterm', 'midterm', $termI?->id, "{$y}-03-16", "{$y}-03-20", 'published', 0],
            ['Term I Final Examination', 'end_of_term', $termI?->id, "{$y}-06-01", "{$y}-06-12", 'published', 1.5],
            ['Term II Midterm', 'midterm', $termII?->id, "{$y}-08-24", "{$y}-08-28", 'published', 2.5],
            ['Term II Final Examination', 'end_of_term', $termII?->id, "{$y}-10-05", "{$y}-10-09", 'marks_entry', 3.5],
        ];

        $now = now();
        foreach ($plan as [$name, $type, $termId, $start, $end, $status, $growth]) {
            $publishedAt = $status === 'published' ? CarbonImmutable::parse($end)->addDays(10)->setTime(10, 30) : null;

            $exam = Exam::create([
                'academic_year_id' => $year->id,
                'term_id' => $termId,
                'name' => $name,
                'type' => $type,
                'start_date' => $start,
                'end_date' => $end,
                'max_score' => 100,
                'weight' => $type === 'midterm' ? 40 : 60,
                'status' => $status,
                'published_at' => $publishedAt,
                'published_by' => $publishedAt ? $principal : null,
            ]);
            $exam->classes()->sync($classes->pluck('id')->all());

            $this->log($exam, 'created', "Created exam {$name}", $principal, CarbonImmutable::parse($start)->subDays(14));
            $this->log($exam, 'status_changed', 'Opened mark entry', $principal, CarbonImmutable::parse($end));
            if ($publishedAt) {
                $this->log($exam, 'status_changed', 'Submitted for moderation', $principal, $publishedAt->subDays(4));
                $this->log($exam, 'published', 'Approved & published results', $principal, $publishedAt);
            }

            $rows = [];
            foreach ($students as $s) {
                $subjectIds = $subjectsByClass[$s->school_class_id] ?? [];
                foreach ($subjectIds as $k => $subjectId) {
                    // Partially filled final exam: first ~60% of subjects complete, one subject half done.
                    if ($status === 'marks_entry') {
                        $cut = (int) ceil(count($subjectIds) * 0.6);
                        if ($k > $cut || ($k === $cut && $s->id % 2 === 0)) {
                            continue;
                        }
                    }

                    $affinity[$s->id][$subjectId] ??= 6 * $this->gauss();
                    $code = $codes[$subjectId] ?? '';
                    $absent = mt_rand(1, 1000) <= 8;
                    $score = $absent ? null : (int) round(max(3, min(99, $ability[$s->id] + (self::DIFFICULTY[$code] ?? 0) + $affinity[$s->id][$subjectId] + $growth + 7 * $this->gauss())));
                    $grade = $score !== null ? $results->grade((float) $score) : null;

                    $rows[] = [
                        'tenant_id' => $tenantId,
                        'school_id' => $schoolId,
                        'exam_id' => $exam->id,
                        'student_id' => $s->id,
                        'subject_id' => $subjectId,
                        'school_class_id' => $s->school_class_id,
                        'score' => $score,
                        'is_absent' => $absent,
                        'grade' => $grade['grade'] ?? null,
                        'points' => $grade['points'] ?? null,
                        'remarks' => $absent ? 'Sick on exam day' : null,
                        'entered_by' => $code === 'MATH' ? $mathTeacher : $principal,
                        'created_at' => CarbonImmutable::parse($end)->addDays(mt_rand(1, 5)),
                        'updated_at' => $now,
                    ];
                    if (count($rows) >= 1000) {
                        DB::table('exam_marks')->insertOrIgnore($rows);
                        $rows = [];
                    }
                }
            }
            if ($rows) {
                DB::table('exam_marks')->insertOrIgnore($rows);
            }
        }
    }

    private function log(Exam $exam, string $action, string $description, ?int $userId, CarbonImmutable $at): void
    {
        AuditLog::create([
            'user_id' => $userId,
            'action' => $action,
            'module' => 'exams',
            'auditable_type' => $exam->getMorphClass(),
            'auditable_id' => $exam->id,
            'description' => $description,
            'created_at' => $at,
        ]);
    }

    /** Standard normal sample (Box–Muller) using the seeded mt_rand. */
    private function gauss(): float
    {
        $u = max(1, mt_rand()) / mt_getrandmax();
        $v = mt_rand() / mt_getrandmax();

        return sqrt(-2 * log($u)) * cos(2 * M_PI * $v);
    }
}
