<?php

namespace App\Http\Controllers\Hr;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Leave requests, approvals, balances and leave types (SRS 4.11). */
class LeaveController extends Controller
{
    private const FILTERS = ['search', 'status', 'type', 'employee', 'month'];

    public function index(Request $request): Response
    {
        $filters = $request->only(self::FILTERS);
        $year = now()->year;
        $today = now()->toDateString();
        $userId = $request->user()->id;

        $requests = LeaveRequest::query()
            ->with(['employee:id,first_name,last_name,employee_no,designation,user_id', 'leaveType:id,name,is_paid', 'approver:id,name'])
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->whereHas('employee', fn ($q) => $q->where(fn ($q) => $q
                ->where('first_name', 'like', "%{$s}%")->orWhere('last_name', 'like', "%{$s}%")->orWhere('employee_no', 'like', "%{$s}%"))))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('leave_type_id', $v))
            ->when($filters['employee'] ?? null, fn ($q, $v) => $q->where('employee_id', $v))
            ->when($filters['month'] ?? null, fn ($q, $v) => $q->where('start_date', 'like', "{$v}%"))
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->orderByDesc('start_date')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (LeaveRequest $l) => [
                'id' => $l->id,
                'employee_id' => $l->employee_id,
                'employee' => $l->employee?->full_name,
                'employee_no' => $l->employee?->employee_no,
                'designation' => $l->employee?->designation,
                'type' => $l->leaveType?->name,
                'is_paid' => (bool) $l->leaveType?->is_paid,
                'start_date' => $l->start_date->toDateString(),
                'end_date' => $l->end_date->toDateString(),
                'days' => $l->days,
                'reason' => $l->reason,
                'status' => $l->status,
                'approver' => $l->approver?->name,
                'approved_at' => $l->approved_at?->toDateTimeString(),
                'decision_note' => $l->decision_note,
                'created_at' => $l->created_at?->toDateTimeString(),
                'is_own' => $l->employee?->user_id === $userId,
            ]);

        // Balances for active staff, current year
        $employees = Employee::whereIn('status', ['active', 'on_leave'])->orderBy('first_name')->get(['id', 'first_name', 'last_name', 'employee_no', 'designation']);
        $balances = self::balancesFor($employees->pluck('id')->all(), $year);
        $types = LeaveType::withCount(['requests as used_count' => fn ($q) => $q->where('status', 'approved')->whereYear('start_date', now()->year)])->orderBy('name')->get();

        return Inertia::render('hr/leave', [
            'requests' => $requests,
            'filters' => array_merge(array_fill_keys(self::FILTERS, ''), $filters),
            'stats' => [
                'pending' => LeaveRequest::where('status', 'pending')->count(),
                'on_leave_today' => LeaveRequest::where('status', 'approved')->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)->distinct()->count('employee_id'),
                'approved_this_month' => LeaveRequest::where('status', 'approved')->where('start_date', 'like', now()->format('Y-m').'%')->count(),
                'days_taken' => (int) LeaveRequest::where('status', 'approved')->whereYear('start_date', $year)->sum('days'),
            ],
            'balances' => $employees->map(fn ($e) => [
                'id' => $e->id,
                'name' => $e->full_name,
                'employee_no' => $e->employee_no,
                'designation' => $e->designation,
                'types' => array_values($balances[$e->id] ?? []),
            ])->values(),
            'leaveTypes' => $types->map(fn ($t) => ['id' => $t->id, 'name' => $t->name, 'days_per_year' => $t->days_per_year, 'is_paid' => $t->is_paid, 'used_count' => $t->used_count]),
            'typeOptions' => $types->map(fn ($t) => ['value' => $t->id, 'label' => $t->name]),
            'employees' => Lookups::employees(),
            'statuses' => Lookups::enum(LeaveRequest::STATUSES),
            'ownEmployeeId' => Employee::where('user_id', $userId)->value('id'),
            'year' => $year,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'employee_id' => ['required', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'leave_type_id' => ['required', Rule::exists('leave_types', 'id')->where('school_id', $schoolId)],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'reason' => ['required', 'string', 'max:255'],
        ], [], ['employee_id' => 'employee', 'leave_type_id' => 'leave type']);

        $employee = Employee::findOrFail($data['employee_id']);

        // Staff without HR rights may only apply for themselves.
        if (! $request->user()->can('hr.manage') && $employee->user_id !== $request->user()->id) {
            abort(403, 'You can only apply for leave for yourself.');
        }

        $days = LeaveRequest::workingDays($data['start_date'], $data['end_date']);
        if ($days < 1) {
            throw ValidationException::withMessages(['end_date' => 'The selected dates contain no working days (weekends are excluded).']);
        }

        $overlap = LeaveRequest::where('employee_id', $employee->id)->whereIn('status', ['pending', 'approved'])
            ->whereDate('start_date', '<=', $data['end_date'])->whereDate('end_date', '>=', $data['start_date'])->exists();
        if ($overlap) {
            throw ValidationException::withMessages(['start_date' => 'These dates overlap another pending or approved leave request.']);
        }

        $type = LeaveType::findOrFail($data['leave_type_id']);
        $year = (int) substr($data['start_date'], 0, 4);
        $balance = self::balancesFor([$employee->id], $year)[$employee->id][$type->id] ?? null;
        if ($type->days_per_year > 0 && $balance && $days > $balance['remaining'] - $balance['pending']) {
            throw ValidationException::withMessages(['end_date' => "Requested {$days} days exceeds the available {$type->name} balance of ".max(0, $balance['remaining'] - $balance['pending']).' days.']);
        }

        $leave = LeaveRequest::create([...$data, 'days' => $days, 'status' => 'pending']);

        $this->audit('created', $leave, "Leave request: {$employee->full_name}, {$type->name}, {$days} day(s) from {$data['start_date']}", 'hr');
        $this->notifyApprovers($leave, $employee, $type);
        $this->toast("Leave request for {$days} working day(s) submitted for approval.");

        return back();
    }

    public function approve(Request $request, LeaveRequest $leave): RedirectResponse
    {
        return $this->decide($request, $leave, 'approved');
    }

    public function reject(Request $request, LeaveRequest $leave): RedirectResponse
    {
        return $this->decide($request, $leave, 'rejected');
    }

    /** Pending requests can be withdrawn by the applicant or HR. */
    public function cancel(Request $request, LeaveRequest $leave): RedirectResponse
    {
        $leave->load('employee');
        $isOwn = $leave->employee?->user_id === $request->user()->id;
        abort_unless($isOwn || $request->user()->can('hr.manage'), 403);

        if (! in_array($leave->status, ['pending', 'approved'], true) || ($leave->status === 'approved' && $leave->start_date->isPast() && ! $request->user()->can('hr.manage'))) {
            $this->toast('This leave request can no longer be cancelled.', 'error');

            return back();
        }

        $old = $leave->status;
        $leave->update(['status' => 'cancelled']);
        $this->audit('cancelled', $leave, "Leave request #{$leave->id} for {$leave->employee?->full_name} cancelled", 'hr', ['status' => $old], ['status' => 'cancelled']);
        $this->toast('Leave request cancelled.');

        return back();
    }

    private function decide(Request $request, LeaveRequest $leave, string $status): RedirectResponse
    {
        $data = $request->validate(['note' => [$status === 'rejected' ? 'required' : 'nullable', 'string', 'max:500']], [], ['note' => 'reason']);
        $leave->load(['employee', 'leaveType']);

        if ($leave->status !== 'pending') {
            $this->toast('Only pending requests can be approved or rejected.', 'error');

            return back();
        }

        if ($leave->employee?->user_id === $request->user()->id) {
            $this->toast('You cannot approve or reject your own leave request.', 'error');

            return back();
        }

        DB::transaction(fn () => $leave->update([
            'status' => $status,
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'decision_note' => $data['note'] ?? null,
        ]));

        $this->audit($status, $leave, ucfirst($status)." leave for {$leave->employee?->full_name}: {$leave->leaveType?->name}, {$leave->days} day(s)".(! empty($data['note']) ? " — {$data['note']}" : ''), 'hr', ['status' => 'pending'], ['status' => $status]);

        if ($leave->employee?->user_id && ($user = User::find($leave->employee->user_id))) {
            $user->notify(new SchoolNotification(
                'Leave '.$status,
                "Your {$leave->leaveType?->name} request ({$leave->start_date->format('d M')} – {$leave->end_date->format('d M Y')}) was {$status}.",
                '/hr/leave',
                $status === 'approved' ? 'success' : 'warning',
            ));
        }

        $this->toast("Leave request {$status}.");

        return back();
    }

    // ---------------- Leave types ----------------

    public function storeType(Request $request): RedirectResponse
    {
        $type = LeaveType::create($this->validatedType($request));
        $this->audit('created', $type, "Created leave type {$type->name}", 'hr');
        $this->toast('Leave type created.');

        return back();
    }

    public function updateType(Request $request, LeaveType $type): RedirectResponse
    {
        $old = $type->only(['name', 'days_per_year', 'is_paid']);
        $type->update($this->validatedType($request, $type));
        $this->audit('updated', $type, "Updated leave type {$type->name}", 'hr', $old, $type->only(['name', 'days_per_year', 'is_paid']));
        $this->toast('Leave type updated.');

        return back();
    }

    public function destroyType(LeaveType $type): RedirectResponse
    {
        if ($type->requests()->exists()) {
            $this->toast('This leave type has requests on record and cannot be deleted.', 'error');

            return back();
        }

        $type->delete();
        $this->audit('deleted', $type, "Deleted leave type {$type->name}", 'hr');
        $this->toast('Leave type deleted.');

        return back();
    }

    /**
     * Leave balances per employee per type for a calendar year:
     * remaining = days_per_year − approved days (pending shown separately).
     *
     * @param  array<int, int>  $employeeIds
     * @return array<int, array<int, array{type_id:int, type:string, entitled:int, used:int, pending:int, remaining:int, is_paid:bool}>>
     */
    public static function balancesFor(array $employeeIds, int $year): array
    {
        if (! $employeeIds) {
            return [];
        }

        $types = LeaveType::orderBy('name')->get();
        $usage = LeaveRequest::whereIn('employee_id', $employeeIds)->whereYear('start_date', $year)->whereIn('status', ['approved', 'pending'])
            ->selectRaw('employee_id, leave_type_id, status, SUM(days) as total')
            ->groupBy('employee_id', 'leave_type_id', 'status')->get();

        $map = [];
        foreach ($usage as $u) {
            $map[$u->employee_id][$u->leave_type_id][$u->status] = (int) $u->total;
        }

        $out = [];
        foreach ($employeeIds as $id) {
            foreach ($types as $t) {
                $used = $map[$id][$t->id]['approved'] ?? 0;
                $out[$id][$t->id] = [
                    'type_id' => $t->id,
                    'type' => $t->name,
                    'entitled' => (int) $t->days_per_year,
                    'used' => $used,
                    'pending' => $map[$id][$t->id]['pending'] ?? 0,
                    'remaining' => max(0, (int) $t->days_per_year - $used),
                    'is_paid' => (bool) $t->is_paid,
                ];
            }
        }

        return $out;
    }

    private function notifyApprovers(LeaveRequest $leave, Employee $employee, LeaveType $type): void
    {
        $tenantId = $this->tenancy()->tenantId();
        $roleIds = DB::table('roles')->where('tenant_id', $tenantId)->get(['id', 'permissions'])
            ->filter(fn ($r) => in_array('hr.manage', json_decode($r->permissions ?? '[]', true) ?: [], true))->pluck('id');

        User::whereIn('role_id', $roleIds)->where('school_id', $this->tenancy()->schoolId())->where('status', 'active')
            ->where('id', '!=', $employee->user_id ?? 0)->limit(10)->get()
            ->each(fn (User $u) => $u->notify(new SchoolNotification(
                'Leave request pending',
                "{$employee->full_name} applied for {$leave->days} day(s) of {$type->name}.",
                '/hr/leave?status=pending',
                'info',
            )));
    }

    /** @return array<string, mixed> */
    private function validatedType(Request $request, ?LeaveType $type = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('leave_types')->where('school_id', $this->tenancy()->schoolId())->ignore($type?->id)],
            'days_per_year' => ['required', 'integer', 'min:0', 'max:365'],
            'is_paid' => ['boolean'],
        ]);
    }
}
