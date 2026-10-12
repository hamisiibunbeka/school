<?php

namespace App\Http\Controllers\Attendance;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRecord;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Student;
use App\Notifications\SchoolNotification;
use App\Services\Exams\TeacherAccess;
use App\Support\Lookups;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Daily student attendance register (SRS 4.7). */
class AttendanceController extends Controller
{
    public function __construct(private TeacherAccess $access) {}

    public function index(Request $request): Response
    {
        $today = now()->toDateString();
        $date = $this->safeDate($request->input('date')) ?? $today;
        $classId = $request->integer('class') ?: null;
        $streamId = $request->integer('stream') ?: null;
        $user = $request->user();
        $schoolId = $this->tenancy()->schoolId();

        $classes = $this->allowedClasses($user);
        $allowed = $classId ? $this->access->canTakeAttendance($user, $classId, $streamId) : false;

        $roster = [];
        $meta = null;
        if ($classId && $allowed) {
            $students = Student::active()->with('stream:id,name')
                ->where('school_class_id', $classId)
                ->when($streamId, fn ($q) => $q->where('stream_id', $streamId))
                ->orderBy('first_name')->orderBy('last_name')
                ->get(['id', 'admission_no', 'first_name', 'middle_name', 'last_name', 'gender', 'photo_path', 'stream_id']);

            $records = AttendanceRecord::with('recorder:id,name')->whereDate('date', $date)
                ->whereIn('student_id', $students->pluck('id'))->get()->keyBy('student_id');

            $roster = $students->map(fn (Student $s) => [
                'id' => $s->id,
                'admission_no' => $s->admission_no,
                'full_name' => $s->full_name,
                'photo_url' => $s->photo_url,
                'gender' => $s->gender,
                'stream' => $s->stream?->name,
                'status' => $records->get($s->id)?->status,
                'remarks' => $records->get($s->id)?->remarks,
            ])->values();

            $last = $records->sortByDesc('updated_at')->first();
            $meta = [
                'saved' => $records->count(),
                'recorded_by' => $last?->recorder?->name,
                'updated_at' => $last?->updated_at?->toIso8601String(),
            ];
        }

        // School-wide register status for the day (which classes are done).
        $activeCounts = DB::table('students')->where('school_id', $schoolId)->where('status', 'active')->whereNull('deleted_at')
            ->selectRaw('school_class_id, stream_id, COUNT(*) as total')->groupBy('school_class_id', 'stream_id')->get();
        $markedCounts = DB::table('attendance_records')->where('attendance_records.school_id', $schoolId)->where('date', $date)
            ->selectRaw('school_class_id, stream_id, status, COUNT(*) as total')->groupBy('school_class_id', 'stream_id', 'status')->get();

        $registers = [];
        foreach ($classes as $class) {
            foreach ($class['streams'] ?: [['value' => null, 'label' => '']] as $stream) {
                $sid = $stream['value'];
                $total = (int) $activeCounts->where('school_class_id', $class['value'])->where('stream_id', $sid)->sum('total');
                $marks = $markedCounts->where('school_class_id', $class['value'])->where('stream_id', $sid);
                $counts = fn ($status) => (int) $marks->where('status', $status)->sum('total');
                $registers[] = [
                    'class_id' => $class['value'],
                    'stream_id' => $sid,
                    'name' => trim($class['label'].' '.$stream['label']),
                    'students' => $total,
                    'marked' => (int) $marks->sum('total'),
                    'present' => $counts('present'),
                    'absent' => $counts('absent'),
                    'late' => $counts('late'),
                    'excused' => $counts('excused'),
                ];
            }
        }

        $day = collect($registers);
        $marked = $day->sum('marked');

        return Inertia::render('attendance/index', [
            'filters' => ['date' => $date, 'class' => $classId ? (string) $classId : '', 'stream' => $streamId ? (string) $streamId : ''],
            'classes' => $classes,
            'roster' => $roster,
            'meta' => $meta,
            'allowed' => $allowed,
            'restricted' => $this->access->isRestricted($user),
            'today' => $today,
            'isPast' => $date < $today,
            'isWeekend' => CarbonImmutable::parse($date)->isWeekend(),
            'registers' => $registers,
            'day' => [
                'marked' => $marked,
                'present' => $day->sum('present'),
                'absent' => $day->sum('absent'),
                'late' => $day->sum('late'),
                'excused' => $day->sum('excused'),
                'rate' => $marked ? round(($day->sum('present') + $day->sum('late')) / $marked * 100, 1) : null,
                'registers_done' => $day->filter(fn ($r) => $r['students'] > 0 && $r['marked'] >= $r['students'])->count(),
                'registers_total' => $day->filter(fn ($r) => $r['students'] > 0)->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'records' => ['required', 'array', 'min:1'],
            'records.*.student_id' => ['required', 'integer'],
            'records.*.status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'records.*.remarks' => ['nullable', 'string', 'max:255'],
            'correction_reason' => ['nullable', 'string', 'max:500'],
        ], ['date.before_or_equal' => 'Attendance cannot be recorded for a future date.'], ['records.*.status' => 'attendance status']);

        $user = $request->user();
        $classId = (int) $data['school_class_id'];
        $streamId = isset($data['stream_id']) ? (int) $data['stream_id'] : null;
        abort_unless($this->access->canTakeAttendance($user, $classId, $streamId), 403, 'You can only take attendance for your assigned classes.');

        // Only students actually on this class/stream roster may be marked.
        $students = Student::active()->with('guardians.user')->where('school_class_id', $classId)
            ->when($streamId, fn ($q) => $q->where('stream_id', $streamId))
            ->whereIn('id', collect($data['records'])->pluck('student_id'))
            ->get()->keyBy('id');

        $existing = AttendanceRecord::whereDate('date', $data['date'])->whereIn('student_id', $students->keys())->get()->keyBy('student_id');

        $changes = [];
        foreach ($data['records'] as $r) {
            $old = $existing->get($r['student_id']);
            if ($old && ($old->status !== $r['status'] || (string) $old->remarks !== (string) ($r['remarks'] ?? ''))) {
                $changes[$r['student_id']] = ['from' => $old->status, 'to' => $r['status']];
            }
        }

        $isPast = $data['date'] < now()->toDateString();
        if ($isPast && $changes && blank($data['correction_reason'] ?? null)) {
            throw ValidationException::withMessages(['correction_reason' => 'A correction reason is required when changing attendance for a past date.']);
        }

        $now = now();
        $rows = [];
        foreach ($data['records'] as $r) {
            $student = $students->get($r['student_id']);
            if (! $student) {
                continue;
            }
            $rows[] = [
                'tenant_id' => $this->tenancy()->tenantId(),
                'school_id' => $schoolId,
                'student_id' => $student->id,
                'school_class_id' => $classId,
                'stream_id' => $student->stream_id,
                'date' => $data['date'],
                'status' => $r['status'],
                'remarks' => $r['remarks'] ?? null,
                'recorded_by' => $user->id,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if (! $rows) {
            throw ValidationException::withMessages(['records' => 'No students on this roster were submitted.']);
        }

        DB::transaction(fn () => DB::table('attendance_records')->upsert(
            $rows,
            ['student_id', 'date'],
            ['school_class_id', 'stream_id', 'status', 'remarks', 'recorded_by', 'updated_at'],
        ));

        $label = trim(SchoolClass::find($classId)?->name.' '.($streamId ? Stream::find($streamId)?->name : ''));
        $counts = collect($rows)->countBy('status');

        if ($isPast && $changes) {
            $this->audit('corrected', null, "Attendance correction for {$label} on {$data['date']} (".count($changes).' changed): '.$data['correction_reason'], 'attendance',
                collect($changes)->map(fn ($c) => $c['from'])->all(), collect($changes)->map(fn ($c) => $c['to'])->all());
        } else {
            $this->audit($existing->isEmpty() ? 'recorded' : 'updated', null, "Attendance for {$label} on {$data['date']}: ".$counts->map(fn ($n, $s) => "{$n} {$s}")->implode(', '), 'attendance');
        }

        // Alert guardians with portal accounts about new absences.
        $notified = 0;
        foreach ($rows as $row) {
            if ($row['status'] !== 'absent' || $existing->get($row['student_id'])?->status === 'absent') {
                continue;
            }
            $student = $students->get($row['student_id']);
            foreach ($student->guardians as $guardian) {
                if ($guardian->user) {
                    $guardian->user->notify(new SchoolNotification(
                        'Absence alert',
                        "{$student->full_name} was marked absent on ".CarbonImmutable::parse($data['date'])->format('D, d/m/Y').'. Please contact the school if this is unexpected.',
                        '/portal',
                        'warning',
                    ));
                    $notified++;
                }
            }
        }

        $this->toast("Attendance saved for {$label}: ".($counts['present'] ?? 0).' present, '.($counts['absent'] ?? 0).' absent'.($notified ? " · {$notified} guardian(s) notified" : '').'.');

        return back();
    }

    /** JSON lookup used by student pickers in this module. */
    public function searchStudents(Request $request): JsonResponse
    {
        $term = trim($request->string('q')->toString());

        return response()->json(
            Student::with(['schoolClass:id,name', 'stream:id,name'])
                ->where('status', 'active')
                ->search($term)
                ->orderBy('first_name')->limit(15)
                ->get(['id', 'admission_no', 'first_name', 'middle_name', 'last_name', 'school_class_id', 'stream_id', 'photo_path'])
                ->map(fn ($s) => [
                    'value' => $s->id,
                    'label' => "{$s->full_name} · {$s->admission_no}",
                    'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
                ]),
        );
    }

    /**
     * Lookups::classes() limited to what a restricted teacher may register.
     *
     * @return array<int, array{value:int, label:string, streams: array<int, array{value:int,label:string}>}>
     */
    private function allowedClasses(?\App\Models\User $user): array
    {
        $classes = Lookups::classes();
        $scopes = $this->access->attendanceScopes($user);
        if ($scopes === null) {
            return $classes;
        }

        $result = [];
        foreach ($classes as $class) {
            $classScopes = array_filter($scopes, fn ($s) => $s['class_id'] === $class['value']);
            if (! $classScopes) {
                continue;
            }
            $wholeClass = (bool) array_filter($classScopes, fn ($s) => $s['stream_id'] === null);
            $streamIds = array_column($classScopes, 'stream_id');
            $class['streams'] = array_values(array_filter($class['streams'], fn ($s) => $wholeClass || in_array($s['value'], $streamIds, true)));
            $result[] = $class;
        }

        return $result;
    }

    private function safeDate(mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }
        try {
            return CarbonImmutable::createFromFormat('Y-m-d', $value)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }
}
