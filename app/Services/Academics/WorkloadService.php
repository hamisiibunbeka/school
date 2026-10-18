<?php

namespace App\Services\Academics;

use App\Models\ClassSubject;
use App\Models\Employee;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\TimetableSlot;
use App\Services\Duties\DutyService;
use App\Support\EducationLevel;
use App\Support\Tenancy;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Teacher workload in periods per week.
 *
 *  teaching = Σ allocations, where an allocation counts
 *      - once if it is for one stream, or marked "taught jointly";
 *      - O-Level class-wide: once per stream of the class;
 *      - A-Level class-wide: once per stream whose combination includes the subject;
 *  duties   = class-teacher streams × school setting + the employee's own duty periods
 *             + rostered duties running today (Staff Duties with workload periods, e.g. Prep);
 *  total    = teaching + duties, compared with the employee's limit (or the school default).
 *  Timetabled periods (slots on the timetable) are shown alongside for comparison.
 */
class WorkloadService
{
    public const DEFAULTS = ['max_teaching_periods' => 30, 'workload_enforcement' => 'warn', 'class_teacher_periods' => 0];

    /** @var array<int, int>|null class_id => streams count */
    private ?array $streamCounts = null;

    /** @var array<int, array<int, int>>|null A-Level class_id => [subject_id => streams taking it] */
    private ?array $aLevelSubjectStreams = null;

    /** @return array{max_teaching_periods:int, workload_enforcement:string, class_teacher_periods:int} */
    public function settings(): array
    {
        $school = app(Tenancy::class)->school();
        $s = array_merge(self::DEFAULTS, array_intersect_key((array) ($school?->settings ?? []), self::DEFAULTS));

        return [
            'max_teaching_periods' => max(1, (int) $s['max_teaching_periods']),
            'workload_enforcement' => $s['workload_enforcement'] === 'block' ? 'block' : 'warn',
            'class_teacher_periods' => max(0, (int) $s['class_teacher_periods']),
        ];
    }

    public function limitFor(Employee $employee): int
    {
        return $employee->max_periods ?: $this->settings()['max_teaching_periods'];
    }

    /** Weekly periods an allocation puts on its teacher. */
    public function effectivePeriods(ClassSubject|array $a): int
    {
        $a = $a instanceof ClassSubject ? $a->only(['school_class_id', 'stream_id', 'subject_id', 'periods_per_week', 'is_joint']) : $a;
        $periods = (int) ($a['periods_per_week'] ?? 0);
        if (! empty($a['stream_id']) || ! empty($a['is_joint'])) {
            return $periods;
        }

        $this->loadClassInfo();
        $classId = (int) $a['school_class_id'];
        if (isset($this->aLevelSubjectStreams[$classId])) {
            return $periods * max(1, $this->aLevelSubjectStreams[$classId][(int) $a['subject_id']] ?? 0);
        }

        return $periods * max(1, $this->streamCounts[$classId] ?? 1);
    }

