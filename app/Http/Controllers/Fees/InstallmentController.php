<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\FeeInstallment;
use App\Models\FeeStructure;
use App\Models\SchoolClass;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Installment settings: how much of a year's fees is due by each date. Installment 1 is the admission clearance amount. */
class InstallmentController extends Controller
{
    public function index(Request $request): Response
    {
        $yearId = $request->integer('year') ?: AcademicYear::current()?->id;
        $year = $yearId ? AcademicYear::find($yearId) : null;

        $installments = $year ? FeeInstallment::where('academic_year_id', $year->id)->orderBy('sequence')->get()
            ->map(fn (FeeInstallment $i) => ['name' => $i->name, 'percent' => (string) (float) $i->percent, 'due_date' => $i->due_date->toDateString()]) : collect();

        // Annual fees per class (day / boarding) so the school can see what each installment means in money.
        $classes = [];
        if ($year) {
            $structures = FeeStructure::where('academic_year_id', $year->id)->get()->groupBy('school_class_id');
            foreach (SchoolClass::whereIn('id', $structures->keys())->orderBy('level')->orderBy('name')->get(['id', 'name']) as $class) {
                $rows = $structures[$class->id];
                $classes[] = [
                    'class' => $class->name,
                    'day' => (string) $rows->filter(fn ($s) => $s->appliesTo('day'))->sum('amount'),
                    'boarding' => (string) $rows->filter(fn ($s) => $s->appliesTo('boarding'))->sum('amount'),
                ];
            }
        }

        $configured = FeeInstallment::query()->selectRaw('academic_year_id, COUNT(*) as total')->groupBy('academic_year_id')->pluck('total', 'academic_year_id');

        return Inertia::render('fees/installments', [
            'year' => $year ? ['id' => $year->id, 'name' => $year->name, 'start_date' => $year->start_date?->toDateString(), 'end_date' => $year->end_date?->toDateString()] : null,
            'years' => collect(Lookups::academicYears())->map(fn ($y) => $y + ['installments' => (int) ($configured[$y['value']] ?? 0)])->all(),
            'installments' => $installments->values(),
            'classes' => $classes,
        ]);
    }

    /** Replace the installment plan of a year. */
    public function update(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'academic_year_id' => ['required', Rule::exists('academic_years', 'id')->where('school_id', $schoolId)],
            'installments' => ['present', 'array', 'max:12'],
            'installments.*.name' => ['required', 'string', 'max:60'],
            'installments.*.percent' => ['required', 'numeric', 'min:0.01', 'max:100'],
            'installments.*.due_date' => ['required', 'date'],
        ], [], ['installments.*.name' => 'name', 'installments.*.percent' => 'share', 'installments.*.due_date' => 'due date']);

        $rows = array_values($data['installments']);
        if ($rows) {
            $total = array_reduce($rows, fn ($sum, $r) => bcadd($sum, (string) $r['percent'], 2), '0.00');
            if (bccomp($total, '100', 2) !== 0) {
                throw ValidationException::withMessages(['installments' => "The installment shares must add up to 100% (currently {$total}%)."]);
            }
            foreach ($rows as $i => $r) {
                if ($i > 0 && $r['due_date'] < $rows[$i - 1]['due_date']) {
                    throw ValidationException::withMessages(['installments' => 'List the installments in order of their due dates.']);
                }
            }
        }

        $year = AcademicYear::findOrFail($data['academic_year_id']);
        $old = FeeInstallment::where('academic_year_id', $year->id)->orderBy('sequence')->get(['name', 'percent', 'due_date'])->toArray();

        DB::transaction(function () use ($year, $rows) {
            FeeInstallment::where('academic_year_id', $year->id)->delete();
            foreach ($rows as $i => $r) {
                FeeInstallment::create(['academic_year_id' => $year->id, 'sequence' => $i + 1, 'name' => $r['name'], 'percent' => $r['percent'], 'due_date' => $r['due_date']]);
            }
        });

        $summary = collect($rows)->map(fn ($r) => "{$r['name']} {$r['percent']}% by {$r['due_date']}")->implode('; ');
        $this->audit('updated', $year, "Installment settings for {$year->name}: ".($summary ?: 'cleared'), 'fees', ['installments' => $old], ['installments' => $rows]);
        $this->toast($rows ? "Installment settings for {$year->name} saved." : "Installment settings for {$year->name} cleared.");

        return to_route('fees.installments.index', ['year' => $year->id]);
    }
}
