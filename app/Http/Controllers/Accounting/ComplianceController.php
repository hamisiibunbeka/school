<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\ComplianceObligation;
use App\Models\CompliancePayment;
use App\Services\Accounting\LedgerService;
use App\Support\Lookups;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Government levies, fees and licences outside payroll (service levy, fire,
 * OSHA, property tax ...). Schools add/configure their own obligations; the
 * system estimates what is due per period and posts payments to the ledger.
 */
class ComplianceController extends Controller
{
    public function index(Request $request): Response
    {
        $obligations = ComplianceObligation::with(['expenseAccount:id,code,name', 'payments' => fn ($q) => $q->limit(1)])
            ->orderByDesc('is_active')->orderBy('name')->get()
            ->map(function (ComplianceObligation $o) {
                [$start, $end] = $this->currentPeriod($o);
                [$base, $due] = $this->estimate($o, $start, $end);
                $last = $o->payments->first();
                $dueDate = $o->due_day ? $end->addMonth()->startOfMonth()->addDays(min($o->due_day, 28) - 1) : $end;

                return [
                    'id' => $o->id,
                    'name' => $o->name,
                    'authority' => $o->authority,
                    'basis' => $o->basis,
                    'rate' => $o->rate === null ? null : (string) (float) $o->rate,
                    'amount' => $o->amount === null ? null : (string) (float) $o->amount,
                    'frequency' => $o->frequency,
                    'due_day' => $o->due_day,
                    'expense_account_id' => $o->expense_account_id,
                    'expense_account' => $o->expenseAccount ? "{$o->expenseAccount->code} · {$o->expenseAccount->name}" : null,
                    'is_active' => $o->is_active,
                    'source_url' => $o->source_url,
                    'notes' => $o->notes,
                    'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString(), 'label' => $this->periodLabel($o, $start, $end)],
                    'estimate' => ['base' => $base, 'amount' => $due, 'due_date' => $dueDate->toDateString()],
                    'paid_for_period' => CompliancePayment::where('compliance_obligation_id', $o->id)
                        ->whereDate('period_start', $start->toDateString())->exists(),
                    'last_payment' => $last ? ['paid_on' => $last->paid_on->toDateString(), 'amount' => (string) $last->amount] : null,
                ];
            });

        $payments = CompliancePayment::with(['obligation:id,name,authority', 'paymentAccount:id,code,name', 'journal:id,journal_no', 'creator:id,name'])
            ->latest('paid_on')->latest('id')
            ->paginate($this->perPage())->withQueryString()
            ->through(fn (CompliancePayment $p) => [
                'id' => $p->id,
                'obligation' => $p->obligation?->name,
                'authority' => $p->obligation?->authority,
                'period' => $p->period_start->format('d/m/Y').' – '.$p->period_end->format('d/m/Y'),
                'base_amount' => $p->base_amount === null ? null : (string) $p->base_amount,
                'amount' => (string) $p->amount,
                'paid_on' => $p->paid_on->toDateString(),
                'reference' => $p->reference,
                'account' => $p->paymentAccount ? "{$p->paymentAccount->code} · {$p->paymentAccount->name}" : null,
                'journal_id' => $p->journal_id,
                'journal_no' => $p->journal?->journal_no,
                'by' => $p->creator?->name,
            ]);

        return Inertia::render('accounting/compliance', [
            'obligations' => $obligations,
            'payments' => $payments,
            'expenseAccounts' => Lookups::accounts('expense'),
            'cashAccounts' => Lookups::cashAccounts(),
            'canManage' => $request->user()->can('accounting.manage'),
            'totals' => [
                'paid_ytd' => (string) CompliancePayment::whereYear('paid_on', now()->year)->sum('amount'),
                'due_now' => (string) $obligations->where('is_active', true)->where('paid_for_period', false)->sum(fn ($o) => (float) $o['estimate']['amount']),
            ],
        ]);
    }

    /** JSON: estimate for an arbitrary period (used by the record-payment form). */
    public function estimateFor(Request $request, ComplianceObligation $obligation)
    {
        $data = $request->validate(['period_start' => ['required', 'date'], 'period_end' => ['required', 'date', 'after_or_equal:period_start']]);
        [$base, $amount] = $this->estimate($obligation, CarbonImmutable::parse($data['period_start']), CarbonImmutable::parse($data['period_end']));

        return response()->json(['base' => $base, 'amount' => $amount]);
    }

    public function store(Request $request): RedirectResponse
    {
        $obligation = ComplianceObligation::create($this->validated($request));
        $this->audit('created', $obligation, "Added compliance obligation {$obligation->name}", 'accounting');
        $this->toast("{$obligation->name} added.");

        return back();
    }

    public function update(Request $request, ComplianceObligation $obligation): RedirectResponse
    {
        $data = $this->validated($request);
        $old = $obligation->only(array_keys($data));
        $obligation->update($data);
        $this->audit('updated', $obligation, "Updated compliance obligation {$obligation->name}", 'accounting', $old, $data);
        $this->toast("{$obligation->name} updated.");

        return back();
    }

    public function destroy(ComplianceObligation $obligation): RedirectResponse
    {
        if ($obligation->payments()->exists()) {
            $obligation->update(['is_active' => false]);
            $this->toast('This obligation has payment history, so it was deactivated instead of deleted.', 'warning');
        } else {
            $obligation->delete();
            $this->toast('Obligation deleted.');
        }
        $this->audit('deleted', $obligation, "Removed compliance obligation {$obligation->name}", 'accounting');

        return back();
    }

