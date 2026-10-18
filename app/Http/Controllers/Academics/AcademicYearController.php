<?php

namespace App\Http\Controllers\Academics;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Term;
use App\Support\EducationLevel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Academic years with nested terms (SRS 4.6). */
class AcademicYearController extends Controller
{
    public function index(): Response
    {
        $schoolId = $this->tenancy()->schoolId();

        $enrolments = DB::table('enrolments')->where('enrolments.school_id', $schoolId)
            ->selectRaw('academic_year_id, COUNT(*) as total')->groupBy('academic_year_id')->pluck('total', 'academic_year_id');

        $years = AcademicYear::with('terms')->orderByDesc('start_date')->get()->map(fn (AcademicYear $y) => [
            'id' => $y->id,
            'name' => $y->name,
            'education_level' => $y->education_level,
            'start_date' => $y->start_date?->toDateString(),
            'end_date' => $y->end_date?->toDateString(),
            'is_current' => $y->is_current,
            'enrolments' => (int) ($enrolments[$y->id] ?? 0),
            'terms' => $y->terms->map(fn (Term $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'start_date' => $t->start_date?->toDateString(),
                'end_date' => $t->end_date?->toDateString(),
                'is_current' => $t->is_current,
            ])->values(),
        ]);

        return Inertia::render('academics/years', ['years' => $years, 'levels' => EducationLevel::options()]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validateYear($request);
        $year = DB::transaction(function () use ($data) {
            if ($data['is_current'] ?? false) {
                $this->clearCurrent($data['education_level']);
            }

            return AcademicYear::create($data);
        });

        $this->audit('created', $year, "Created academic year {$year->name}", 'academics');
        $this->toast("Academic year {$year->name} created.");

        return back();
    }

    public function update(Request $request, AcademicYear $year): RedirectResponse
    {
        $data = $this->validateYear($request);
        if ($data['education_level'] !== $year->education_level && $this->yearInUse($year)) {
            $this->toast("{$year->name} already has enrolments, exams or invoices; its level cannot change.", 'error');

            return back();
        }
        $old = $year->only(['name', 'start_date', 'end_date', 'is_current', 'education_level']);

        DB::transaction(function () use ($year, $data) {
            if ($data['is_current'] ?? false) {
                $this->clearCurrent($data['education_level'], $year->id);
            }
            $year->update($data);
        });

        $this->audit('updated', $year, "Updated academic year {$year->name}", 'academics', $old, $year->only(array_keys($old)));
        $this->toast('Academic year updated.');

        return back();
    }

    public function destroy(AcademicYear $year): RedirectResponse
    {
        if ($this->yearInUse($year)) {
            $this->toast("{$year->name} has enrolments, exams or other records and cannot be deleted.", 'error');

            return back();
        }

        $year->delete();
        $this->audit('deleted', $year, "Deleted academic year {$year->name}", 'academics');
        $this->toast('Academic year deleted.');

        return back();
    }

    public function setCurrent(AcademicYear $year): RedirectResponse
    {
        DB::transaction(function () use ($year) {
            $this->clearCurrent($year->education_level, $year->id);
            $year->update(['is_current' => true]);
        });

        $label = EducationLevel::label($year->education_level);
        $this->audit('set_current', $year, "Set {$year->name} as the current {$label} academic year", 'academics');
        $this->toast("{$year->name} is now the current {$label} academic year.");

        return back();
    }

    public function storeTerm(Request $request, AcademicYear $year): RedirectResponse
    {
        $data = $this->validateTerm($request, $year);

        $term = DB::transaction(function () use ($year, $data) {
            if ($data['is_current'] ?? false) {
                $this->clearCurrentTerm($year->education_level);
            }

            return $year->terms()->create($data);
        });

        $this->audit('created', $term, "Added {$term->name} to {$year->name}", 'academics');
        $this->toast("{$term->name} added.");

        return back();
    }

    public function updateTerm(Request $request, Term $term): RedirectResponse
    {
        $data = $this->validateTerm($request, $term->academicYear);

        DB::transaction(function () use ($term, $data) {
            if ($data['is_current'] ?? false) {
                $this->clearCurrentTerm($term->academicYear->education_level, $term->id);
            }
            $term->update($data);
        });

        $this->audit('updated', $term, "Updated term {$term->name}", 'academics');
        $this->toast('Term updated.');

        return back();
    }

    public function destroyTerm(Term $term): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $used = DB::table('exams')->where('exams.school_id', $schoolId)->where('term_id', $term->id)->exists()
            || DB::table('lesson_plans')->where('lesson_plans.school_id', $schoolId)->where('term_id', $term->id)->exists()
            || $this->tableHasTerm('invoices', $term->id);

        if ($used) {
            $this->toast("{$term->name} is referenced by exams, invoices or lesson plans and cannot be deleted.", 'error');

            return back();
        }

        $term->delete();
        $this->audit('deleted', $term, "Deleted term {$term->name}", 'academics');
        $this->toast('Term deleted.');

        return back();
    }

