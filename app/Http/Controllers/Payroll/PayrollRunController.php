<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Employee;
use App\Models\JournalLine;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Services\Payroll\PayrollRules;
use App\Services\Payroll\PayrollService;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Payroll runs: draft → approved (GL journal) → paid (bank journal). SRS 4.11 / 13. */
class PayrollRunController extends Controller
{
    public function __construct(protected PayrollService $payroll) {}

    public function index(Request $request): Response
    {
        $filters = ['year' => $request->string('year')->toString(), 'status' => $request->string('status')->toString()];

        $runs = PayrollRun::query()
            ->with(['creator:id,name', 'approver:id,name'])
            ->withCount('payslips')
            ->when($filters['year'], fn ($q, $y) => $q->where('period', 'like', "{$y}-%"))
            ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('period')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (PayrollRun $r) => [
                'id' => $r->id,
                'period' => $r->period,
                'period_label' => $r->period_label,
                'payment_date' => $r->payment_date?->toDateString(),
                'payslips_count' => $r->payslips_count,
                'total_gross' => (string) $r->total_gross,
                'total_deductions' => (string) $r->total_deductions,
                'total_net' => (string) $r->total_net,
                'total_employer' => (string) $r->total_employer,
                'status' => $r->status,
                'creator' => $r->creator?->name,
                'approver' => $r->approver?->name,
            ]);

        $year = now()->year;
        $ytd = PayrollRun::where('period', 'like', "{$year}-%")->whereIn('status', ['approved', 'partially_paid', 'paid'])->orderBy('period')->get();
        $ytdIds = $ytd->pluck('id');
        $last = PayrollRun::orderByDesc('period')->first();
        $nextPeriod = $last ? \Carbon\CarbonImmutable::createFromFormat('Y-m-d', $last->period.'-01')->addMonth()->format('Y-m') : now()->format('Y-m');
        $years = PayrollRun::selectRaw('LEFT(period, 4) as y')->distinct()->orderByDesc('y')->pluck('y');

