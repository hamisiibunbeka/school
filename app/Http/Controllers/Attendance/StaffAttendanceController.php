<?php

namespace App\Http\Controllers\Attendance;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\StaffAttendance;
use App\Services\Exams\TeacherAccess;
use App\Support\Lookups;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Staff attendance register, kept separate from student attendance (SRS 4.7). */
class StaffAttendanceController extends Controller
{
    public function __construct(private TeacherAccess $access) {}

    public function index(Request $request): Response
    {
        $today = now()->toDateString();
        $date = $request->input('date');
        $date = is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) && strtotime($date) ? $date : $today;
        $department = $request->integer('department') ?: null;
        $category = in_array($request->input('category'), ['teaching', 'non_teaching'], true) ? $request->input('category') : null;
        $schoolId = $this->tenancy()->schoolId();

        $employees = Employee::with('department:id,name')
            ->whereNot('status', 'terminated')
            ->when($department, fn ($q) => $q->where('department_id', $department))
            ->when($category, fn ($q) => $q->where('category', $category))
            ->orderBy('first_name')->orderBy('last_name')
            ->get(['id', 'employee_no', 'first_name', 'last_name', 'designation', 'category', 'department_id', 'status']);

        $records = StaffAttendance::whereDate('date', $date)->whereIn('employee_id', $employees->pluck('id'))->get()->keyBy('employee_id');

        // Approved leave covering the date pre-selects "on leave".
        $onLeave = DB::table('leave_requests')->where('school_id', $schoolId)->where('status', 'approved')
            ->whereDate('start_date', '<=', $date)->whereDate('end_date', '>=', $date)
            ->pluck('employee_id')->map(fn ($id) => (int) $id)->all();

        $roster = $employees->map(fn (Employee $e) => [
            'id' => $e->id,
            'employee_no' => $e->employee_no,
            'full_name' => $e->full_name,
            'designation' => $e->designation,
            'department' => $e->department?->name,
            'category' => $e->category,
            'on_approved_leave' => in_array($e->id, $onLeave, true),
            'status' => $records->get($e->id)?->status,
            'check_in' => $records->get($e->id)?->check_in ? substr($records->get($e->id)->check_in, 0, 5) : null,
            'check_out' => $records->get($e->id)?->check_out ? substr($records->get($e->id)->check_out, 0, 5) : null,
            'remarks' => $records->get($e->id)?->remarks,
        ])->values();

        // Last 10 days trend for the whole school.
        $trend = DB::table('staff_attendances')->where('school_id', $schoolId)
            ->whereDate('date', '>=', CarbonImmutable::parse($date)->subDays(20)->toDateString())->whereDate('date', '<=', $date)
            ->selectRaw('date, status, COUNT(*) as total')->groupBy('date', 'status')->orderBy('date')->get()
            ->groupBy('date')->map(fn ($rows, $d) => [
                'date' => substr((string) $d, 0, 10),
                'present' => (int) $rows->where('status', 'present')->sum('total'),
                'late' => (int) $rows->where('status', 'late')->sum('total'),
                'absent' => (int) $rows->where('status', 'absent')->sum('total'),
                'on_leave' => (int) $rows->where('status', 'on_leave')->sum('total'),
            ])->values()->take(-10)->values();

        return Inertia::render('attendance/staff', [
            'filters' => ['date' => $date, 'department' => $department ? (string) $department : '', 'category' => $category ?? ''],
            'roster' => $roster,
            'departments' => Lookups::departments(),
            'trend' => $trend,
            'today' => $today,
            'canRecord' => $request->user()->can('attendance.manage') && ! $this->access->isRestricted($request->user()),
            'summary' => [
                'staff' => $employees->count(),
                'marked' => $records->count(),
                'present' => $records->where('status', 'present')->count(),
                'late' => $records->where('status', 'late')->count(),
                'absent' => $records->where('status', 'absent')->count(),
                'on_leave' => $records->where('status', 'on_leave')->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        abort_if($this->access->isRestricted($request->user()), 403, 'Teachers cannot record staff attendance.');
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'records' => ['required', 'array', 'min:1'],
            'records.*.employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'records.*.status' => ['required', Rule::in(StaffAttendance::STATUSES)],
            'records.*.check_in' => ['nullable', 'date_format:H:i'],
            'records.*.check_out' => ['nullable', 'date_format:H:i'],
            'records.*.remarks' => ['nullable', 'string', 'max:255'],
        ], ['date.before_or_equal' => 'Attendance cannot be recorded for a future date.'], [
            'records.*.check_in' => 'check-in time',
            'records.*.check_out' => 'check-out time',
        ]);

        foreach ($data['records'] as $i => $r) {
            if (! empty($r['check_in']) && ! empty($r['check_out']) && $r['check_out'] < $r['check_in']) {
                throw ValidationException::withMessages(["records.{$i}.check_out" => 'Check-out must be after check-in.']);
            }
        }

        $existing = StaffAttendance::whereDate('date', $data['date'])->count();
        $now = now();
        $rows = collect($data['records'])->map(fn ($r) => [
            'tenant_id' => $this->tenancy()->tenantId(),
            'school_id' => $schoolId,
            'employee_id' => $r['employee_id'],
            'date' => $data['date'],
            'status' => $r['status'],
            'check_in' => in_array($r['status'], ['present', 'late'], true) ? ($r['check_in'] ?? null) : null,
            'check_out' => in_array($r['status'], ['present', 'late'], true) ? ($r['check_out'] ?? null) : null,
            'remarks' => $r['remarks'] ?? null,
            'recorded_by' => $request->user()->id,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        DB::table('staff_attendances')->upsert($rows, ['employee_id', 'date'], ['status', 'check_in', 'check_out', 'remarks', 'recorded_by', 'updated_at']);

        $counts = collect($rows)->countBy('status');
        $this->audit($existing ? 'updated' : 'recorded', null, "Staff attendance for {$data['date']}: ".$counts->map(fn ($n, $s) => "{$n} {$s}")->implode(', '), 'attendance');
        $this->toast('Staff attendance saved ('.count($rows).' staff).');

        return back();
    }
}
