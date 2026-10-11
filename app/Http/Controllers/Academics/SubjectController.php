<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\Subject;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Subjects catalogue (SRS 4.6). */
class SubjectController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'type' => '', 'department' => ''], $request->only(['search', 'type', 'department']));
        $schoolId = $this->tenancy()->schoolId();

        $classCounts = DB::table('class_subjects')->where('class_subjects.school_id', $schoolId)
            ->selectRaw('subject_id, COUNT(DISTINCT school_class_id) as classes, COUNT(DISTINCT employee_id) as teachers, SUM(COALESCE(periods_per_week,0)) as periods')
            ->groupBy('subject_id')->get()->keyBy('subject_id');

        $subjects = Subject::with('department:id,name')
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('name', 'like', "%{$v}%")->orWhere('code', 'like', "%{$v}%")))
            ->when($filters['type'], fn ($q, $v) => $q->where('type', $v))
            ->when($filters['department'], fn ($q, $v) => $q->where('department_id', $v))
            ->orderBy('name')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Subject $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'code' => $s->code,
                'type' => $s->type,
                'department_id' => $s->department_id,
                'department' => $s->department?->name,
                'classes' => (int) ($classCounts[$s->id]->classes ?? 0),
                'teachers' => (int) ($classCounts[$s->id]->teachers ?? 0),
                'periods' => (int) ($classCounts[$s->id]->periods ?? 0),
            ]);

        return Inertia::render('academics/subjects', [
            'subjects' => $subjects,
            'filters' => $filters,
            'departments' => Lookups::departments(),
            'stats' => [
                'total' => Subject::count(),
                'core' => Subject::where('type', 'core')->count(),
                'elective' => Subject::where('type', 'elective')->count(),
                'unallocated' => Subject::whereNotIn('id', DB::table('class_subjects')->where('class_subjects.school_id', $schoolId)->select('subject_id'))->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $subject = Subject::create($this->validated($request));
        $this->audit('created', $subject, "Created subject {$subject->name}", 'academics');
        $this->toast("{$subject->name} added.");

        return back();
    }

    public function update(Request $request, Subject $subject): RedirectResponse
    {
        $old = $subject->only(['name', 'code', 'type', 'department_id']);
        $subject->update($this->validated($request, $subject));
        $this->audit('updated', $subject, "Updated subject {$subject->name}", 'academics', $old, $subject->only(array_keys($old)));
        $this->toast('Subject updated.');

        return back();
    }

    public function destroy(Subject $subject): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        if (DB::table('exam_marks')->where('exam_marks.school_id', $schoolId)->where('subject_id', $subject->id)->exists()) {
            $this->toast("{$subject->name} has examination marks and cannot be deleted.", 'error');

            return back();
        }

        $subject->delete();
        $this->audit('deleted', $subject, "Deleted subject {$subject->name}", 'academics');
        $this->toast('Subject deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Subject $subject = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('subjects')->where('school_id', $schoolId)->ignore($subject?->id)],
            'code' => ['nullable', 'string', 'max:20', Rule::unique('subjects')->where('school_id', $schoolId)->ignore($subject?->id)],
            'type' => ['required', Rule::in(['core', 'elective'])],
            'department_id' => ['nullable', Rule::exists('departments', 'id')->where('school_id', $schoolId)],
        ], [], ['department_id' => 'department']);
    }
}
