<?php

namespace App\Services\Payroll;

use App\Models\Employee;
use App\Models\SalaryComponent;
use Illuminate\Support\Collection;

/**
 * Pure payslip calculator. Given an employee, the active salary components,
 * the employee's component assignments and a rule pack, it returns the
 * payslip figures plus a full breakdown. All money maths uses bcmath strings.
 */
class PayrollCalculator
{
    /**
     * @param  Collection<int, SalaryComponent>  $components  active components
     * @param  array<int, string|null>  $assigned  salary_component_id => override amount (null = use component value)
     * @param  array<string, mixed>  $rules  PayrollRules::current() or a stored snapshot
     * @return array<string, mixed>
     */
    public function calculate(Employee $employee, Collection $components, array $assigned, array $rules, int $unpaidLeaveDays = 0): array
    {
        $basic = $this->round((string) $employee->basic_salary);
        $grossCodes = $rules['statutory_gross_codes'] ?? [];

        $applicable = $components->filter(fn (SalaryComponent $c) => $c->applies_to_all || array_key_exists($c->id, $assigned));

        // Unpaid leave reduces earned basic pay pro-rata.
        $unpaidAmount = '0.00';
        if ($unpaidLeaveDays > 0) {
            $perDay = bcdiv($basic, (string) max(1, (int) ($rules['working_days_per_month'] ?? 22)), 6);
            $unpaidAmount = $this->round(bcmul($perDay, (string) $unpaidLeaveDays, 6));
            if (bccomp($unpaidAmount, $basic, 2) > 0) {
                $unpaidAmount = $basic;
            }
        }
        $earnedBasic = bcsub($basic, $unpaidAmount, 2);

        // 1. Allowances
        $allowances = [];
        $allowanceTotal = '0.00';
        foreach ($applicable->where('type', 'allowance') as $c) {
            $amount = $this->componentAmount($c, $assigned, $earnedBasic, $earnedBasic, $grossCodes);
            if (bccomp($amount, '0', 2) <= 0) {
                continue;
            }
            $allowances[] = $this->line($c, $amount);
            $allowanceTotal = bcadd($allowanceTotal, $amount, 2);
        }

        $gross = bcadd($earnedBasic, $allowanceTotal, 2);

        // 2. Employee deductions: NSSF first (PAYE depends on it), then PAYE, then others.
        $deductions = [];
        $nssf = '0.00';
        $paye = '0.00';
        $other = '0.00';
        $taxable = $gross;
        $band = null;

        $deductionComponents = $applicable->where('type', 'deduction');

        foreach ($deductionComponents->filter(fn ($c) => $c->code === 'NSSF_EE') as $c) {
            $amount = $this->componentAmount($c, $assigned, $earnedBasic, $gross, $grossCodes);
            $nssf = bcadd($nssf, $amount, 2);
            $deductions[] = $this->line($c, $amount, 'nssf');
        }

        if (($rules['paye_taxable'] ?? '') === 'gross_less_nssf_employee') {
            $taxable = bcsub($gross, $nssf, 2);
        }

        foreach ($deductionComponents->where('calculation', 'paye') as $c) {
            [$amount, $band] = $this->paye($taxable, $rules['paye_bands'] ?? []);
            if (isset($assigned[$c->id]) && $assigned[$c->id] !== null) {
                $amount = $this->round((string) $assigned[$c->id]);
            }
            $paye = bcadd($paye, $amount, 2);
            $deductions[] = $this->line($c, $amount, 'paye');
        }

        foreach ($deductionComponents->filter(fn ($c) => $c->code !== 'NSSF_EE' && $c->calculation !== 'paye') as $c) {
            $amount = $this->componentAmount($c, $assigned, $earnedBasic, $gross, $grossCodes);
            if (bccomp($amount, '0', 2) <= 0) {
                continue;
            }
            $other = bcadd($other, $amount, 2);
            $deductions[] = $this->line($c, $amount, 'other');
        }

        $totalDeductions = bcadd(bcadd($nssf, $paye, 2), $other, 2);
        $net = bcsub($gross, $totalDeductions, 2);

        // 3. Employer contributions
        $employer = [];
        $employerTotal = '0.00';
        foreach ($applicable->where('type', 'employer_contribution') as $c) {
            $amount = $this->componentAmount($c, $assigned, $earnedBasic, $gross, $grossCodes);
            if (bccomp($amount, '0', 2) <= 0) {
                continue;
            }
            $employer[] = $this->line($c, $amount);
            $employerTotal = bcadd($employerTotal, $amount, 2);
        }

        return [
            'basic_salary' => $basic,
            'allowances' => $allowanceTotal,
            'gross_pay' => $gross,
            'paye' => $paye,
            'nssf_employee' => $nssf,
            'other_deductions' => $other,
            'total_deductions' => $totalDeductions,
            'net_pay' => $net,
            'employer_contributions' => $employerTotal,
            'breakdown' => [
                'basic' => $basic,
                'unpaid_leave_days' => $unpaidLeaveDays,
                'unpaid_leave_amount' => $unpaidAmount,
                'earned_basic' => $earnedBasic,
                'allowances' => $allowances,
                'gross' => $gross,
                'taxable_income' => $taxable,
                'paye_band' => $band,
                'deductions' => $deductions,
                'employer' => $employer,
                'net' => $net,
                'employee' => [
                    'employee_no' => $employee->employee_no,
                    'name' => $employee->full_name,
                    'designation' => $employee->designation,
                    'bank_name' => $employee->bank_name,
                    'bank_account' => $employee->bank_account,
                    'nssf_no' => $employee->nssf_no,
                    'tin' => $employee->tin,
                ],
                'rules_version' => $rules['version'] ?? null,
            ],
        ];
    }