    public function setCurrentTerm(Term $term): RedirectResponse
    {
        DB::transaction(function () use ($term) {
            $level = $term->academicYear->education_level;
            $this->clearCurrentTerm($level, $term->id);
            $term->update(['is_current' => true]);
            // The year that owns the current term becomes the current year of its level too.
            $this->clearCurrent($level, $term->academic_year_id);
            AcademicYear::whereKey($term->academic_year_id)->update(['is_current' => true]);
        });

        $this->audit('set_current', $term, "Set {$term->name} as the current term", 'academics');
        $this->toast("{$term->name} is now the current term.");

        return back();
    }

    /** O-Level and A-Level each keep their own current year. */
    private function clearCurrent(string $level, ?int $exceptId = null): void
    {
        AcademicYear::where('education_level', $level)->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))->update(['is_current' => false]);
    }

    private function clearCurrentTerm(string $level, ?int $exceptId = null): void
    {
        Term::whereHas('academicYear', fn ($q) => $q->where('education_level', $level))
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))
            ->update(['is_current' => false]);
    }

    private function yearInUse(AcademicYear $year): bool
    {
        $schoolId = $this->tenancy()->schoolId();

        foreach (['enrolments', 'exams', 'admission_applications'] as $table) {
            if (DB::table($table)->where("{$table}.school_id", $schoolId)->where('academic_year_id', $year->id)->exists()) {
                return true;
            }
        }

        $termIds = $year->terms()->pluck('id');

        return $termIds->isNotEmpty() && (
            DB::table('lesson_plans')->where('lesson_plans.school_id', $schoolId)->whereIn('term_id', $termIds)->exists()
            || $termIds->contains(fn ($id) => $this->tableHasTerm('invoices', $id))
        );
    }

    /** Defensive check for module tables that may carry a term_id column. */
    private function tableHasTerm(string $table, int $termId): bool
    {
        if (! Schema::hasColumn($table, 'term_id')) {
            return false;
        }

        return DB::table($table)->where("{$table}.school_id", $this->tenancy()->schoolId())->where('term_id', $termId)->exists();
    }

    /** @return array<string, mixed> */
    private function validateYear(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'education_level' => ['required', Rule::in(EducationLevel::ALL)],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after:start_date'],
            'is_current' => ['boolean'],
        ]);
    }

    /** @return array<string, mixed> */
    private function validateTerm(Request $request, AcademicYear $year): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'start_date' => ['required', 'date', 'after_or_equal:'.$year->start_date->toDateString(), 'before_or_equal:'.$year->end_date->toDateString()],
            'end_date' => ['required', 'date', 'after:start_date', 'before_or_equal:'.$year->end_date->toDateString()],
            'is_current' => ['boolean'],
        ], [
            'start_date.after_or_equal' => 'The term must start within the academic year.',
            'start_date.before_or_equal' => 'The term must start within the academic year.',
            'end_date.before_or_equal' => 'The term must end within the academic year.',
        ]);
    }
}