        return Inertia::render('payroll/index', [
            'runs' => $runs,
            'filters' => $filters,
            'years' => $years->map(fn ($y) => ['value' => $y, 'label' => $y]),
            'stats' => [
                'ytd_gross' => $this->sum($ytd, 'total_gross'),
                'ytd_net' => $this->sum($ytd, 'total_net'),
                'ytd_paye' => (string) Payslip::whereIn('payroll_run_id', $ytdIds)->sum('paye'),
                'ytd_employer' => $this->sum($ytd, 'total_employer'),
                'awaiting' => PayrollRun::where('status', 'draft')->count(),
                'unpaid' => PayrollRun::where('status', 'approved')->count(),
                'headcount' => Employee::whereIn('status', ['active', 'on_leave'])->where('basic_salary', '>', 0)->count(),
                'last' => $last ? ['period_label' => $last->period_label, 'status' => $last->status, 'total_net' => (string) $last->total_net, 'id' => $last->id] : null,
            ],
            'trend' => $ytd->map(fn ($r) => ['period' => $r->period, 'gross' => (float) $r->total_gross, 'net' => (float) $r->total_net, 'employer' => (float) $r->total_employer])->values(),
            'nextPeriod' => $nextPeriod,
            'notice' => PayrollRules::current()['notice'],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'period' => ['required', 'date_format:Y-m', Rule::unique('payroll_runs')->where('school_id', $this->tenancy()->schoolId())],
            'payment_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ], ['period.unique' => 'A payroll run already exists for this period.']);

        $run = $this->payroll->createRun($data['period'], $data['payment_date'] ?? null, $data['notes'] ?? null, $request->user());
        $this->toast("Draft payroll for {$run->period_label} calculated for {$run->payslips()->count()} employees.");

        return to_route('payroll.runs.show', $run);
    }

    public function show(Request $request, PayrollRun $run): Response
    {
        $run->load(['creator:id,name', 'approver:id,name', 'payer:id,name', 'journal:id,journal_no,date,status', 'paymentJournal:id,journal_no,date,status', 'paymentAccount:id,code,name']);

        $payslips = $run->payslips()->with('employee:id,employee_no,first_name,last_name,designation,department_id,bank_name,bank_account,category', 'employee.department:id,name')->get()
            ->sortBy(fn ($p) => $p->employee?->first_name)->values()
            ->map(fn (Payslip $p) => [
                'id' => $p->id,
                'employee_id' => $p->employee_id,
                'employee' => $p->employee?->full_name,
                'employee_no' => $p->employee?->employee_no,
                'designation' => $p->employee?->designation,
                'department' => $p->employee?->department?->name,
                'bank_name' => $p->employee?->bank_name,
                'bank_account' => $p->employee?->bank_account,
                'basic_salary' => (string) $p->basic_salary,
                'allowances' => (string) $p->allowances,
                'gross_pay' => (string) $p->gross_pay,
                'paye' => (string) $p->paye,
                'nssf_employee' => (string) $p->nssf_employee,
                'other_deductions' => (string) $p->other_deductions,
                'total_deductions' => (string) $p->total_deductions,
                'net_pay' => (string) $p->net_pay,
                'employer_contributions' => (string) $p->employer_contributions,
                'unpaid_leave_days' => (int) ($p->breakdown['unpaid_leave_days'] ?? 0),
                'payment_status' => $p->payment_status ?? 'pending',
                'paid_at' => $p->paid_at?->toDateString(),
                'withheld_reason' => $p->withheld_reason,
            ]);

        $journalLines = $run->journal_id
            ? JournalLine::with('account:id,code,name')->where('journal_id', $run->journal_id)->orderByDesc('debit')->get()
                ->map(fn ($l) => ['id' => $l->id, 'account' => "{$l->account?->code} · {$l->account?->name}", 'debit' => (string) $l->debit, 'credit' => (string) $l->credit, 'narration' => $l->narration])
            : $this->previewLines($run);

        $user = $request->user();

        return Inertia::render('payroll/show', [
            'run' => [
                'id' => $run->id,
                'period' => $run->period,
                'period_label' => $run->period_label,
                'status' => $run->status,
                'payment_date' => $run->payment_date?->toDateString(),
                'notes' => $run->notes,
                'total_gross' => (string) $run->total_gross,
                'total_deductions' => (string) $run->total_deductions,
                'total_net' => (string) $run->total_net,
                'total_employer' => (string) $run->total_employer,
                'creator' => $run->creator?->name,
                'created_at' => $run->created_at?->toDateTimeString(),
                'approver' => $run->approver?->name,
                'approved_at' => $run->approved_at?->toDateTimeString(),
                'payer' => $run->payer?->name,
                'paid_at' => $run->paid_at?->toDateTimeString(),
                'journal' => $run->journal ? ['id' => $run->journal->id, 'journal_no' => $run->journal->journal_no, 'date' => $run->journal->date?->toDateString()] : null,
                'payment_journal' => $run->paymentJournal ? ['id' => $run->paymentJournal->id, 'journal_no' => $run->paymentJournal->journal_no, 'date' => $run->paymentJournal->date?->toDateString()] : null,
                'payment_account' => $run->paymentAccount ? "{$run->paymentAccount->code} · {$run->paymentAccount->name}" : null,
                'rules' => [
                    'version' => $run->rules_snapshot['version'] ?? null,
                    'calculated_at' => $run->rules_snapshot['calculated_at'] ?? null,
                    'paye_bands' => $run->rules_snapshot['paye_bands'] ?? [],
                    'notice' => $run->rules_snapshot['notice'] ?? PayrollRules::current()['notice'],
                ],
            ],
            'payslips' => $payslips,
            'statutory' => $this->statutorySummary($run),
            'journalLines' => $journalLines,
            'journalPosted' => (bool) $run->journal_id,
            'bankAccounts' => Lookups::cashAccounts(),
            'permissions' => [
                'manage' => $user->can('payroll.manage'),
                'approve' => $user->can('payroll.manage') && (int) $run->created_by !== (int) $user->id,
                'isCreator' => (int) $run->created_by === (int) $user->id,
            ],
        ]);
    }

    public function recalculate(PayrollRun $run): RedirectResponse
    {
        $this->payroll->calculate($run);
        $this->audit('recalculated', $run, "Payroll {$run->period} recalculated", 'payroll', null, ['total_net' => (string) $run->total_net]);
        $this->toast('Payroll recalculated from current salaries, components and rules.');

        return back();
    }

    public function approve(Request $request, PayrollRun $run): RedirectResponse
    {
        $this->payroll->approve($run, $request->user());
        $this->toast("Payroll for {$run->period_label} approved and journal posted to the ledger.");

        return back();
    }

    public function pay(Request $request, PayrollRun $run): RedirectResponse
    {
        $data = $request->validate([
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('school_id', $this->tenancy()->schoolId())->whereIn('sub_type', ['bank', 'cash', 'mobile_money'])],
            'payment_date' => ['required', 'date'],
            'payslip_ids' => ['present', 'array'],
            'payslip_ids.*' => ['integer'],
            'withheld' => ['nullable', 'array'],
            'withheld.*' => ['nullable', 'string', 'max:255'],
        ], [], ['account_id' => 'bank account', 'payslip_ids' => 'employees to pay']);

        $run = $this->payroll->markPaid(
            $run,
            Account::findOrFail($data['account_id']),
            $data['payment_date'],
            $request->user(),
            $data['payslip_ids'],
            array_filter($data['withheld'] ?? [], fn ($r) => $r !== null),
        );

        $paid = count($data['payslip_ids']);
        $this->toast($run->status === 'paid'
            ? "Payroll for {$run->period_label} is fully paid."
            : "{$paid} salary payment(s) recorded. Remaining staff are withheld — pay them later from this run.");

        return back();
    }

