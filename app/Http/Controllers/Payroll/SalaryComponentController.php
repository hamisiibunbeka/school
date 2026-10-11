<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\SalaryComponent;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Salary components (allowances, deductions, employer contributions) and per-employee assignments. */
class SalaryComponentController extends Controller
{
    public function index(Request $request): Response
    {
        $schoolId = $this->tenancy()->schoolId();
        $filters = ['search' => $request->string('search')->toString(), 'component' => $request->string('component')->toString()];

        $components = SalaryComponent::with('account:id,code,name')->withCount('assignments')
            ->orderByRaw("FIELD(type, 'allowance', 'deduction', 'employer_contribution')")->orderBy('name')->get()
            ->map(fn (SalaryComponent $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'type' => $c->type,
                'calculation' => $c->calculation,
                'value' => (string) (float) $c->value,
                'is_statutory' => $c->is_statutory,
                'applies_to_all' => $c->applies_to_all,
                'is_active' => $c->is_active,
                'account_id' => $c->account_id,
                'account' => $c->account ? "{$c->account->code} · {$c->account->name}" : null,
                'assignments_count' => $c->assignments_count,
            ]);

        $assignments = DB::table('employee_salary_components as esc')
            ->join('salary_components as sc', 'sc.id', '=', 'esc.salary_component_id')
            ->join('employees as e', 'e.id', '=', 'esc.employee_id')
            ->where('sc.school_id', $schoolId)->where('e.school_id', $schoolId)
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('e.first_name', 'like', "%{$s}%")->orWhere('e.last_name', 'like', "%{$s}%")->orWhere('e.employee_no', 'like', "%{$s}%")))
            ->when($filters['component'], fn ($q, $v) => $q->where('sc.id', $v))
            ->orderBy('sc.name')->orderBy('e.first_name')
            ->select(['esc.id', 'esc.amount', 'esc.employee_id', 'e.employee_no', 'e.first_name', 'e.last_name', 'e.basic_salary', 'e.status as employee_status',
                'sc.id as component_id', 'sc.name as component', 'sc.type', 'sc.calculation', 'sc.value'])
            ->paginate($this->perPage())->withQueryString()
            ->through(function ($r) {
                $effective = $r->amount !== null
                    ? (string) $r->amount
                    : match ($r->calculation) {
                        'fixed' => (string) $r->value,
                        'percent_of_basic' => bcdiv(bcmul((string) $r->basic_salary, (string) $r->value, 4), '100', 2),
                        default => null,
                    };

                return [
                    'id' => $r->id,
                    'employee_id' => $r->employee_id,
                    'employee' => trim("{$r->first_name} {$r->last_name}"),
                    'employee_no' => $r->employee_no,
                    'employee_status' => $r->employee_status,
                    'component_id' => $r->component_id,
                    'component' => $r->component,
                    'type' => $r->type,
                    'calculation' => $r->calculation,
                    'value' => (string) (float) $r->value,
                    'amount' => $r->amount,
                    'effective' => $effective,
                ];
            });

        return Inertia::render('payroll/components', [
            'components' => $components,
            'assignments' => $assignments,
            'filters' => $filters,
            'accounts' => Lookups::accounts(['liability', 'expense', 'asset']),
            'employees' => Lookups::employees(),
            'canManage' => $request->user()->can('payroll.manage'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $component = SalaryComponent::create($this->validated($request));
        $this->audit('created', $component, "Created salary component {$component->name}", 'payroll', null, $component->only(['type', 'calculation', 'value']));
        $this->toast('Salary component created.');

        return back();
    }

    public function update(Request $request, SalaryComponent $component): RedirectResponse
    {
        $data = $this->validated($request, $component);
        $old = $component->only(['name', 'type', 'calculation', 'value', 'applies_to_all', 'account_id', 'is_active']);

        if ($component->is_statutory) {
            // Statutory components keep their identity; only rate, GL account and status may change.
            $data = collect($data)->only(['value', 'account_id', 'is_active', 'name'])->all();
        }

        $component->update($data);
        $this->audit('updated', $component, "Updated salary component {$component->name}", 'payroll', $old, $component->only(array_keys($old)));
        $this->toast('Salary component updated.');

        return back();
    }

    public function destroy(SalaryComponent $component): RedirectResponse
    {
        if ($component->is_statutory) {
            $this->toast('Statutory components cannot be deleted. Deactivate it instead.', 'error');

            return back();
        }

        $component->delete();
        $this->audit('deleted', $component, "Deleted salary component {$component->name}", 'payroll');
        $this->toast('Salary component deleted. Past payslips keep their stored breakdown.');

        return back();
    }

    /** Assign a component to one or more employees (optional override amount). */
    public function assign(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'salary_component_id' => ['required', Rule::exists('salary_components', 'id')->where('school_id', $schoolId)],
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => [Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
        ], [], ['salary_component_id' => 'component', 'employee_ids' => 'employees']);

        $component = SalaryComponent::findOrFail($data['salary_component_id']);
        $amount = ($data['amount'] ?? null) === null || $data['amount'] === '' ? null : $data['amount'];

        foreach (array_unique($data['employee_ids']) as $employeeId) {
            EmployeeSalaryComponent::updateOrCreate(
                ['employee_id' => $employeeId, 'salary_component_id' => $component->id],
                ['amount' => $amount],
            );
        }

        $count = count(array_unique($data['employee_ids']));
        $this->audit('assigned', $component, "Assigned {$component->name} to {$count} employee(s)".($amount !== null ? " at {$amount}" : ''), 'payroll', null, ['employee_ids' => $data['employee_ids'], 'amount' => $amount]);
        $this->toast("{$component->name} assigned to {$count} employee(s).");

        return back();
    }

    public function updateAssignment(Request $request, EmployeeSalaryComponent $assignment): RedirectResponse
    {
        $this->authorizeAssignment($assignment);
        $data = $request->validate(['amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999']]);
        $old = $assignment->amount;
        $assignment->update(['amount' => $data['amount'] ?? null]);

        $employee = Employee::find($assignment->employee_id);
        $this->audit('updated', $employee, "Changed {$assignment->component?->name} override for {$employee?->full_name}", 'payroll', ['amount' => $old], ['amount' => $data['amount'] ?? null]);
        $this->toast('Assignment updated.');

        return back();
    }

    public function unassign(EmployeeSalaryComponent $assignment): RedirectResponse
    {
        $this->authorizeAssignment($assignment);
        $employee = Employee::find($assignment->employee_id);
        $name = $assignment->component?->name;
        $assignment->delete();

        $this->audit('unassigned', $employee, "Removed {$name} from {$employee?->full_name}", 'payroll');
        $this->toast('Component removed from employee.');

        return back();
    }

    /** Assignments have no school_id: verify through the school-scoped parents. */
    private function authorizeAssignment(EmployeeSalaryComponent $assignment): void
    {
        abort_unless(
            SalaryComponent::whereKey($assignment->salary_component_id)->exists() && Employee::whereKey($assignment->employee_id)->exists(),
            404,
        );
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?SalaryComponent $component = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'code' => ['nullable', 'string', 'max:20', 'alpha_dash', Rule::unique('salary_components')->where('school_id', $schoolId)->ignore($component?->id)],
            'type' => ['required', Rule::in(SalaryComponent::TYPES)],
            'calculation' => ['required', Rule::in(SalaryComponent::CALCULATIONS)],
            'value' => ['nullable', 'required_unless:calculation,paye', 'numeric', 'min:0', 'max:9999999999', Rule::when($request->input('calculation') === 'percent_of_basic', ['max:100'])],
            'applies_to_all' => ['boolean'],
            'is_active' => ['boolean'],
            'account_id' => ['nullable', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('is_postable', true)],
        ], [], ['account_id' => 'GL account']);

        $data['value'] ??= 0;

        return $data;
    }
}