    /** Record a payment: Dr levy expense / Cr cash-bank, linked to the obligation and period. */
    public function pay(Request $request, ComplianceObligation $obligation, LedgerService $ledger): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'base_amount' => ['nullable', 'numeric', 'min:0'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999'],
            'paid_on' => ['required', 'date'],
            'reference' => ['nullable', 'string', 'max:100'],
            'payment_account_id' => ['required', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->whereIn('sub_type', ['cash', 'bank', 'mobile_money'])],
        ], [], ['payment_account_id' => 'paid from account']);

        $expense = $obligation->expense_account_id ?? Account::where('code', '6140')->value('id') ?? Account::where('code', '6900')->value('id');
        abort_unless($expense, 422, 'No expense account configured for this obligation.');

        $payment = DB::transaction(function () use ($obligation, $data, $ledger, $expense, $request) {
            $amount = bcadd((string) $data['amount'], '0', 2);
            $payment = CompliancePayment::create([
                'compliance_obligation_id' => $obligation->id,
                'period_start' => $data['period_start'],
                'period_end' => $data['period_end'],
                'base_amount' => $data['base_amount'] ?? null,
                'amount' => $amount,
                'paid_on' => $data['paid_on'],
                'reference' => $data['reference'] ?? null,
                'payment_account_id' => $data['payment_account_id'],
                'created_by' => $request->user()->id,
            ]);

            $journal = $ledger->record([
                'date' => $data['paid_on'],
                'type' => 'expense',
                'reference' => $data['reference'] ?? null,
                'narration' => "{$obligation->name} ({$obligation->authority}) for ".CarbonImmutable::parse($data['period_start'])->format('d/m/Y').' – '.CarbonImmutable::parse($data['period_end'])->format('d/m/Y'),
            ], [
                ['account_id' => $expense, 'debit' => $amount, 'narration' => $obligation->name],
                ['account_id' => (int) $data['payment_account_id'], 'credit' => $amount, 'narration' => "Paid to {$obligation->authority}"],
            ], $payment);

            $payment->update(['journal_id' => $journal->id]);

            return $payment;
        });

        $this->audit('paid', $payment, "Paid {$obligation->name}: ".number_format((float) $payment->amount, 2), 'accounting');
        $this->toast("{$obligation->name} payment recorded and posted to the ledger.");

        return back();
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} the period that most recently ended (or the current year for annual items). */
    private function currentPeriod(ComplianceObligation $o): array
    {
        $months = ComplianceObligation::FREQUENCIES[$o->frequency] ?? 12;
        $now = CarbonImmutable::now();

        if ($months === 12) {
            return [$now->startOfYear(), $now->endOfYear()->startOfDay()];
        }

        // Last completed period (levies are normally paid after the period closes).
        $ref = $now->startOfMonth()->subMonth();
        $index = intdiv($ref->month - 1, $months);
        $start = $ref->setDate($ref->year, $index * $months + 1, 1);

        return [$start, $start->addMonths($months)->subDay()];
    }

    private function periodLabel(ComplianceObligation $o, CarbonImmutable $start, CarbonImmutable $end): string
    {
        return match ($o->frequency) {
            'monthly' => $start->format('F Y'),
            'annual' => 'Year '.$start->format('Y'),
            default => $start->format('M').' – '.$end->format('M Y'),
        };
    }

    /**
     * @return array{0: string|null, 1: string} [base used, estimated amount]
     */
    private function estimate(ComplianceObligation $o, CarbonImmutable $start, CarbonImmutable $end): array
    {
        if ($o->basis === 'fixed') {
            return [null, bcadd((string) ($o->amount ?? 0), '0', 2)];
        }

        $schoolId = $this->tenancy()->schoolId();

        if ($o->basis === 'percent_of_turnover') {
            // Turnover = net credits to income accounts from posted journals in the period.
            $base = (string) DB::table('journal_lines')
                ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
                ->join('accounts', 'accounts.id', '=', 'journal_lines.account_id')
                ->where('journal_lines.school_id', $schoolId)
                ->whereIn('journals.status', ['posted', 'reversed'])
                ->where('accounts.type', 'income')
                ->whereBetween('journals.date', [$start->toDateString(), $end->toDateString()])
                ->selectRaw('COALESCE(SUM(journal_lines.credit) - SUM(journal_lines.debit), 0) as total')
                ->value('total');
        } else {
            $base = (string) DB::table('payroll_runs')->where('school_id', $schoolId)
                ->whereIn('status', ['approved', 'paid'])
                ->whereBetween('period', [$start->format('Y-m'), $end->format('Y-m')])
                ->sum('total_gross');
        }

        $base = bcadd($base ?: '0', '0', 2);
        $amount = bcdiv(bcmul($base, (string) ($o->rate ?? 0), 6), '100', 2);

        return [$base, bccomp($amount, '0', 2) < 0 ? '0.00' : $amount];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'authority' => ['required', 'string', 'max:150'],
            'basis' => ['required', Rule::in(ComplianceObligation::BASES)],
            'rate' => ['nullable', 'required_unless:basis,fixed', 'numeric', 'min:0', 'max:100'],
            'amount' => ['nullable', 'required_if:basis,fixed', 'numeric', 'min:0', 'max:9999999999'],
            'frequency' => ['required', Rule::in(array_keys(ComplianceObligation::FREQUENCIES))],
            'due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'expense_account_id' => ['nullable', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('type', 'expense')],
            'is_active' => ['boolean'],
            'source_url' => ['nullable', 'url', 'max:500'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
    }
}
