<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Expense;
use App\Models\FiscalYear;
use App\Models\Journal;
use App\Services\Accounting\FinancialStatements;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Fiscal years and period locking (SRS 4.10, 5.1). */
class FiscalYearController extends AccountingController
{
    public function index(FinancialStatements $statements): Response
    {
        $years = FiscalYear::orderByDesc('start_date')->get()->map(function (FiscalYear $y) use ($statements) {
            $from = $y->start_date->toDateString();
            $to = $y->end_date->toDateString();
            $is = $statements->incomeStatement($from, $to);
            $journals = Journal::whereDate('date', '>=', $from)->whereDate('date', '<=', $to);

            return [
                'id' => $y->id,
                'name' => $y->name,
                'start_date' => $from,
                'end_date' => $to,
                'status' => $y->status,
                'is_current' => now()->toDateString() >= $from && now()->toDateString() <= $to,
                'journals' => (clone $journals)->whereIn('status', ['posted', 'reversed'])->count(),
                'pending' => (clone $journals)->whereIn('status', ['draft', 'submitted'])->count(),
                'income' => $is['income']['total'],
                'expenses' => bcadd($is['direct']['total'], $is['operating']['total'], 2),
                'surplus' => $is['net'],
                'reopen_reason' => $this->lastReason($y, 'reopened'),
            ];
        });

        return Inertia::render('accounting/fiscal-years', ['years' => $years]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $year = FiscalYear::create([...$data, 'status' => 'open']);
        $this->audit('created', $year, "Fiscal year {$year->name} created", 'accounting', null, $data);
        $this->toast("Fiscal year {$year->name} created.");

        return back();
    }

    public function update(Request $request, FiscalYear $fiscalYear): RedirectResponse
    {
        if ($fiscalYear->isClosed()) {
            $this->toast('Reopen the year before editing it.', 'error');

            return back();
        }
        $data = $this->validated($request, $fiscalYear);
        $old = $fiscalYear->only(['name', 'start_date', 'end_date']);
        $fiscalYear->update($data);
        $this->audit('updated', $fiscalYear, "Fiscal year {$fiscalYear->name} updated", 'accounting', $old, $data);
        $this->toast('Fiscal year updated.');

        return back();
    }

    public function destroy(FiscalYear $fiscalYear): RedirectResponse
    {
        $hasJournals = Journal::whereDate('date', '>=', $fiscalYear->start_date)->whereDate('date', '<=', $fiscalYear->end_date)->exists();
        if ($fiscalYear->isClosed() || $hasJournals) {
            $this->toast('Only open fiscal years without journals can be deleted.', 'error');

            return back();
        }
        $name = $fiscalYear->name;
        $fiscalYear->delete();
        $this->audit('deleted', null, "Fiscal year {$name} deleted", 'accounting');
        $this->toast("Fiscal year {$name} deleted.");

        return back();
    }

    public function close(FiscalYear $fiscalYear): RedirectResponse
    {
        if ($fiscalYear->isClosed()) {
            return back();
        }
        $from = $fiscalYear->start_date->toDateString();
        $to = $fiscalYear->end_date->toDateString();

        $pendingJournals = Journal::whereIn('status', ['draft', 'submitted'])->whereDate('date', '>=', $from)->whereDate('date', '<=', $to)->count();
        $pendingVouchers = Expense::where('status', 'pending')->whereDate('date', '>=', $from)->whereDate('date', '<=', $to)->count();
        if ($pendingJournals || $pendingVouchers) {
            $this->toast("Cannot close {$fiscalYear->name}: {$pendingJournals} unposted journal(s) and {$pendingVouchers} pending voucher(s) are dated in this year. Post, reject or delete them first.", 'error');

            return back();
        }

        $fiscalYear->update(['status' => 'closed']);
        $this->audit('closed', $fiscalYear, "Fiscal year {$fiscalYear->name} closed for posting", 'accounting');
        $this->toast("{$fiscalYear->name} closed. Postings into this period are now blocked.");

        return back();
    }

    public function reopen(Request $request, FiscalYear $fiscalYear): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:500']]);
        if (! $fiscalYear->isClosed()) {
            return back();
        }

        $fiscalYear->update(['status' => 'open']);
        $this->audit('reopened', $fiscalYear, "Fiscal year {$fiscalYear->name} reopened: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->toast("{$fiscalYear->name} reopened. The reason has been recorded in the audit trail.", 'warning');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?FiscalYear $year = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:50'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after:start_date'],
        ]);

        $overlap = FiscalYear::when($year, fn ($q) => $q->where('id', '!=', $year->id))
            ->whereDate('start_date', '<=', $data['end_date'])
            ->whereDate('end_date', '>=', $data['start_date'])
            ->first();
        if ($overlap) {
            throw ValidationException::withMessages(['start_date' => "The dates overlap with {$overlap->name}."]);
        }
        $duplicate = FiscalYear::where('name', $data['name'])->when($year, fn ($q) => $q->where('id', '!=', $year->id))->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['name' => 'A fiscal year with this name already exists.']);
        }

        return $data;
    }
}
