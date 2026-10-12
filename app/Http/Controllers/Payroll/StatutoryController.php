<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\SalaryComponent;
use App\Models\TaxTable;
use App\Services\Payroll\PayrollRules;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Statutory payroll rules: versioned PAYE tables, statutory contributions
 * (NSSF, WCF, SDL, HESLB ...), per-staff exclusions and tax status.
 * Everyone with payroll.view can see how figures are calculated; only
 * payroll.manage can change them (all changes are audited).
 */
class StatutoryController extends Controller
{
    public function index(Request $request): Response
    {
        $today = now()->toDateString();
        $inForce = TaxTable::inForce($today);

        $tables = TaxTable::with(['bands', 'editor:id,name'])->orderByDesc('effective_from')->get()->map(fn (TaxTable $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'jurisdiction' => $t->jurisdiction,
            'effective_from' => $t->effective_from->toDateString(),
            'is_active' => $t->is_active,
            'in_force' => $inForce?->id === $t->id,
            'taxable_base' => $t->taxable_base,
            'secondary_rate' => (string) (float) $t->secondary_rate,
            'non_resident_rate' => (string) (float) $t->non_resident_rate,
            'source_url' => $t->source_url,
            'notes' => $t->notes,
            'updated_at' => $t->updated_at?->toDateTimeString(),
            'updated_by' => $t->editor?->name,
            'bands' => $t->bands->map(fn ($b) => [
                'lower_limit' => (string) (float) $b->lower_limit,
                'upper_limit' => $b->upper_limit === null ? null : (string) (float) $b->upper_limit,
                'rate' => (string) (float) $b->rate,
                'base_tax' => (string) (float) $b->base_tax,
            ])->values(),
        ]);

        $headcount = Employee::whereIn('status', ['active', 'on_leave', 'suspended'])->count();

        $exclusions = EmployeeSalaryComponent::query()
            ->whereIn('salary_component_id', SalaryComponent::where('is_statutory', true)->pluck('id'))
            ->get()->groupBy('salary_component_id');

        $components = SalaryComponent::with('account:id,code,name')->where('is_statutory', true)
            ->orderByRaw("FIELD(type, 'deduction', 'employer_contribution', 'allowance')")->orderBy('name')->get()
            ->map(fn (SalaryComponent $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'authority' => $c->authority,
                'description' => $c->description,
                'type' => $c->type,
                'calculation' => $c->calculation,
                'base' => $c->base,
                'value' => (string) (float) $c->value,
                'min_employees' => $c->min_employees,
                'cap_amount' => $c->cap_amount === null ? null : (string) (float) $c->cap_amount,
                'applies_to_all' => $c->applies_to_all,
                'exclude_on_probation' => $c->exclude_on_probation,
                'is_active' => $c->is_active,
                'account_id' => $c->account_id,
                'account' => $c->account ? "{$c->account->code} · {$c->account->name}" : null,
                'excluded_ids' => ($exclusions[$c->id] ?? collect())->where('is_excluded', true)->pluck('employee_id')->values(),
                'assigned_ids' => ($exclusions[$c->id] ?? collect())->where('is_excluded', false)->pluck('employee_id')->values(),
                'threshold_met' => ! $c->min_employees || $headcount >= $c->min_employees,
            ]);

        $staff = Employee::with('department:id,name')->whereIn('status', ['active', 'on_leave', 'suspended'])
            ->orderBy('first_name')->get()
            ->map(fn (Employee $e) => [
                'id' => $e->id,
                'name' => $e->full_name,
                'employee_no' => $e->employee_no,
                'designation' => $e->designation,
                'department' => $e->department?->name,
                'basic_salary' => $request->user()->can('payroll.view') ? (string) $e->basic_salary : null,
                'hire_date' => $e->hire_date?->toDateString(),
                'probation_end_date' => $e->probation_end_date?->toDateString(),
                'on_probation' => $e->probation_end_date && $e->probation_end_date->toDateString() >= $today,
                'tax_status' => $e->tax_status ?: 'primary',
                'nssf_no' => $e->nssf_no,
                'tin' => $e->tin,
            ]);

        $rules = PayrollRules::forPeriod($today);

        return Inertia::render('payroll/statutory', [
            'tables' => $tables,
            'components' => $components,
            'staff' => $staff,
            'headcount' => $headcount,
            'rules' => [
                'paye_taxable' => $rules['paye_taxable'],
                'version' => $rules['version'],
                'notice' => $rules['notice'],
            ],
            'accounts' => Lookups::accounts(['liability', 'expense', 'asset']),
            'canManage' => $request->user()->can('payroll.manage'),
            'sources' => [
                ['label' => 'TRA — Taxes and Duties at a Glance 2025/26 (PAYE bands)', 'url' => 'https://www.tra.go.tz/images/uploads/pages/TAXES_AND_DUTIES_AT_A_GLANCE_2025_2026.pdf'],
                ['label' => 'TRA — Monthly income tax tables', 'url' => 'https://www.tra.go.tz/images/uploads/pages/TRA_Monthly_Income_Tax_2023_24.pdf'],
                ['label' => 'TRA — Skills Development Levy (3.5%, 10+ employees)', 'url' => 'https://www.tra.go.tz/page/skills-development-levy-sdl'],
                ['label' => 'NSSF — Contribution rates (10% + 10%)', 'url' => 'https://www.nssf.go.tz/pages/overview'],
                ['label' => 'PwC — Tanzania other taxes (SDL, WCF)', 'url' => 'https://taxsummaries.pwc.com/tanzania/individual/other-taxes'],
                ['label' => 'HESLB — Employer repayment obligations (15%)', 'url' => 'https://www.heslb.go.tz/loanrepayment/obligation'],
            ],
        ]);
    }