    /**
     * Full workload per active teacher.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function teachers(): Collection
    {
        $settings = $this->settings();
        $allocations = ClassSubject::with('subject:id,name')->whereNotNull('employee_id')->get()->groupBy('employee_id');
        $classTeacher = $this->classTeacherRoles();
        $rostered = app(DutyService::class)->workloadByEmployee();
        $timetabled = TimetableSlot::whereNotNull('employee_id')->selectRaw('employee_id, COUNT(*) as total')->groupBy('employee_id')->pluck('total', 'employee_id');

        return Employee::teachers()->active()->orderBy('first_name')->get()->map(function (Employee $t) use ($allocations, $classTeacher, $rostered, $timetabled, $settings) {
            $mine = $allocations->get($t->id, collect());
            $teaching = (int) $mine->sum(fn (ClassSubject $a) => $this->effectivePeriods($a));
            $ctStreams = (int) ($classTeacher[$t->id] ?? 0);
            $roster = $rostered[$t->id] ?? ['periods' => 0, 'names' => []];
            $duties = $ctStreams * $settings['class_teacher_periods'] + (int) $t->duty_periods + $roster['periods'];
            $total = $teaching + $duties;
            $limit = $this->limitFor($t);
            $slots = (int) ($timetabled[$t->id] ?? 0);

            return [
                'id' => $t->id,
                'name' => $t->full_name,
                'employee_no' => $t->employee_no,
                'designation' => $t->designation,
                'allocations' => $mine->count(),
                'subjects' => $mine->pluck('subject.name')->unique()->values(),
                'teaching' => $teaching,
                'class_teacher_streams' => $ctStreams,
                'duty_periods' => (int) $t->duty_periods,
                'duty_note' => $t->duty_note,
                'roster_periods' => $roster['periods'],
                'roster_duties' => array_values(array_unique($roster['names'])),
                'duties' => $duties,
                'periods' => $total,
                'limit' => $limit,
                'custom_limit' => (bool) $t->max_periods,
                'status' => $total > $limit ? 'over' : ($total >= $limit * 0.8 ? 'near' : ($total === 0 ? 'free' : 'ok')),
                'timetabled' => $slots,
                // Teaching periods allocated but not yet on the timetable (or timetabled beyond the allocation).
                'timetable_gap' => $teaching - $slots,
            ];
        })->sortByDesc(fn ($w) => $w['periods'] / max(1, $w['limit']))->values();
    }

    /** Current total (teaching + duties) of one teacher, optionally ignoring one allocation being edited. */
    public function totalFor(Employee $employee, ?int $exceptAllocationId = null): int
    {
        $teaching = ClassSubject::where('employee_id', $employee->id)
            ->when($exceptAllocationId, fn ($q) => $q->whereKeyNot($exceptAllocationId))
            ->get()->sum(fn (ClassSubject $a) => $this->effectivePeriods($a));
        $ct = ($this->classTeacherRoles()[$employee->id] ?? 0) * $this->settings()['class_teacher_periods'];
        $roster = app(DutyService::class)->workloadByEmployee()[$employee->id]['periods'] ?? 0;

        return (int) $teaching + $ct + (int) $employee->duty_periods + $roster;
    }

    /**
     * In "block" mode refuse a change that would push the teacher above their limit.
     * Returns the resulting total so callers can warn in "warn" mode.
     */
    public function check(?int $employeeId, int $addedPeriods, ?int $exceptAllocationId = null, string $field = 'employee_id'): ?array
    {
        $employee = $employeeId ? Employee::find($employeeId) : null;
        if (! $employee || $employee->category !== 'teaching') {
            return null;
        }

        $total = $this->totalFor($employee, $exceptAllocationId) + $addedPeriods;
        $limit = $this->limitFor($employee);

        if ($total > $limit && $this->settings()['workload_enforcement'] === 'block') {
            throw ValidationException::withMessages([
                $field => "{$employee->full_name} would carry {$total} periods/week, above the limit of {$limit}. Reduce the load or raise the teacher's limit.",
            ]);
        }

        return ['name' => $employee->full_name, 'total' => $total, 'limit' => $limit, 'over' => $total > $limit];
    }

    /**
     * Streams each employee is class teacher of.
     *
     * @return array<int, int>
     */
    private function classTeacherRoles(): array
    {
        return Stream::whereNotNull('class_teacher_id')->selectRaw('class_teacher_id, COUNT(*) as total')->groupBy('class_teacher_id')
            ->pluck('total', 'class_teacher_id')->map(fn ($n) => (int) $n)->all();
    }

    private function loadClassInfo(): void
    {
        if ($this->streamCounts !== null) {
            return;
        }

        $classes = SchoolClass::withCount('streams')->get(['id', 'education_level']);
        $this->streamCounts = $classes->pluck('streams_count', 'id')->map(fn ($v) => (int) $v)->all();
        $this->aLevelSubjectStreams = [];

        $aLevelIds = $classes->where('education_level', EducationLevel::A_LEVEL)->pluck('id');
        foreach (Stream::with('combination.items')->whereIn('school_class_id', $aLevelIds)->get() as $stream) {
            $this->aLevelSubjectStreams[$stream->school_class_id] ??= [];
            foreach ($stream->combination?->subjectIds() ?? [] as $subjectId) {
                $this->aLevelSubjectStreams[$stream->school_class_id][$subjectId] = ($this->aLevelSubjectStreams[$stream->school_class_id][$subjectId] ?? 0) + 1;
            }
        }
        foreach ($aLevelIds as $id) {
            $this->aLevelSubjectStreams[$id] ??= [];
        }
    }
}
