<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\LessonPlan;
use App\Models\Term;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Lesson plans / schemes of work and curriculum coverage (SRS 4.6). */
class LessonPlanController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(
            ['search' => '', 'class' => '', 'subject' => '', 'term' => '', 'teacher' => '', 'status' => ''],
            $request->only(['search', 'class', 'subject', 'term', 'teacher', 'status']),
        );
        // '' = current term (default view), 'all' = every term.
        $effective = [...$filters, 'term' => match ($filters['term']) {
            '' => (string) (Term::current()?->id ?? ''),
            'all' => '',
            default => $filters['term'],
        }];

        $plans = $this->filtered($effective)
            ->with(['schoolClass:id,name', 'subject:id,name,code', 'teacher:id,first_name,last_name', 'term:id,name'])
            ->orderBy('week')->orderBy('school_class_id')->orderBy('subject_id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (LessonPlan $p) => [
                'id' => $p->id,
                'school_class_id' => $p->school_class_id,
                'subject_id' => $p->subject_id,
                'employee_id' => $p->employee_id,
                'term_id' => $p->term_id,
                'week' => $p->week,
                'topic' => $p->topic,
                'sub_topic' => $p->sub_topic,
                'objectives' => $p->objectives,
                'activities' => $p->activities,
                'status' => $p->status,
                'class' => $p->schoolClass?->name,
                'subject' => $p->subject?->name,
                'teacher' => $p->teacher?->full_name,
                'term' => $p->term?->name,
            ]);

        // Coverage per class-subject ignores the status filter so percentages stay meaningful.
        $coverage = $this->filtered([...$effective, 'status' => '', 'search' => ''])
            ->join('school_classes', 'school_classes.id', '=', 'lesson_plans.school_class_id')
            ->join('subjects', 'subjects.id', '=', 'lesson_plans.subject_id')
            ->selectRaw("lesson_plans.school_class_id, lesson_plans.subject_id, school_classes.name as class, subjects.name as subject, school_classes.level,
                COUNT(*) as total, SUM(lesson_plans.status = 'taught') as taught, SUM(lesson_plans.status = 'skipped') as skipped")
            ->groupBy('lesson_plans.school_class_id', 'lesson_plans.subject_id', 'school_classes.name', 'subjects.name', 'school_classes.level')
            ->orderBy('school_classes.level')->orderBy('subjects.name')
            ->get()
            ->map(fn ($r) => [
                'key' => "{$r->school_class_id}-{$r->subject_id}",
                'class' => $r->class,
                'subject' => $r->subject,
                'total' => (int) $r->total,
                'taught' => (int) $r->taught,
                'skipped' => (int) $r->skipped,
                'percent' => $r->total ? (int) round($r->taught / $r->total * 100) : 0,
            ]);

        $totals = $this->filtered([...$effective, 'status' => '', 'search' => ''])
            ->selectRaw("COUNT(*) as total, SUM(status = 'taught') as taught, SUM(status = 'planned') as planned, SUM(status = 'skipped') as skipped")->first();

        return Inertia::render('academics/lesson-plans', [
            'plans' => $plans,
            'filters' => $filters,
            'coverage' => $coverage,
            'stats' => [
                'total' => (int) ($totals->total ?? 0),
                'taught' => (int) ($totals->taught ?? 0),
                'planned' => (int) ($totals->planned ?? 0),
                'skipped' => (int) ($totals->skipped ?? 0),
            ],
            'classes' => Lookups::classes(),
            'subjects' => Lookups::subjects(),
            'terms' => Lookups::terms(),
            'teachers' => Lookups::teachers(),
            'statuses' => Lookups::enum(LessonPlan::STATUSES),
            'currentTermId' => Term::current()?->id,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $plan = LessonPlan::create($this->validated($request));
        $this->audit('created', $plan, "Added lesson plan: {$plan->topic}", 'academics');
        $this->toast('Lesson plan saved.');

        return back();
    }

    public function update(Request $request, LessonPlan $plan): RedirectResponse
    {
        $old = $plan->only(['topic', 'status', 'week']);
        $plan->update($this->validated($request));
        $this->audit('updated', $plan, "Updated lesson plan: {$plan->topic}", 'academics', $old, $plan->only(array_keys($old)));
        $this->toast('Lesson plan updated.');

        return back();
    }

    /** Quick status change from the list (planned → taught / skipped). */
    public function status(Request $request, LessonPlan $plan): RedirectResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(LessonPlan::STATUSES)]]);
        $old = $plan->status;
        $plan->update($data);
        $this->audit('status_changed', $plan, "Lesson plan '{$plan->topic}' {$old} → {$plan->status}", 'academics', ['status' => $old], ['status' => $plan->status]);
        $this->toast('Marked as '.$plan->status.'.');

        return back();
    }

    public function destroy(LessonPlan $plan): RedirectResponse
    {
        $plan->delete();
        $this->audit('deleted', $plan, "Deleted lesson plan: {$plan->topic}", 'academics');
        $this->toast('Lesson plan deleted.');

        return back();
    }

    /** @param  array<string, string>  $filters */
    private function filtered(array $filters)
    {
        return LessonPlan::query()
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q) => $q->where('lesson_plans.topic', 'like', "%{$v}%")->orWhere('lesson_plans.sub_topic', 'like', "%{$v}%")))
            ->when($filters['class'] ?? null, fn ($q, $v) => $q->where('lesson_plans.school_class_id', $v))
            ->when($filters['subject'] ?? null, fn ($q, $v) => $q->where('lesson_plans.subject_id', $v))
            ->when($filters['term'] ?? null, fn ($q, $v) => $q->where('lesson_plans.term_id', $v))
            ->when($filters['teacher'] ?? null, fn ($q, $v) => $q->where('lesson_plans.employee_id', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('lesson_plans.status', $v));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'subject_id' => ['required', Rule::exists('subjects', 'id')->where('school_id', $schoolId)],
            'employee_id' => ['nullable', Rule::exists('employees', 'id')->where('school_id', $schoolId)],
            'term_id' => ['required', Rule::exists('terms', 'id')->where('school_id', $schoolId)],
            'week' => ['required', 'integer', 'min:1', 'max:30'],
            'topic' => ['required', 'string', 'max:200'],
            'sub_topic' => ['nullable', 'string', 'max:200'],
            'objectives' => ['nullable', 'string', 'max:2000'],
            'activities' => ['nullable', 'string', 'max:2000'],
            'status' => ['required', Rule::in(LessonPlan::STATUSES)],
        ], [], ['school_class_id' => 'class', 'subject_id' => 'subject', 'employee_id' => 'teacher', 'term_id' => 'term']);
    }
}