    public function destroy(PayrollRun $run): RedirectResponse
    {
        if ($run->status !== 'draft') {
            $this->toast('Only draft payroll runs can be deleted. Approved runs are posted to the ledger.', 'error');

            return back();
        }

        $run->delete();
        $this->audit('deleted', $run, "Deleted draft payroll {$run->period}", 'payroll');
        $this->toast('Draft payroll deleted.');

        return to_route('payroll.runs.index');
    }

    /** Bank payment file (CSV) for the salary transfer. */
    public function bankFile(Request $request, PayrollRun $run): StreamedResponse
    {
        // ?only=unpaid exports just the staff still to be paid (e.g. a second transfer after withholding).
        $onlyUnpaid = $request->query('only') === 'unpaid';
        $this->audit('exported', $run, "Exported bank payment file for payroll {$run->period}".($onlyUnpaid ? ' (unpaid staff)' : ''), 'payroll');

        return response()->streamDownload(function () use ($run, $onlyUnpaid) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Employee No', 'Beneficiary Name', 'Bank', 'Account Number', 'Net Amount', 'Currency', 'Reference', 'Payment Status', 'Withheld Reason']);
            $run->payslips()->with('employee:id,employee_no,first_name,last_name,bank_name,bank_account')
                ->when($onlyUnpaid, fn ($q) => $q->where('payment_status', '!=', 'paid'))
                ->get()
                ->sortBy(fn ($p) => $p->employee?->bank_name.$p->employee?->first_name)
                ->each(fn ($p) => fputcsv($out, [
                    $p->employee?->employee_no, $p->employee?->full_name, $p->employee?->bank_name, $p->employee?->bank_account,
                    number_format((float) $p->net_pay, 2, '.', ''), $this->tenancy()->school()?->currency ?? 'TZS', "SALARY {$run->period}",
                    $p->payment_status, $p->withheld_reason,
                ]));
            fclose($out);
        }, "bank-payment-{$run->period}.csv", ['Content-Type' => 'text/csv']);
    }

    /** Printable payroll summary (register). */
    public function summary(PayrollRun $run): Response
    {
        $run->load(['creator:id,name', 'approver:id,name']);

        $payslips = $run->payslips()->with('employee:id,employee_no,first_name,last_name,designation,department_id', 'employee.department:id,name')->get();

        $byDepartment = $payslips->groupBy(fn ($p) => $p->employee?->department?->name ?? 'Unassigned')->map(fn ($rows, $dept) => [
            'department' => $dept,
            'count' => $rows->count(),
            'gross' => $this->sum($rows, 'gross_pay'),
            'deductions' => $this->sum($rows, 'total_deductions'),
            'net' => $this->sum($rows, 'net_pay'),
        ])->sortKeys()->values();

        return Inertia::render('payroll/summary', [
            'run' => [
                'id' => $run->id,
                'period' => $run->period,
                'period_label' => $run->period_label,
                'status' => $run->status,
                'payment_date' => $run->payment_date?->toDateString(),
                'total_gross' => (string) $run->total_gross,
                'total_deductions' => (string) $run->total_deductions,
                'total_net' => (string) $run->total_net,
                'total_employer' => (string) $run->total_employer,
                'creator' => $run->creator?->name,
                'approver' => $run->approver?->name,
                'approved_at' => $run->approved_at?->toDateTimeString(),
                'rules_version' => $run->rules_snapshot['version'] ?? null,
            ],
            'payslips' => $payslips->sortBy(fn ($p) => $p->employee?->first_name)->values()->map(fn ($p) => [
                'id' => $p->id,
                'employee' => $p->employee?->full_name,
                'employee_no' => $p->employee?->employee_no,
                'designation' => $p->employee?->designation,
                'basic_salary' => (string) $p->basic_salary,
                'allowances' => (string) $p->allowances,
                'gross_pay' => (string) $p->gross_pay,
                'paye' => (string) $p->paye,
                'nssf_employee' => (string) $p->nssf_employee,
                'other_deductions' => (string) $p->other_deductions,
                'net_pay' => (string) $p->net_pay,
            ]),
            'statutory' => $this->statutorySummary($run),
            'byDepartment' => $byDepartment,
        ]);
    }

    /**
     * Totals per deduction / employer component (from stored breakdowns).
     *
     * @return array<int, array{code:?string, name:string, kind:string, amount:string}>
     */
    private function statutorySummary(PayrollRun $run): array
    {
        $rows = [];
        foreach ($run->payslips()->get(['breakdown']) as $slip) {
            foreach (['deductions' => 'employee', 'employer' => 'employer'] as $key => $kind) {
                foreach ($slip->breakdown[$key] ?? [] as $line) {
                    $k = $kind.'|'.($line['code'] ?? $line['name']);
                    $rows[$k] ??= ['code' => $line['code'] ?? null, 'name' => $line['name'], 'kind' => $kind, 'amount' => '0.00', 'count' => 0];
                    $rows[$k]['amount'] = bcadd($rows[$k]['amount'], (string) $line['amount'], 2);
                    $rows[$k]['count']++;
                }
            }
        }

        return array_values($rows);
    }

    /** Journal preview for a draft run (not yet posted). */
    private function previewLines(PayrollRun $run): array
    {
        try {
            $lines = $this->payroll->journalLines($run);
            $accounts = Account::whereIn('id', array_column($lines, 'account_id'))->get(['id', 'code', 'name'])->keyBy('id');

            return array_map(fn ($l, $i) => [
                'id' => $i + 1,
                'account' => ($accounts->get($l['account_id'])?->code ?? '').' · '.($accounts->get($l['account_id'])?->name ?? ''),
                'debit' => $l['debit'] ?? '0.00',
                'credit' => $l['credit'] ?? '0.00',
                'narration' => $l['narration'],
            ], $lines, array_keys($lines));
        } catch (\Throwable) {
            return [];
        }
    }

    private function sum($rows, string $column): string
    {
        return $rows->reduce(fn ($c, $p) => bcadd($c, (string) $p->{$column}, 2), '0.00');
    }
}
