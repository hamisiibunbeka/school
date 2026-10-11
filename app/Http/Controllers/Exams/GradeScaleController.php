<?php

namespace App\Http\Controllers\Exams;

use App\Http\Controllers\Controller;
use App\Models\GradeScale;
use App\Services\Exams\TeacherAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Grade boundaries (percentage → grade, points, remark).
 * Grades are frozen on each mark when saved, so editing the scale never silently
 * recalculates previously published results (SRS 4.6).
 */
class GradeScaleController extends Controller
{
    public function __construct(private TeacherAccess $access) {}

    public function index(Request $request): Response
    {
        $grades = GradeScale::orderByDesc('min_score')->get();

        // Gaps in 0–100 coverage are flagged for the administrator.
        $gaps = [];
        $sorted = $grades->sortBy('min_score')->values();
        $cursor = 0.0;
        foreach ($sorted as $g) {
            if ((float) $g->min_score - $cursor > 0.011) {
                $gaps[] = [round($cursor, 2), round((float) $g->min_score - 0.01, 2)];
            }
            $cursor = max($cursor, (float) $g->max_score + 0.01);
        }
        if ($sorted->isNotEmpty() && $cursor < 100) {
            $gaps[] = [round($cursor, 2), 100];
        }

        return Inertia::render('exams/grading', [
            'grades' => $grades->map(fn ($g) => [
                'id' => $g->id,
                'grade' => $g->grade,
                'min_score' => (float) $g->min_score,
                'max_score' => (float) $g->max_score,
                'points' => (float) $g->points,
                'remark' => $g->remark,
            ])->values(),
            'gaps' => $gaps,
            'canManage' => $request->user()->can('exams.manage') && ! $this->access->isRestricted($request->user()),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $this->authorizeManage($request);
        $grade = GradeScale::create($this->validated($request));
        $this->audit('created', $grade, "Added grade {$grade->grade} ({$grade->min_score}–{$grade->max_score})", 'exams');
        $this->toast("Grade {$grade->grade} added.");

        return back();
    }

    public function update(Request $request, GradeScale $grade): RedirectResponse
    {
        $this->authorizeManage($request);
        $old = $grade->only(['grade', 'min_score', 'max_score', 'points', 'remark']);
        $grade->update($this->validated($request, $grade));
        $this->audit('updated', $grade, "Updated grade {$grade->grade}", 'exams', $old, $grade->only(array_keys($old)));
        $this->toast("Grade {$grade->grade} updated. Existing marks keep the grade they were saved with.");

        return back();
    }

    public function destroy(Request $request, GradeScale $grade): RedirectResponse
    {
        $this->authorizeManage($request);
        $grade->delete();
        $this->audit('deleted', $grade, "Deleted grade {$grade->grade}", 'exams', $grade->only(['grade', 'min_score', 'max_score', 'points']));
        $this->toast("Grade {$grade->grade} removed.");

        return back();
    }

    private function authorizeManage(Request $request): void
    {
        abort_if($this->access->isRestricted($request->user()), 403, 'Only academic administrators can change the grading scale.');
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?GradeScale $grade = null): array
    {
        $data = $request->validate([
            'grade' => ['required', 'string', 'max:5', Rule::unique('grade_scales', 'grade')->where('school_id', $this->tenancy()->schoolId())->ignore($grade?->id)],
            'min_score' => ['required', 'numeric', 'min:0', 'max:100'],
            'max_score' => ['required', 'numeric', 'min:0', 'max:100', 'gte:min_score'],
            'points' => ['required', 'numeric', 'min:0', 'max:99'],
            'remark' => ['nullable', 'string', 'max:100'],
        ], ['max_score.gte' => 'The maximum must be greater than or equal to the minimum.']);

        $overlap = GradeScale::query()
            ->when($grade, fn ($q) => $q->whereKeyNot($grade->id))
            ->where('min_score', '<=', $data['max_score'])
            ->where('max_score', '>=', $data['min_score'])
            ->first();

        if ($overlap) {
            throw ValidationException::withMessages([
                'min_score' => "This range overlaps grade {$overlap->grade} ({$overlap->min_score}–{$overlap->max_score}).",
            ]);
        }

        return $data;
    }
}