    /** Create a new PAYE table version (optionally copying the bands of an existing one). */
    public function storeTable(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'effective_from' => ['required', 'date'],
            'copy_from' => ['nullable', Rule::exists('tax_tables', 'id')->where('school_id', $this->tenancy()->schoolId())],
        ]);

        $table = DB::transaction(function () use ($data, $request) {
            $source = $data['copy_from'] ? TaxTable::with('bands')->find($data['copy_from']) : TaxTable::inForce(now()->toDateString());

            $table = TaxTable::create([
                'name' => $data['name'],
                'effective_from' => $data['effective_from'],
                'jurisdiction' => $source?->jurisdiction ?? 'Tanzania Mainland',
                'taxable_base' => $source?->taxable_base ?? 'gross_less_pension',
                'secondary_rate' => $source?->secondary_rate ?? 30,
                'non_resident_rate' => $source?->non_resident_rate ?? 15,
                'source_url' => $source?->source_url,
                'notes' => $source?->notes,
                'is_active' => false, // activated explicitly after the bands are reviewed
                'updated_by' => $request->user()->id,
            ]);

            foreach ($source?->bands ?? [] as $i => $band) {
                $table->bands()->create($band->only(['lower_limit', 'upper_limit', 'rate', 'base_tax']) + ['sort' => $i]);
            }

            return $table;
        });

        $this->audit('created', $table, "Created PAYE table \"{$table->name}\" effective {$table->effective_from->toDateString()}", 'payroll');
        $this->toast('New PAYE table created as inactive. Review the bands, then activate it.');

        return back();
    }

    /** Update table settings and replace its bands (validated to be continuous). */
    public function updateTable(Request $request, TaxTable $table): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'jurisdiction' => ['required', 'string', 'max:80'],
            'effective_from' => ['required', 'date'],
            'is_active' => ['boolean'],
            'taxable_base' => ['required', Rule::in(['gross', 'gross_less_pension'])],
            'secondary_rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'non_resident_rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'source_url' => ['nullable', 'url', 'max:500'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'auto_base_tax' => ['boolean'],
            'bands' => ['required', 'array', 'min:1', 'max:20'],
            'bands.*.lower_limit' => ['required', 'numeric', 'min:0'],
            'bands.*.upper_limit' => ['nullable', 'numeric', 'min:0'],
            'bands.*.rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'bands.*.base_tax' => ['nullable', 'numeric', 'min:0'],
        ]);

        $bands = $this->normaliseBands($data['bands'], (bool) ($data['auto_base_tax'] ?? true));
        $old = ['bands' => $table->bands->map->only(['lower_limit', 'upper_limit', 'rate', 'base_tax'])->all()] + $table->only(['name', 'effective_from', 'is_active', 'secondary_rate', 'non_resident_rate', 'taxable_base']);

        DB::transaction(function () use ($table, $data, $bands, $request) {
            $table->fill(collect($data)->except(['bands', 'auto_base_tax'])->all());
            $table->updated_by = $request->user()->id;
            $table->save();
            $table->bands()->delete();
            foreach ($bands as $i => $band) {
                $table->bands()->create($band + ['sort' => $i]);
            }
        });

        $this->audit('updated', $table, "Updated PAYE table \"{$table->name}\"", 'payroll', $old, ['bands' => $bands] + $table->only(['name', 'effective_from', 'is_active', 'secondary_rate', 'non_resident_rate', 'taxable_base']));
        $this->toast('PAYE table saved. New payroll runs (and draft recalculations) will use it from its effective date.');

        return back();
    }

    public function destroyTable(TaxTable $table): RedirectResponse
    {
        if (TaxTable::count() <= 1) {
            $this->toast('At least one PAYE table is required.', 'error');

            return back();
        }

        $table->delete();
        $this->audit('deleted', $table, "Deleted PAYE table \"{$table->name}\"", 'payroll');
        $this->toast('PAYE table deleted. Approved payrolls keep the rules they were calculated with.');

        return back();
    }

    /** Create a new statutory / government deduction or contribution (e.g. union dues, pension scheme). */
    public function storeComponent(Request $request): RedirectResponse
    {
        $data = $this->componentData($request);
        $data['code'] = $request->validate([
            'code' => ['required', 'string', 'max:20', 'alpha_dash', Rule::unique('salary_components')->where('school_id', $this->tenancy()->schoolId())],
        ])['code'];
        $data['is_statutory'] = true;

        $component = SalaryComponent::create($data);
        $this->audit('created', $component, "Created statutory item {$component->name}", 'payroll', null, $data);
        $this->toast("{$component->name} added.");

        return back();
    }

    public function updateComponent(Request $request, SalaryComponent $component): RedirectResponse
    {
        abort_unless($component->is_statutory, 404);

        $data = $this->componentData($request, $component);
        $old = $component->only(array_keys($data));
        $component->update($data);

        $this->audit('updated', $component, "Updated statutory item {$component->name}", 'payroll', $old, $component->only(array_keys($data)));
        $this->toast("{$component->name} updated.");

        return back();
    }

    /** Replace the list of staff excluded from a statutory item (e.g. NSSF during probation). */
    public function saveExclusions(Request $request, SalaryComponent $component): RedirectResponse
    {
        abort_unless($component->is_statutory, 404);

        $data = $request->validate([
            'employee_ids' => ['present', 'array'],
            'employee_ids.*' => [Rule::exists('employees', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $ids = array_map('intval', array_unique($data['employee_ids']));

        DB::transaction(function () use ($component, $ids, $data) {
            EmployeeSalaryComponent::where('salary_component_id', $component->id)->where('is_excluded', true)
                ->whereNotIn('employee_id', $ids)->delete();

            foreach ($ids as $id) {
                EmployeeSalaryComponent::updateOrCreate(
                    ['employee_id' => $id, 'salary_component_id' => $component->id],
                    ['is_excluded' => true, 'amount' => null, 'reason' => $data['reason'] ?? null],
                );
            }
        });

        $this->audit('exclusions_updated', $component, "{$component->name}: ".count($ids).' staff excluded'.(($data['reason'] ?? null) ? " ({$data['reason']})" : ''), 'payroll', null, ['employee_ids' => $ids]);
        $this->toast("{$component->name}: ".count($ids).' staff member(s) excluded.');

        return back();
    }

    /** Set which staff an opt-in item (e.g. HESLB) applies to. */
    public function saveAssignments(Request $request, SalaryComponent $component): RedirectResponse
    {
        abort_unless($component->is_statutory, 404);

        $data = $request->validate([
            'employee_ids' => ['present', 'array'],
            'employee_ids.*' => [Rule::exists('employees', 'id')->where('school_id', $this->tenancy()->schoolId())],
        ]);
        $ids = array_map('intval', array_unique($data['employee_ids']));

        DB::transaction(function () use ($component, $ids) {
            EmployeeSalaryComponent::where('salary_component_id', $component->id)->where('is_excluded', false)
                ->whereNotIn('employee_id', $ids)->delete();
            foreach ($ids as $id) {
                EmployeeSalaryComponent::firstOrCreate(['employee_id' => $id, 'salary_component_id' => $component->id], ['is_excluded' => false]);
            }
        });

        $this->audit('assigned', $component, "{$component->name} applies to ".count($ids).' staff', 'payroll', null, ['employee_ids' => $ids]);
        $this->toast("{$component->name} now applies to ".count($ids).' staff member(s).');

        return back();
    }

    /** Per-employee statutory profile: tax status and probation end date. */
    public function updateStaff(Request $request, Employee $employee): RedirectResponse
    {
        $data = $request->validate([
            'tax_status' => ['required', Rule::in(['primary', 'secondary', 'non_resident', 'exempt'])],
            'probation_end_date' => ['nullable', 'date'],
        ]);

        $old = ['tax_status' => $employee->tax_status, 'probation_end_date' => $employee->probation_end_date?->toDateString()];
        $employee->update($data);

        $this->audit('updated', $employee, "Statutory profile updated for {$employee->full_name}", 'payroll', $old, $data);
        $this->toast("Statutory profile saved for {$employee->full_name}.");

        return back();
    }

    /** @return array<string, mixed> */
    private function componentData(Request $request, ?SalaryComponent $component = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'authority' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
            'type' => [$component ? 'sometimes' : 'required', Rule::in(['deduction', 'employer_contribution'])],
            'calculation' => [$component ? 'sometimes' : 'required', Rule::in(['fixed', 'percent_of_basic', 'paye'])],
            'base' => ['required', Rule::in(SalaryComponent::BASES)],
            'value' => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
            'min_employees' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'cap_amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
            'applies_to_all' => ['boolean'],
            'exclude_on_probation' => ['boolean'],
            'is_active' => ['boolean'],
            'account_id' => ['nullable', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('is_postable', true)],
        ], [], ['account_id' => 'GL account', 'min_employees' => 'employee threshold']);

        $calculation = $data['calculation'] ?? $component?->calculation;
        if ($calculation === 'percent_of_basic' && (float) ($data['value'] ?? 0) > 100) {
            throw ValidationException::withMessages(['value' => 'A percentage cannot exceed 100.']);
        }
        // The PAYE item's type/calculation identity is fixed; its rates live in the PAYE table.
        if ($component?->calculation === 'paye') {
            unset($data['type'], $data['calculation']);
        }

        $data['value'] ??= 0;

        return $data;
    }

    /**
     * Sort bands, check they are continuous and (optionally) recompute each band's
     * base tax as the cumulative tax of all lower bands.
     *
     * @param  array<int, array<string, mixed>>  $bands
     * @return array<int, array{lower_limit: string, upper_limit: string|null, rate: string, base_tax: string}>
     */
    private function normaliseBands(array $bands, bool $autoBaseTax): array
    {
        usort($bands, fn ($a, $b) => bccomp((string) $a['lower_limit'], (string) $b['lower_limit'], 2));

        $out = [];
        $cumulative = '0';
        foreach ($bands as $i => $band) {
            $lower = bcadd((string) $band['lower_limit'], '0', 2);
            $upper = ($band['upper_limit'] ?? '') === '' || $band['upper_limit'] === null ? null : bcadd((string) $band['upper_limit'], '0', 2);
            $isLast = $i === count($bands) - 1;

            if ($i === 0 && bccomp($lower, '0', 2) !== 0) {
                throw ValidationException::withMessages(['bands' => 'The first band must start at 0.']);
            }
            if ($i > 0 && bccomp($lower, (string) $out[$i - 1]['upper_limit'], 2) !== 0) {
                throw ValidationException::withMessages(['bands' => 'Band '.($i + 1).' must start where band '.$i.' ends ('.number_format((float) $out[$i - 1]['upper_limit']).').']);
            }
            if (! $isLast && $upper === null) {
                throw ValidationException::withMessages(['bands' => 'Only the last band may be open-ended (no upper limit).']);
            }
            if ($isLast && $upper !== null) {
                throw ValidationException::withMessages(['bands' => 'The last band must have no upper limit so that all income is covered.']);
            }
            if ($upper !== null && bccomp($upper, $lower, 2) <= 0) {
                throw ValidationException::withMessages(['bands' => 'Band '.($i + 1).': the upper limit must be above the lower limit.']);
            }

            $rate = bcadd((string) $band['rate'], '0', 3);
            $baseTax = $autoBaseTax ? bcadd($cumulative, '0', 2) : bcadd((string) ($band['base_tax'] ?? 0), '0', 2);

            $out[] = ['lower_limit' => $lower, 'upper_limit' => $upper, 'rate' => $rate, 'base_tax' => $baseTax];

            if ($upper !== null) {
                $cumulative = bcadd($baseTax, bcdiv(bcmul(bcsub($upper, $lower, 2), $rate, 6), '100', 6), 6);
            }
        }

        return $out;
    }
}
