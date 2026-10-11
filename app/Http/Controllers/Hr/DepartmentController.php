<?php

namespace App\Http\Controllers\Hr;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Employee;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DepartmentController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->string('search')->toString();

        $departments = Department::query()
            ->withCount([
                'employees as headcount' => fn ($q) => $q->whereIn('status', ['active', 'on_leave']),
                'employees as teaching_count' => fn ($q) => $q->whereIn('status', ['active', 'on_leave'])->where('category', 'teaching'),
                'subjects',
            ])
            ->when($search, fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%")))
            ->orderBy('name')
            ->get();

        $heads = Employee::whereIn('department_id', $departments->pluck('id'))->whereIn('status', ['active', 'on_leave'])
            ->where(fn ($q) => $q->where('designation', 'like', '%Head%')->orWhere('designation', 'like', '%HOD%'))
            ->get(['id', 'department_id', 'first_name', 'last_name'])->keyBy('department_id');

        $unassigned = Employee::whereNull('department_id')->whereIn('status', ['active', 'on_leave'])->count();

        return Inertia::render('hr/departments', [
            'departments' => $departments->map(fn (Department $d) => [
                'id' => $d->id,
                'name' => $d->name,
                'code' => $d->code,
                'headcount' => $d->headcount,
                'teaching_count' => $d->teaching_count,
                'subjects_count' => $d->subjects_count,
                'head' => $heads->get($d->id)?->full_name,
            ]),
            'filters' => ['search' => $search],
            'unassigned' => $unassigned,
            'total' => Employee::whereIn('status', ['active', 'on_leave'])->count(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $department = Department::create($this->validated($request));
        $this->audit('created', $department, "Created department {$department->name}", 'hr');
        $this->toast('Department created.');

        return back();
    }

    public function update(Request $request, Department $department): RedirectResponse
    {
        $old = $department->only(['name', 'code']);
        $department->update($this->validated($request, $department));
        $this->audit('updated', $department, "Updated department {$department->name}", 'hr', $old, $department->only(['name', 'code']));
        $this->toast('Department updated.');

        return back();
    }

    public function destroy(Department $department): RedirectResponse
    {
        if ($department->employees()->exists()) {
            $this->toast('Move staff out of this department before deleting it.', 'error');

            return back();
        }

        $department->delete();
        $this->audit('deleted', $department, "Deleted department {$department->name}", 'hr');
        $this->toast('Department deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Department $department = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('departments')->where('school_id', $schoolId)->ignore($department?->id)],
            'code' => ['nullable', 'string', 'max:20', Rule::unique('departments')->where('school_id', $schoolId)->ignore($department?->id)],
        ]);
    }
}
