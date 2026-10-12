<?php

namespace App\Services\Payroll;

use App\Models\Account;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\LeaveRequest;
use App\Models\PayrollRun;
use App\Models\SalaryComponent;
use App\Models\User;
use App\Services\Accounting\LedgerService;
use App\Services\AuditLogger;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Payroll workflow (SRS 4.11 / 13): draft → approved (journal posted) → paid.
 */
class PayrollService
{
    public function __construct(
        protected PayrollCalculator $calculator,
        protected LedgerService $ledger,
    ) {}

    /** Create a draft run for a YYYY-MM period and calculate all payslips. */
    public function createRun(string $period, ?string $paymentDate = null, ?string $notes = null, ?User $creator = null): PayrollRun
    {
        if (PayrollRun::where('period', $period)->exists()) {
            throw ValidationException::withMessages(['period' => "A payroll run for {$period} already exists."]);
        }

        return DB::transaction(function () use ($period, $paymentDate, $notes, $creator) {
            $run = PayrollRun::create([
                'period' => $period,
                'payment_date' => $paymentDate ?? CarbonImmutable::createFromFormat('Y-m-d', $period.'-25')->toDateString(),
                'status' => 'draft',
                'notes' => $notes,
                'created_by' => $creator?->id ?? auth()->id(),
            ]);

            $this->calculate($run);
            AuditLogger::log('created', $run, "Payroll run {$period} created", null, ['total_net' => $run->total_net], 'payroll');

            return $run;
        });
    }

    /** (Re)calculate payslips for a draft run from current employee data and rules. */
    public function calculate(PayrollRun $run): PayrollRun
    {
        if ($run->status !== 'draft') {
            throw ValidationException::withMessages(['status' => 'Only draft payroll runs can be recalculated.']);
        }

        $components = SalaryComponent::active()->orderBy('type')->orderBy('id')->get();
        $start = CarbonImmutable::createFromFormat('Y-m-d', $run->period.'-01')->startOfDay();
        $end = $start->endOfMonth()->startOfDay();
        $rules = PayrollRules::forPeriod($end->toDateString());

        $employees = Employee::query()
            ->whereIn('status', ['active', 'on_leave'])
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhere('hire_date', '<=', $end->toDateString()))
            ->where('basic_salary', '>', 0)
            ->orderBy('employee_no')
            ->get();

        $rows = EmployeeSalaryComponent::whereIn('employee_id', $employees->pluck('id'))->get()->groupBy('employee_id');

        // Assigned (with optional override) vs explicitly excluded components, per employee.
        $assignments = $rows->map(fn ($r) => $r->where('is_excluded', false)
            ->mapWithKeys(fn ($a) => [$a->salary_component_id => $a->amount === null ? null : (string) $a->amount])->all());
        $exclusions = $rows->map(fn ($r) => $r->where('is_excluded', true)->pluck('salary_component_id')->map(fn ($id) => (int) $id)->all());

        $unpaid = $this->unpaidLeaveDays($employees->pluck('id')->all(), $start, $end);

