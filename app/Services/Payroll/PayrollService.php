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

    /** Record the bank payment of net salaries: Dr 2500 Net Salaries Payable / Cr bank. */
    public function markPaid(PayrollRun $run, Account $bank, string $date, ?User $payer = null): PayrollRun
    {
        if ($run->status !== 'approved') {
            throw ValidationException::withMessages(['status' => 'Only approved payroll runs can be marked as paid.']);
        }

        $rules = $run->rules_snapshot ?? PayrollRules::current();
        $payable = Account::byCode($rules['net_payable_account'] ?? '2500') ?? Account::bySubType('salaries_payable');
        if (! $payable) {
            throw ValidationException::withMessages(['account' => 'Net Salaries Payable account (2500) is missing from the chart of accounts.']);
        }

        return DB::transaction(function () use ($run, $bank, $date, $payer, $payable) {
            $journal = $this->ledger->record([
                'date' => $date,
                'type' => 'payroll',
                'reference' => 'SALPAY-'.$run->period,
                'narration' => "Net salaries paid for {$run->period_label} via {$bank->name}",
            ], [
                ['account_id' => $payable->id, 'debit' => (string) $run->total_net, 'narration' => 'Net salaries cleared'],
                ['account_id' => $bank->id, 'credit' => (string) $run->total_net, 'narration' => 'Salary bank transfer'],
            ], $run);

            $run->forceFill([
                'status' => 'paid',
                'payment_date' => $date,
                'paid_by' => $payer?->id ?? auth()->id(),
                'paid_at' => now(),
                'payment_account_id' => $bank->id,
                'payment_journal_id' => $journal->id,
            ])->save();

            AuditLogger::log('paid', $run, "Payroll {$run->period} paid from {$bank->code} {$bank->name}; journal {$journal->journal_no}", null, ['status' => 'paid'], 'payroll');

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
