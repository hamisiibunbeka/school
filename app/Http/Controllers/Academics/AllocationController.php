<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\ClassSubject;
use App\Models\SchoolClass;
use App\Services\Academics\WorkloadService;
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
    public function __construct(private WorkloadService $workload) {}

    public function index(): Response
    {
        $classes = SchoolClass::withCount('streams')->orderBy('level')->orderBy('name')->get(['id', 'name', 'code', 'level', 'education_level']);

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
                'is_joint' => $a->is_joint,
                // Class-wide: taught separately in every stream (A-Level: every stream whose combination takes it), unless joint.
                'effective_periods' => $this->workload->effectivePeriods($a),
            ])
            ->sortBy('subject')->values();

        return Inertia::render('academics/allocations', [
            'classes' => $classes->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'code' => $c->code, 'streams_count' => $c->streams_count, 'education_level' => $c->education_level])->values(),
            'allocations' => $allocations,
            'workload' => $this->workload->teachers(),
            'workloadSettings' => $this->workload->settings(),
            'subjects' => Lookups::subjects(),
            'teachers' => Lookups::teachers(),
            'classOptions' => Lookups::classes(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $result = $this->workload->check($data['employee_id'] ?? null, $this->workload->effectivePeriods($data));
        $allocation = ClassSubject::create($data);
        $allocation->load(['subject', 'schoolClass']);

        $this->audit('created', $allocation, "Added {$allocation->subject?->name} to {$allocation->schoolClass?->name}", 'academics');
        $this->toast("{$allocation->subject?->name} added to {$allocation->schoolClass?->name}.");
        $this->warnIfOver($result);

        return back();
    }

    public function update(Request $request, ClassSubject $allocation): RedirectResponse
    {
        $data = $this->validated($request, $allocation);
        $result = $this->workload->check($data['employee_id'] ?? null, $this->workload->effectivePeriods($data + $allocation->only(['school_class_id', 'subject_id'])), $allocation->id);
        $old = $allocation->only(['employee_id', 'periods_per_week', 'stream_id', 'is_joint']);
        $allocation->update($data);

        $this->audit('updated', $allocation, 'Changed teacher allocation', 'academics', $old, $allocation->only(array_keys($old)));
        $this->toast('Allocation updated.');
        $this->warnIfOver($result);

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

    /** "Warn" mode: the save went through, but tell the user the teacher is now above their limit. */
    private function warnIfOver(?array $result): void
    {
        if ($result && $result['over']) {
            $this->toast("Saved, but {$result['name']} now carries {$result['total']} periods/week (limit {$result['limit']}).", 'warning');
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
            'is_joint' => ['boolean'],
        ], [], ['school_class_id' => 'class', 'stream_id' => 'stream', 'subject_id' => 'subject', 'employee_id' => 'teacher']);

        $duplicate = ClassSubject::where('school_class_id', $data['school_class_id'])
            ->where('subject_id', $data['subject_id'])
            ->where(fn ($q) => empty($data['stream_id']) ? $q->whereNull('stream_id') : $q->where('stream_id', $data['stream_id']))
            ->when($allocation, fn ($q) => $q->whereKeyNot($allocation->id))
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages(['subject_id' => 'This subject is already allocated to that class/stream.']);
        }

        // "Taught jointly" only applies to class-wide allocations.
        $data['is_joint'] = empty($data['stream_id']) && ! empty($data['is_joint']);

        return $data;
    }
}