        // Headcount drives thresholds such as SDL (payable only by employers with 10+ employees).
        $headcount = Employee::whereIn('status', ['active', 'on_leave', 'suspended'])
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhere('hire_date', '<=', $end->toDateString()))
            ->count();
        $rules['headcount'] = $headcount;

        return DB::transaction(function () use ($run, $rules, $components, $employees, $assignments, $exclusions, $unpaid, $headcount, $end) {
            $run->payslips()->delete();

            $totals = ['gross' => '0.00', 'deductions' => '0.00', 'net' => '0.00', 'employer' => '0.00'];

            foreach ($employees as $employee) {
                $result = $this->calculator->calculate($employee, $components, $assignments[$employee->id] ?? [], $rules, $unpaid[$employee->id] ?? 0, [
                    'headcount' => $headcount,
                    'period_end' => $end->toDateString(),
                    'excluded' => $exclusions[$employee->id] ?? [],
                ]);
                $run->payslips()->create(['employee_id' => $employee->id, ...$result]);

                $totals['gross'] = bcadd($totals['gross'], $result['gross_pay'], 2);
                $totals['deductions'] = bcadd($totals['deductions'], $result['total_deductions'], 2);
                $totals['net'] = bcadd($totals['net'], $result['net_pay'], 2);
                $totals['employer'] = bcadd($totals['employer'], $result['employer_contributions'], 2);
            }

            $run->forceFill([
                'total_gross' => $totals['gross'],
                'total_deductions' => $totals['deductions'],
                'total_net' => $totals['net'],
                'total_employer' => $totals['employer'],
                'rules_snapshot' => [
                    ...$rules,
                    'calculated_at' => now()->toDateTimeString(),
                    'components' => $components->map(fn ($c) => [
                        'id' => $c->id, 'code' => $c->code, 'name' => $c->name, 'type' => $c->type,
                        'calculation' => $c->calculation, 'base' => $c->base, 'value' => (string) $c->value, 'is_statutory' => $c->is_statutory,
                        'applies_to_all' => $c->applies_to_all, 'exclude_on_probation' => $c->exclude_on_probation,
                        'min_employees' => $c->min_employees, 'cap_amount' => $c->cap_amount === null ? null : (string) $c->cap_amount,
                        'account_id' => $c->account_id,
                    ])->values()->all(),
                ],
            ])->save();

            return $run;
        });
    }

    /** Approve a draft run (maker-checker) and post the payroll journal. */
    public function approve(PayrollRun $run, User $approver): PayrollRun
    {
        if ($run->status !== 'draft') {
            throw ValidationException::withMessages(['status' => 'Only draft payroll runs can be approved.']);
        }
        if ((int) $run->created_by === (int) $approver->id) {
            throw ValidationException::withMessages(['status' => 'Segregation of duties: the user who prepared this payroll cannot approve it.']);
        }
        if (! $approver->hasPermission('payroll.manage')) {
            throw ValidationException::withMessages(['status' => 'You are not allowed to approve payroll.']);
        }
        if (! $run->payslips()->exists()) {
            throw ValidationException::withMessages(['status' => 'This payroll run has no payslips.']);
        }

        return DB::transaction(function () use ($run, $approver) {
            $journal = $this->ledger->record([
                'date' => $run->periodEnd()->toDateString(),
                'type' => 'payroll',
                'reference' => 'PAYROLL-'.$run->period,
                'narration' => "Payroll for {$run->period_label}",
            ], $this->journalLines($run), $run);

            $journal->forceFill(['approved_by' => $approver->id])->save();

            $run->forceFill([
                'status' => 'approved',
                'approved_by' => $approver->id,
                'approved_at' => now(),
                'journal_id' => $journal->id,
            ])->save();

            AuditLogger::log('approved', $run, "Payroll {$run->period} approved; journal {$journal->journal_no} posted", null, ['status' => 'approved', 'total_net' => (string) $run->total_net], 'payroll');

            return $run;
        });
    }

    /**
     * Pay net salaries for selected employees: Dr 2500 Net Salaries Payable / Cr bank.
     *
     * Employees not selected stay unpaid. Each must have a reason, and they are marked "withheld"
     * (their net pay remains owed in 2500). They can be paid later with another call.
     * The run becomes "partially_paid" until every payslip is paid, then "paid".
     *
     * @param  array<int, int>|null  $payslipIds  payslips to pay now (null = every unpaid payslip)
     * @param  array<int, string>  $withheld  payslip_id => reason, for unpaid payslips being held back
     */
    public function markPaid(PayrollRun $run, Account $bank, string $date, ?User $payer = null, ?array $payslipIds = null, array $withheld = []): PayrollRun
    {
        if (! in_array($run->status, ['approved', 'partially_paid'], true)) {
            throw ValidationException::withMessages(['status' => 'Only approved (or partially paid) payroll runs can be paid.']);
        }

        $rules = $run->rules_snapshot ?? PayrollRules::current();
        $payable = Account::byCode($rules['net_payable_account'] ?? '2500') ?? Account::bySubType('salaries_payable');
        if (! $payable) {
            throw ValidationException::withMessages(['account' => 'Net Salaries Payable account (2500) is missing from the chart of accounts.']);
        }

        $unpaid = $run->payslips()->with('employee:id,first_name,last_name')->where('payment_status', '!=', 'paid')->get()->keyBy('id');
        $wanted = $payslipIds === null ? null : array_map('intval', $payslipIds);
        // Filter by model id explicitly (Eloquent's only()/except() re-index the collection).
        $toPay = $wanted === null ? $unpaid : $unpaid->filter(fn ($p) => in_array((int) $p->id, $wanted, true));

        if ($payslipIds !== null && $toPay->count() !== count(array_unique($payslipIds))) {
            throw ValidationException::withMessages(['payslip_ids' => 'Some selected employees are not part of this payroll or are already paid.']);
        }

        $held = $unpaid->reject(fn ($p) => $toPay->contains('id', $p->id));
        foreach ($held as $slip) {
            if (trim((string) ($withheld[$slip->id] ?? '')) === '') {
                throw ValidationException::withMessages(['withheld' => "Give a reason for not paying {$slip->employee?->full_name} now."]);
            }
        }

        if ($toPay->isEmpty() && $held->isEmpty()) {
            throw ValidationException::withMessages(['payslip_ids' => 'Select at least one employee to pay.']);
        }

        return DB::transaction(function () use ($run, $bank, $date, $payer, $payable, $toPay, $held, $withheld) {
            $payerId = $payer?->id ?? auth()->id();
            $journal = null;

            if ($toPay->isNotEmpty()) {
                $amount = $toPay->reduce(fn ($sum, $p) => bcadd($sum, (string) $p->net_pay, 2), '0.00');
                $partial = $held->isNotEmpty() || $run->status === 'partially_paid';

                $journal = $this->ledger->record([
                    'date' => $date,
                    'type' => 'payroll',
                    'reference' => 'SALPAY-'.$run->period,
                    'narration' => "Net salaries paid for {$run->period_label} via {$bank->name}".($partial ? " ({$toPay->count()} staff)" : ''),
                ], [
                    ['account_id' => $payable->id, 'debit' => $amount, 'narration' => 'Net salaries cleared'],
                    ['account_id' => $bank->id, 'credit' => $amount, 'narration' => 'Salary bank transfer'],
                ], $run);

                $run->payslips()->whereKey($toPay->modelKeys())->update([
                    'payment_status' => 'paid',
                    'paid_at' => $date,
                    'withheld_reason' => null,
                    'payment_journal_id' => $journal->id,
                    'paid_by' => $payerId,
                ]);
            }

            foreach ($held as $slip) {
                $slip->forceFill(['payment_status' => 'withheld', 'withheld_reason' => trim($withheld[$slip->id])])->save();
            }

            $allPaid = ! $run->payslips()->where('payment_status', '!=', 'paid')->exists();

            $run->forceFill([
                'status' => $allPaid ? 'paid' : 'partially_paid',
                'payment_date' => $date,
                'paid_by' => $payerId,
                'paid_at' => $allPaid ? now() : $run->paid_at,
                'payment_account_id' => $bank->id,
                'payment_journal_id' => $journal?->id ?? $run->payment_journal_id,
            ])->save();

            $summary = "Payroll {$run->period}: paid {$toPay->count()} staff".($journal ? " (journal {$journal->journal_no})" : '').", withheld {$held->count()}";
            AuditLogger::log('paid', $run, $summary, null, [
                'status' => $run->status,
                'paid_payslips' => $toPay->modelKeys(),
                'withheld' => $held->mapWithKeys(fn ($s) => [$s->id => $withheld[$s->id]])->all(),
            ], 'payroll');

            return $run;
        });
    }

    /**
     * Balanced payroll journal lines:
     * Dr Salaries (gross) + Dr employer cost accounts;
     * Cr each deduction / employer contribution liability; Cr Net Salaries Payable.
     *
     * @return array<int, array{account_id:int, debit?:string, credit?:string, narration:string}>
     */
    public function journalLines(PayrollRun $run): array
    {
        $rules = $run->rules_snapshot ?? PayrollRules::current();
        $code = fn (string $c) => Account::byCode($c)?->id;

        $salaries = $code($rules['salaries_expense_account'] ?? '6100');
        $netPayable = $code($rules['net_payable_account'] ?? '2500');
        $fallback = $code($rules['fallback_liability_account'] ?? '2200');
        if (! $salaries || ! $netPayable || ! $fallback) {
            throw ValidationException::withMessages(['account' => 'Payroll GL accounts (6100, 2500, 2200) are missing from the chart of accounts.']);
        }

        $debits = [];   // account_id => [amount, narration]
        $credits = [];
        $add = function (array &$bucket, int $account, string $amount, string $narration) {
            $bucket[$account] = [bcadd($bucket[$account][0] ?? '0.00', $amount, 2), $bucket[$account][1] ?? $narration];
        };

        $gross = '0.00';
        $net = '0.00';

        foreach ($run->payslips()->get(['gross_pay', 'net_pay', 'breakdown']) as $slip) {
            $gross = bcadd($gross, (string) $slip->gross_pay, 2);
            $net = bcadd($net, (string) $slip->net_pay, 2);

            foreach ($slip->breakdown['deductions'] ?? [] as $d) {
                $add($credits, (int) ($d['account_id'] ?? 0) ?: $fallback, (string) $d['amount'], $d['name']);
            }

            foreach ($slip->breakdown['employer'] ?? [] as $e) {
                $expenseCode = $rules['employer_expense_accounts'][$e['code'] ?? ''] ?? ($rules['default_employer_expense_account'] ?? '6100');
                $add($debits, $code($expenseCode) ?? $salaries, (string) $e['amount'], $e['name'].' (employer cost)');
                $add($credits, (int) ($e['account_id'] ?? 0) ?: $fallback, (string) $e['amount'], $e['name']);
            }
        }

        $lines = [['account_id' => $salaries, 'debit' => $gross, 'narration' => 'Gross salaries & allowances']];
        foreach ($debits as $account => [$amount, $narration]) {
            $lines[] = ['account_id' => $account, 'debit' => $amount, 'narration' => $narration];
        }
        foreach ($credits as $account => [$amount, $narration]) {
            $lines[] = ['account_id' => $account, 'credit' => $amount, 'narration' => $narration];
        }
        $lines[] = ['account_id' => $netPayable, 'credit' => $net, 'narration' => 'Net salaries payable'];

        return $lines;
    }

    /**
     * Approved unpaid-leave working days falling inside the period, per employee.
     *
     * @param  array<int, int>  $employeeIds
     * @return array<int, int>
     */
    protected function unpaidLeaveDays(array $employeeIds, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $days = [];

        LeaveRequest::query()
            ->whereIn('employee_id', $employeeIds)
            ->where('status', 'approved')
            ->whereHas('leaveType', fn ($q) => $q->where('is_paid', false))
            ->whereDate('start_date', '<=', $end->toDateString())
            ->whereDate('end_date', '>=', $start->toDateString())
            ->get()
            ->each(function (LeaveRequest $l) use (&$days, $start, $end) {
                $from = max($l->start_date->toDateString(), $start->toDateString());
                $to = min($l->end_date->toDateString(), $end->toDateString());
                $days[$l->employee_id] = ($days[$l->employee_id] ?? 0) + LeaveRequest::workingDays($from, $to);
            });

        return $days;
    }
}
