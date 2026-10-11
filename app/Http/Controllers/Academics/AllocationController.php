<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\ClassSubject;
use App\Models\Employee;
use App\Models\SchoolClass;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Teacher-to-class/subject allocation with workload limits (SRS 4.6). */
class AllocationController extends Controller
{
    /** Weekly periods above which a teacher is flagged as overloaded. */
    public const MAX_PERIODS = 30;

    public function index(): Response
    {
        $classes = SchoolClass::withCount('streams')->orderBy('level')->orderBy('name')->get(['id', 'name', 'code', 'level']);
        $streamCounts = $classes->pluck('streams_count', 'id');

        $allocations = ClassSubject::with(['subject:id,name,code,type', 'teacher:id,first_name,last_name,employee_no', 'stream:id,name'])
            ->get()
            ->map(fn (ClassSubject $a) => [
                'id' => $a->id,
                'school_class_id' => $a->school_class_id,
                'stream_id' => $a->stream_id,
                'stream' => $a->stream?->name,
                'subject_id' => $a->subject_id,
                'subject' => $a->subject?->name,
                'subject_code' => $a->subject?->code,
                'subject_type' => $a->subject?->type,
                'employee_id' => $a->employee_id,
                'teacher' => $a->teacher?->full_name,
                'periods_per_week' => $a->periods_per_week,
                // A class-wide allocation is taught separately in every stream.
                'effective_periods' => (int) $a->periods_per_week * ($a->stream_id ? 1 : max(1, (int) ($streamCounts[$a->school_class_id] ?? 1))),
            ])
            ->sortBy('subject')->values();

        $teachers = Employee::teachers()->active()->orderBy('first_name')->get(['id', 'first_name', 'last_name', 'employee_no', 'designation']);
        $workload = $teachers->map(function (Employee $t) use ($allocations) {
            $mine = $allocations->where('employee_id', $t->id);

            return [
                'id' => $t->id,
                'name' => $t->full_name,
                'employee_no' => $t->employee_no,
                'designation' => $t->designation,
                'allocations' => $mine->count(),
                'periods' => (int) $mine->sum('effective_periods'),
                'subjects' => $mine->pluck('subject')->unique()->values(),
            ];
        })->sortByDesc('periods')->values();

        return Inertia::render('academics/allocations', [
            'classes' => $classes->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'code' => $c->code, 'streams_count' => $c->streams_count])->values(),
            'allocations' => $allocations,
            'workload' => $workload,
            'maxPeriods' => self::MAX_PERIODS,
            'subjects' => Lookups::subjects(),
            'teachers' => Lookups::teachers(),
            'classOptions' => Lookups::classes(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $allocation = ClassSubject::create($data);
        $allocation->load(['subject', 'schoolClass']);

        $this->audit('created', $allocation, "Added {$allocation->subject?->name} to {$allocation->schoolClass?->name}", 'academics');
        $this->toast("{$allocation->subject?->name} added to {$allocation->schoolClass?->name}.");
        $this->warnIfOverloaded($data['employee_id'] ?? null);

        return back();
    }

    public function update(Request $request, ClassSubject $allocation): RedirectResponse
    {
        $data = $this->validated($request, $allocation);
        $old = $allocation->only(['employee_id', 'periods_per_week', 'stream_id']);
        $allocation->update($data);

        $this->audit('updated', $allocation, 'Changed teacher allocation', 'academics', $old, $allocation->only(array_keys($old)));
        $this->toast('Allocation updated.');
        $this->warnIfOverloaded($data['employee_id'] ?? null);

        return back();
    }

    public function destroy(ClassSubject $allocation): RedirectResponse
    {
        $allocation->load(['subject', 'schoolClass']);
        $allocation->delete();
        $this->audit('deleted', $allocation, "Removed {$allocation->subject?->name} from {$allocation->schoolClass?->name}", 'academics');
        $this->toast('Subject removed from class.');

        return back();
    }

    private function warnIfOverloaded(?int $employeeId): void
    {
        if (! $employeeId) {
            return;
        }

        $periods = ClassSubject::with('schoolClass')->where('employee_id', $employeeId)->get()
            ->sum(fn (ClassSubject $a) => (int) $a->periods_per_week * ($a->stream_id ? 1 : max(1, $a->schoolClass?->streams()->count() ?? 1)));

        if ($periods > self::MAX_PERIODS) {
            $name = Employee::find($employeeId)?->full_name;
            $this->toast("Saved, but {$name} now carries {$periods} periods/week (limit ".self::MAX_PERIODS.').', 'warning');
        }
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?ClassSubject $allocation = null): array
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'subject_id' => ['required', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'employee_id' => ['nullable', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'periods_per_week' => ['required', 'integer', 'min:1', 'max:20'],
        ], [], ['school_class_id' => 'class', 'stream_id' => 'stream', 'subject_id' => 'subject', 'employee_id' => 'teacher']);

        $duplicate = ClassSubject::where('school_class_id', $data['school_class_id'])
            ->where('subject_id', $data['subject_id'])
            ->where(fn ($q) => empty($data['stream_id']) ? $q->whereNull('stream_id') : $q->where('stream_id', $data['stream_id']))
            ->when($allocation, fn ($q) => $q->whereKeyNot($allocation->id))
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages(['subject_id' => 'This subject is already allocated to that class/stream.']);
        }

        return $data;
    }
}
