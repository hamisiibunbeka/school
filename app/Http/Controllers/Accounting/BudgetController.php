<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Models\Budget;
use App\Models\FiscalYear;
use App\Services\Accounting\FinancialStatements;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Budgets per fiscal year and Budget vs Actual (SRS 4.10, 5.4 #10). */
class BudgetController extends AccountingController
{
    public function index(Request $request, FinancialStatements $statements): Response
    {
        $years = FiscalYear::orderByDesc('start_date')->get();
        $year = $years->firstWhere('id', (int) $request->query('year'))
            ?? FiscalYear::forDate(now()->toDateString())
            ?? $years->first();

        return Inertia::render('accounting/budgets', [
            'filters' => ['year' => $year ? (string) $year->id : ''],
            'year' => $year ? [
                'id' => $year->id, 'name' => $year->name, 'status' => $year->status,
                'start_date' => $year->start_date->toDateString(), 'end_date' => $year->end_date->toDateString(),
            ] : null,
            'years' => $years->map(fn ($y) => ['value' => $y->id, 'label' => $y->name.($y->isClosed() ? ' (closed)' : '')]),
            'report' => $year ? $statements->budgetVsActual($year) : ['rows' => [], 'totals' => null],
            'accounts' => Account::postable()->whereIn('type', ['income', 'expense'])->orderBy('code')->get(['id', 'code', 'name', 'type'])
                ->map(fn ($a) => ['value' => $a->id, 'label' => "{$a->code} · {$a->name}", 'type' => $a->type]),
            'budgets' => $year ? Budget::where('fiscal_year_id', $year->id)->get(['account_id', 'amount', 'notes'])
                ->mapWithKeys(fn ($b) => [$b->account_id => ['amount' => $b->amount, 'notes' => $b->notes]]) : (object) [],
            'meta' => $this->reportMeta(),
        ]);
    }

    /** Save the budget grid for a fiscal year (blank / zero amounts remove the line). */
    public function store(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'fiscal_year_id' => ['required', Rule::exists('fiscal_years', 'id')->where('school_id', $schoolId)],
            'items' => ['required', 'array'],
            'items.*.account_id' => ['required', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->whereIn('type', ['income', 'expense'])],
            'items.*.amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'items.*.notes' => ['nullable', 'string', 'max:255'],
        ]);

        $year = FiscalYear::findOrFail($data['fiscal_year_id']);
        if ($year->isClosed()) {
            $this->toast("{$year->name} is closed; its budget can no longer be revised.", 'error');

            return back();
        }

        $saved = 0;
        DB::transaction(function () use ($data, $year, &$saved) {
            foreach ($data['items'] as $item) {
                $amount = bcadd((string) ($item['amount'] ?? '0') ?: '0', '0', 2);
                if (bccomp($amount, '0', 2) <= 0) {
                    Budget::where('fiscal_year_id', $year->id)->where('account_id', $item['account_id'])->delete();

                    continue;
                }
                Budget::updateOrCreate(
                    ['fiscal_year_id' => $year->id, 'account_id' => $item['account_id']],
                    ['amount' => $amount, 'notes' => $item['notes'] ?? null],
                );
                $saved++;
            }
        });

        $this->audit('updated', $year, "Budget for {$year->name} revised ({$saved} lines)", 'accounting');
        $this->toast("Budget for {$year->name} saved.");

        return back();
    }

    public function destroy(Budget $budget): RedirectResponse
    {
        if ($budget->fiscalYear?->isClosed()) {
            $this->toast('Budgets of a closed year cannot be changed.', 'error');

            return back();
        }
        $budget->delete();
        $this->audit('deleted', $budget, 'Budget line removed', 'accounting');
        $this->toast('Budget line removed.');

        return back();
    }
}