    /**
     * PAYE on monthly taxable income using banded rates.
     *
     * @param  array<int, array{from: string, to: string|null, rate: string, base_tax: string}>  $bands
     * @return array{0: string, 1: array<string, mixed>|null}
     */
    public function paye(string $taxable, array $bands): array
    {
        if (bccomp($taxable, '0', 2) <= 0) {
            return ['0.00', null];
        }

        foreach ($bands as $i => $band) {
            $inBand = bccomp($taxable, (string) $band['from'], 2) > 0
                && ($band['to'] === null || bccomp($taxable, (string) $band['to'], 2) <= 0);

            if ($inBand || ($i === 0 && bccomp($taxable, (string) $band['to'], 2) <= 0)) {
                $excess = bcsub($taxable, (string) $band['from'], 6);
                $tax = bcadd((string) $band['base_tax'], bcmul($excess, (string) $band['rate'], 6), 6);

                return [$this->round($tax), $band];
            }
        }

        return ['0.00', null];
    }

    /** @param  array<int, string|null>  $assigned  @param array<int,string> $grossCodes */
    protected function componentAmount(SalaryComponent $c, array $assigned, string $basic, string $gross, array $grossCodes): string
    {
        if (isset($assigned[$c->id]) && $assigned[$c->id] !== null && $assigned[$c->id] !== '') {
            return $this->round((string) $assigned[$c->id]);
        }

        return match ($c->calculation) {
            'fixed' => $this->round((string) $c->value),
            'percent_of_basic' => $this->round(bcdiv(bcmul(
                $c->is_statutory && in_array($c->code, $grossCodes, true) ? $gross : $basic,
                (string) $c->value,
                6,
            ), '100', 6)),
            default => '0.00',
        };
    }

    /** @return array<string, mixed> */
    protected function line(SalaryComponent $c, string $amount, ?string $kind = null): array
    {
        return array_filter([
            'component_id' => $c->id,
            'code' => $c->code,
            'name' => $c->name,
            'calculation' => $c->calculation,
            'rate' => $c->calculation === 'percent_of_basic' ? (string) (float) $c->value : null,
            'amount' => $amount,
            'account_id' => $c->account_id,
            'kind' => $kind,
        ], fn ($v) => $v !== null);
    }

    /** Round half-up to 2 decimal places. */
    public function round(string $value): string
    {
        return bccomp($value, '0', 6) >= 0 ? bcadd($value, '0.005', 2) : bcsub($value, '0.005', 2);
    }
}
