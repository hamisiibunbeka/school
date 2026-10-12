<?php

namespace App\Reports\Hr;

use App\Reports\Report;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PayrollSummary extends Report
{
    public function key(): string
    {
        return 'payroll-summary';
    }

    public function title(): string
    {
        return 'Payroll Summary by Month';
    }

    public function description(): string
    {
        return 'Gross pay, PAYE, NSSF, other deductions, net pay and employer costs per payroll run.';
    }

    public function category(): string
    {
        return 'hr';
    }

    public function icon(): string
    {
        return 'banknote';
    }

    public function permissions(): array
    {
        return ['payroll.view'];
    }

    public function filters(): array
    {
        $years = $this->table('payroll_runs')->selectRaw('DISTINCT LEFT(period, 4) as y')->orderByDesc('y')->pluck('y')->all();
        $current = now()->format('Y');
        if (! in_array($current, $years, true)) {
            array_unshift($years, $current);
        }

        return [
            $this->selectFilter('year', 'Year', array_map(fn ($y) => ['value' => $y, 'label' => $y], $years), $current, 'All years'),
            $this->selectFilter('status', 'Status', $this->enum(['draft', 'approved', 'partially_paid', 'paid']), '', 'All runs'),
            $this->departmentFilter(),
        ];
    }

    public function period(array $values): string
    {
        return $values['year'] !== '' ? 'January – December '.$values['year'] : 'All payroll periods';
    }

    public function run(array $f): array
    {
        $rows = $this->rows($this->table('payroll_runs')
            ->join('payslips', 'payslips.payroll_run_id', '=', 'payroll_runs.id')
            ->join('employees', 'employees.id', '=', 'payslips.employee_id')
            ->when($f['year'], fn ($q, $v) => $q->where('payroll_runs.period', 'like', "$v-%"))
            ->when($f['status'], fn ($q, $v) => $q->where('payroll_runs.status', $v))
            ->when($f['department'], fn ($q, $v) => $q->where('employees.department_id', $v))
            ->groupBy('payroll_runs.id', 'payroll_runs.period', 'payroll_runs.status', 'payroll_runs.payment_date')
            ->orderBy('payroll_runs.period')
            ->get([
                'payroll_runs.id', 'payroll_runs.period', 'payroll_runs.status', 'payroll_runs.payment_date',
                DB::raw('COUNT(payslips.id) as staff'),
                DB::raw('SUM(payslips.basic_salary) as basic'),
                DB::raw('SUM(payslips.allowances) as allowances'),
                DB::raw('SUM(payslips.gross_pay) as gross'),
                DB::raw('SUM(payslips.paye) as paye'),
                DB::raw('SUM(payslips.nssf_employee) as nssf'),
                DB::raw('SUM(payslips.other_deductions) as other_deductions'),
                DB::raw('SUM(payslips.net_pay) as net'),
                DB::raw('SUM(payslips.employer_contributions) as employer'),
            ]));

        foreach ($rows as &$r) {
            $r['month'] = Carbon::createFromFormat('Y-m-d', $r['period'].'-01')->format('F Y');
            $r['staff'] = (int) $r['staff'];
            $r['cost'] = bcadd((string) $r['gross'], (string) $r['employer'], 2);
        }
        unset($r);

        $keys = ['basic', 'allowances', 'gross', 'paye', 'nssf', 'other_deductions', 'net', 'employer', 'cost'];
        $totals = ['month' => 'Total'];
        foreach ($keys as $k) {
            $totals[$k] = $this->sum($rows, $k);
        }

        return [
            'columns' => [
                $this->col('month', 'Period'),
                $this->col('status', 'Status', 'badge'),
                $this->col('staff', 'Staff', 'number'),
                $this->col('basic', 'Basic', 'money'),
                $this->col('allowances', 'Allowances', 'money'),
                $this->col('gross', 'Gross pay', 'money'),
                $this->col('paye', 'PAYE', 'money'),
                $this->col('nssf', 'NSSF (employee)', 'money'),
                $this->col('other_deductions', 'Other deductions', 'money'),
                $this->col('net', 'Net pay', 'money'),
                $this->col('employer', 'Employer contrib.', 'money'),
                $this->col('cost', 'Total cost', 'money'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Gross pay', $totals['gross'], 'money', 'primary', 'banknote'),
                $this->stat('PAYE', $totals['paye'], 'money', 'danger', 'landmark'),
                $this->stat('NSSF (employee)', $totals['nssf'], 'money', 'warning', 'shield'),
                $this->stat('Net pay', $totals['net'], 'money', 'success', 'wallet'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'format' => 'money',
                'categories' => array_map(fn ($r) => Carbon::createFromFormat('Y-m-d', $r['period'].'-01')->format('M y'), $rows),
                'series' => [
                    ['name' => 'Gross', 'data' => array_map(fn ($r) => (float) $r['gross'], $rows)],
                    ['name' => 'Net', 'data' => array_map(fn ($r) => (float) $r['net'], $rows)],
                    ['name' => 'PAYE', 'data' => array_map(fn ($r) => (float) $r['paye'], $rows)],
                ],
            ] : null,
        ];
    }
}
