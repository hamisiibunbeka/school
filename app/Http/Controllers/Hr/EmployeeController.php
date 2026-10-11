<?php

namespace App\Http\Controllers\Hr;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Payslip;
use App\Models\Role;
use App\Models\SalaryComponent;
use App\Models\User;
use App\Services\DocumentNumber;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Staff directory, records, status lifecycle and system logins (SRS 4.11). */
class EmployeeController extends Controller
{
    public const STATUSES = ['active', 'on_leave', 'suspended', 'terminated'];

    public const CATEGORIES = ['teaching', 'non_teaching'];

    public const EMPLOYMENT_TYPES = ['permanent', 'contract', 'part_time'];

    private const FILTERS = ['search', 'department', 'category', 'status', 'type', 'contract'];

    public function index(Request $request): Response
    {
        $filters = $request->only(self::FILTERS);
        $canSeeSalary = $this->canSeeSalary($request);

        $employees = $this->filteredQuery($filters)
            ->with(['department:id,name', 'user:id,email'])
            ->orderBy('first_name')->orderBy('last_name')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Employee $e) => [
                'id' => $e->id,
                'employee_no' => $e->employee_no,
                'full_name' => $e->full_name,
                'designation' => $e->designation,
                'department' => $e->department?->name,
                'category' => $e->category,
                'employment_type' => $e->employment_type,
                'phone' => $e->phone,
                'email' => $e->email,
                'hire_date' => $e->hire_date?->toDateString(),
                'contract_end_date' => $e->contract_end_date?->toDateString(),
                'basic_salary' => $canSeeSalary ? (string) $e->basic_salary : null,
                'status' => $e->status,
                'has_login' => (bool) $e->user_id,
            ]);

        $today = now()->toDateString();
        $onLeaveIds = LeaveRequest::where('status', 'approved')->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)->pluck('employee_id');

        return Inertia::render('hr/employees/index', [
            'employees' => $employees,
            'filters' => array_merge(array_fill_keys(self::FILTERS, ''), $filters),
            'departments' => Lookups::departments(),
            'statuses' => Lookups::enum(self::STATUSES),
            'categories' => Lookups::enum(self::CATEGORIES),
            'types' => Lookups::enum(self::EMPLOYMENT_TYPES),
            'stats' => [
                'headcount' => Employee::whereIn('status', ['active', 'on_leave'])->count(),
                'teaching' => Employee::whereIn('status', ['active', 'on_leave'])->where('category', 'teaching')->count(),
                'expiring' => Employee::whereNot('status', 'terminated')->whereNotNull('contract_end_date')
                    ->whereBetween('contract_end_date', [$today, now()->addDays(60)->toDateString()])->count(),
                'on_leave' => Employee::where(fn ($q) => $q->where('status', 'on_leave')->orWhereIn('id', $onLeaveIds))->whereNot('status', 'terminated')->count(),
            ],
            'canSeeSalary' => $canSeeSalary,
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(self::FILTERS);
        $canSeeSalary = $this->canSeeSalary($request);
        $this->audit('exported', null, 'Exported staff directory', 'hr', null, $filters);

        return response()->streamDownload(function () use ($filters, $canSeeSalary) {
            $out = fopen('php://output', 'w');
            $header = ['Employee No', 'First Name', 'Last Name', 'Gender', 'Designation', 'Department', 'Category', 'Employment Type', 'Phone', 'Email', 'Hire Date', 'Contract End', 'Status'];
            if ($canSeeSalary) {
                array_push($header, 'Basic Salary', 'Bank', 'Account No', 'NSSF No', 'TIN');
            }
            fputcsv($out, $header);
            $this->filteredQuery($filters)->with('department:id,name')->orderBy('first_name')->chunk(500, function ($chunk) use ($out, $canSeeSalary) {
                foreach ($chunk as $e) {
                    $row = [$e->employee_no, $e->first_name, $e->last_name, $e->gender, $e->designation, $e->department?->name, $e->category, $e->employment_type,
                        $e->phone, $e->email, $e->hire_date?->toDateString(), $e->contract_end_date?->toDateString(), $e->status];
                    if ($canSeeSalary) {
                        array_push($row, (string) $e->basic_salary, $e->bank_name, $e->bank_account, $e->nssf_no, $e->tin);
                    }
                    fputcsv($out, $row);
                }
            });
            fclose($out);
        }, 'staff-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function create(): Response
    {
        return Inertia::render('hr/employees/form', $this->formProps(null));
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $employee = new Employee(collect($data)->except('employee_no')->all());
        $employee->employee_no = $data['employee_no'] ?: DocumentNumber::next('employee');
        $employee->status = 'active';
        $employee->save();

        $this->audit('created', $employee, "Added employee {$employee->full_name} ({$employee->employee_no})", 'hr');
        $this->toast("{$employee->full_name} has been added to the staff directory.");

        return to_route('hr.employees.show', $employee);
    }

    public function show(Request $request, Employee $employee): Response
    {
        $employee->load(['department:id,name', 'user.role:id,name']);
        $schoolId = $this->tenancy()->schoolId();
        $canSeeSalary = $this->canSeeSalary($request);
        $year = now()->year;

        // Leave history and balances (current calendar year)
        $leave = LeaveRequest::with(['leaveType:id,name', 'approver:id,name'])->where('employee_id', $employee->id)
            ->orderByDesc('start_date')->get()
            ->map(fn (LeaveRequest $l) => [
                'id' => $l->id, 'type' => $l->leaveType?->name, 'start_date' => $l->start_date->toDateString(), 'end_date' => $l->end_date->toDateString(),
                'days' => $l->days, 'reason' => $l->reason, 'status' => $l->status, 'approver' => $l->approver?->name, 'decision_note' => $l->decision_note,
            ]);

        $balances = LeaveController::balancesFor([$employee->id], $year)[$employee->id] ?? [];

        // Staff attendance summary (this year)
        $attendanceBase = DB::table('staff_attendances')->where('school_id', $schoolId)->where('employee_id', $employee->id)->whereYear('date', $year);
        $attendance = (clone $attendanceBase)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $monthly = (clone $attendanceBase)->selectRaw("DATE_FORMAT(date, '%Y-%m') as m, SUM(status IN ('present','late')) as present, SUM(status = 'absent') as absent, SUM(status = 'late') as late")
            ->groupBy('m')->orderBy('m')->get();
        $recentAttendance = DB::table('staff_attendances')->where('school_id', $schoolId)->where('employee_id', $employee->id)
            ->orderByDesc('date')->limit(15)->get(['id', 'date', 'status', 'check_in', 'check_out', 'remarks']);

        // Teaching allocations
        $subjects = DB::table('class_subjects')
            ->join('subjects', 'subjects.id', '=', 'class_subjects.subject_id')
            ->join('school_classes', 'school_classes.id', '=', 'class_subjects.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'class_subjects.stream_id')
            ->where('class_subjects.school_id', $schoolId)->where('class_subjects.employee_id', $employee->id)
            ->orderBy('school_classes.level')->orderBy('streams.name')
            ->get(['class_subjects.id', 'subjects.name as subject', 'subjects.code', 'school_classes.name as class', 'streams.name as stream', 'class_subjects.periods_per_week']);

        $classTeacherOf = DB::table('streams')->join('school_classes', 'school_classes.id', '=', 'streams.school_class_id')
            ->where('streams.school_id', $schoolId)->where('streams.class_teacher_id', $employee->id)
            ->get(['school_classes.name as class', 'streams.name as stream'])->map(fn ($s) => trim("{$s->class} {$s->stream}"));

        $payslips = $canSeeSalary
            ? Payslip::with('run:id,period,status,payment_date')->where('employee_id', $employee->id)->latest('id')->limit(24)->get()
                ->map(fn (Payslip $p) => [
                    'id' => $p->id, 'period' => $p->run?->period, 'status' => $p->run?->status, 'payment_date' => $p->run?->payment_date?->toDateString(),
                    'gross_pay' => (string) $p->gross_pay, 'paye' => (string) $p->paye, 'nssf_employee' => (string) $p->nssf_employee,
                    'total_deductions' => (string) $p->total_deductions, 'net_pay' => (string) $p->net_pay,
                ])
            : [];

        $components = $canSeeSalary
            ? DB::table('employee_salary_components')
                ->join('salary_components', 'salary_components.id', '=', 'employee_salary_components.salary_component_id')
                ->where('salary_components.school_id', $schoolId)->where('employee_salary_components.employee_id', $employee->id)
                ->get(['salary_components.name', 'salary_components.type', 'salary_components.calculation', 'salary_components.value', 'employee_salary_components.amount'])
            : [];

        $data = [
            ...$employee->toArray(),
            'date_of_birth' => $employee->date_of_birth?->toDateString(),
            'hire_date' => $employee->hire_date?->toDateString(),
            'contract_end_date' => $employee->contract_end_date?->toDateString(),
            'age' => $employee->date_of_birth?->age,
            'department' => $employee->department?->name,
            'login' => $employee->user ? ['email' => $employee->user->email, 'role' => $employee->user->role?->name, 'status' => $employee->user->status] : null,
        ];
        unset($data['user']);
        if (! $canSeeSalary) {
            unset($data['basic_salary'], $data['bank_account']);
        }

        return Inertia::render('hr/employees/show', [
            'employee' => $data,
            'canSeeSalary' => $canSeeSalary,
            'leave' => ['requests' => $leave, 'balances' => array_values($balances), 'year' => $year],
            'leaveTypes' => LeaveType::orderBy('name')->get(['id', 'name'])->map(fn ($t) => ['value' => $t->id, 'label' => $t->name]),
            'attendance' => [
                'present' => (int) ($attendance['present'] ?? 0),
                'absent' => (int) ($attendance['absent'] ?? 0),
                'late' => (int) ($attendance['late'] ?? 0),
                'on_leave' => (int) ($attendance['on_leave'] ?? 0),
                'monthly' => $monthly,
                'recent' => $recentAttendance,
            ],
            'subjects' => $subjects,
            'classTeacherOf' => $classTeacherOf,
            'payslips' => $payslips,
            'components' => $components,
            'statuses' => Lookups::enum(self::STATUSES),
            'roles' => Role::where('tenant_id', $this->tenancy()->tenantId())->whereNotIn('slug', ['parent', 'student'])->orderBy('name')
                ->get(['id', 'name'])->map(fn ($r) => ['value' => $r->id, 'label' => $r->name]),
            'history' => DB::table('audit_logs')->leftJoin('users', 'users.id', '=', 'audit_logs.user_id')
                ->where('audit_logs.auditable_type', $employee->getMorphClass())->where('audit_logs.auditable_id', $employee->id)
                ->orderByDesc('audit_logs.id')->limit(20)
                ->get(['audit_logs.id', 'audit_logs.action', 'audit_logs.description', 'audit_logs.created_at', 'users.name as user']),
        ]);
    }

    public function edit(Employee $employee): Response
    {
        return Inertia::render('hr/employees/form', $this->formProps($employee));
    }

    public function update(Request $request, Employee $employee): RedirectResponse
    {
        $data = $this->validated($request, $employee);
        $tracked = ['designation', 'department_id', 'category', 'employment_type', 'basic_salary', 'contract_end_date', 'bank_name', 'bank_account'];
        $old = collect($employee->only($tracked))->map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : (is_null($v) ? null : (string) $v))->all();

        $employee->fill(collect($data)->except('employee_no')->all());
        if (! empty($data['employee_no'])) {
            $employee->employee_no = $data['employee_no'];
        }
        $employee->save();

        $new = collect($employee->only($tracked))->map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : (is_null($v) ? null : (string) $v))->all();
        $this->audit('updated', $employee, "Updated employee {$employee->full_name}", 'hr', array_diff_assoc($old, $new) ?: null, array_diff_assoc($new, $old) ?: null);
        $this->toast('Employee record updated.');

        return to_route('hr.employees.show', $employee);
    }

    /** Remove only records with no payroll history; otherwise ask to terminate. */
    public function destroy(Employee $employee): RedirectResponse
    {
        if (Payslip::where('employee_id', $employee->id)->exists()) {
            $this->toast('This employee has payroll history. Change the status to Terminated instead of deleting.', 'error');

            return back();
        }

        $employee->delete();
        $this->audit('deleted', $employee, "Deleted employee {$employee->full_name} ({$employee->employee_no})", 'hr');
        $this->toast('Employee deleted.');

        return to_route('hr.employees.index');
    }

    /** Status lifecycle: active / on_leave / suspended / terminated, with a mandatory reason. */
    public function changeStatus(Request $request, Employee $employee): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(self::STATUSES)],
            'reason' => ['required', 'string', 'max:500'],
            'effective_date' => ['nullable', 'date'],
        ]);

        $old = $employee->status;
        if ($old === $data['status']) {
            $this->toast('The employee already has that status.', 'info');

            return back();
        }

        DB::transaction(function () use ($employee, $data) {
            $employee->update(['status' => $data['status']]);

            // Terminated / suspended staff lose system access.
            if (in_array($data['status'], ['terminated', 'suspended'], true) && $employee->user_id) {
                User::whereKey($employee->user_id)->update(['status' => 'disabled']);
            }
            if ($data['status'] === 'active' && $employee->user_id) {
                User::whereKey($employee->user_id)->update(['status' => 'active']);
            }
        });

        $date = $data['effective_date'] ?? now()->toDateString();
        $this->audit('status_changed', $employee, "Status {$old} → {$data['status']} (effective {$date}): {$data['reason']}", 'hr', ['status' => $old], ['status' => $data['status'], 'reason' => $data['reason'], 'effective_date' => $date]);
        $this->toast('Employee status updated to '.str_replace('_', ' ', $data['status']).'.');

        return back();
    }

    /** Create (or reset) a system login for the employee with a chosen tenant role. */
    public function createLogin(Request $request, Employee $employee): RedirectResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($employee->user_id)],
            'role_id' => ['required', Rule::exists('roles', 'id')->where('tenant_id', $this->tenancy()->tenantId())->whereNotIn('slug', ['parent', 'student'])],
        ]);

        if ($employee->status === 'terminated') {
            $this->toast('Terminated employees cannot be given system access.', 'error');

            return back();
        }

        $password = Str::password(10, symbols: false);

        $user = $employee->user_id ? (User::find($employee->user_id) ?? new User) : new User;
        $isNew = ! $user->exists;
        $user->fill([
            'name' => $employee->full_name,
            'email' => $data['email'],
            'phone' => $employee->phone,
            'password' => $password,
            'role_id' => $data['role_id'],
            'school_id' => $this->tenancy()->schoolId(),
            'status' => 'active',
        ]);
        $user->tenant_id = $this->tenancy()->tenantId();
        $user->email_verified_at ??= now();
        $user->save();

        $employee->update(['user_id' => $user->id, 'email' => $employee->email ?: $data['email']]);

        $role = Role::find($data['role_id'])?->name;
        $this->audit($isNew ? 'login_created' : 'login_reset', $employee, ($isNew ? 'System login created' : 'System login reset')." for {$employee->full_name} ({$data['email']}, role {$role})", 'hr');
        $this->toast("Login ready for {$data['email']}. Temporary password: {$password}", 'info');

        return back();
    }

    private function canSeeSalary(Request $request): bool
    {
        return $request->user()->can('hr.manage') || $request->user()->can('payroll.view');
    }

    /** @return array<string, mixed> */
    private function formProps(?Employee $employee): array
    {
        return [
            'employee' => $employee ? [
                ...$employee->toArray(),
                'date_of_birth' => $employee->date_of_birth?->toDateString(),
                'hire_date' => $employee->hire_date?->toDateString(),
                'contract_end_date' => $employee->contract_end_date?->toDateString(),
            ] : null,
            'departments' => Lookups::departments(),
            'categories' => Lookups::enum(self::CATEGORIES),
            'types' => Lookups::enum(self::EMPLOYMENT_TYPES),
            'designations' => Employee::whereNotNull('designation')->distinct()->orderBy('designation')->pluck('designation'),
            'banks' => ['CRDB Bank', 'NMB Bank', 'NBC Bank', 'Stanbic Bank', 'Exim Bank', 'Absa Bank', 'Equity Bank', 'DTB', 'Azania Bank', 'TCB Bank'],
            'components' => SalaryComponent::active()->where('is_statutory', false)->count(),
        ];
    }

    /** @param  array<string, mixed>  $filters */
    private function filteredQuery(array $filters)
    {
        $search = $filters['search'] ?? null;

        return Employee::query()
            ->when($search, fn ($q) => $q->where(fn ($q) => $q
                ->where('first_name', 'like', "%{$search}%")
                ->orWhere('last_name', 'like', "%{$search}%")
                ->orWhere('employee_no', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
                ->orWhere('designation', 'like', "%{$search}%")
                ->orWhereRaw("CONCAT(first_name, ' ', last_name) like ?", ["%{$search}%"])))
            ->when($filters['department'] ?? null, fn ($q, $v) => $q->where('department_id', $v))
            ->when($filters['category'] ?? null, fn ($q, $v) => $q->where('category', $v))
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('employment_type', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when(($filters['contract'] ?? null) === 'expiring', fn ($q) => $q->whereNot('status', 'terminated')
                ->whereBetween('contract_end_date', [now()->toDateString(), now()->addDays(60)->toDateString()]));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Employee $employee = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'employee_no' => ['nullable', 'string', 'max:30', Rule::unique('employees')->where('school_id', $schoolId)->ignore($employee?->id)],
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'gender' => ['required', Rule::in(['male', 'female'])],
            'date_of_birth' => ['nullable', 'date', 'before:-15 years'],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:150'],
            'national_id' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'emergency_contact' => ['nullable', 'string', 'max:150'],
            'designation' => ['required', 'string', 'max:100'],
            'department_id' => ['nullable', Rule::exists('departments', 'id')->where('school_id', $schoolId)],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'employment_type' => ['required', Rule::in(self::EMPLOYMENT_TYPES)],
            'qualification' => ['nullable', 'string', 'max:150'],
            'hire_date' => ['nullable', 'date'],
            'contract_end_date' => ['nullable', 'date', 'after_or_equal:hire_date', Rule::requiredIf($request->input('employment_type') === 'contract')],
            'basic_salary' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'bank_account' => ['nullable', 'string', 'max:40'],
            'nssf_no' => ['nullable', 'string', 'max:40'],
            'tin' => ['nullable', 'string', 'max:40'],
        ], [
            'date_of_birth.before' => 'Employees must be at least 15 years old.',
            'contract_end_date.required' => 'Contract staff need a contract end date.',
        ], ['department_id' => 'department', 'tin' => 'TIN', 'nssf_no' => 'NSSF number']);
    }
}
