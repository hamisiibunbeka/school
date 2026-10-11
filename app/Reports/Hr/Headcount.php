<?php

namespace App\Reports\Hr;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class Headcount extends Report
{
    public function key(): string
    {
        return 'headcount';
    }

    public function title(): string
    {
        return 'Staff Headcount by Department';
    }

    public function description(): string
    {
        return 'Teaching and support staff per department by gender and employment type.';
    }

    public function category(): string
    {
        return 'hr';
    }

    public function icon(): string
    {
        return 'briefcase';
    }

    public function permissions(): array
    {
        return ['hr.view'];
    }

    public function filters(): array
    {
        return [
            $this->selectFilter('status', 'Status', $this->enum(['active', 'on_leave', 'suspended', 'terminated']), 'active', 'Any status'),
            $this->selectFilter('employment_type', 'Employment type', $this->enum(['permanent', 'contract', 'part_time']), '', 'All types'),
        ];
    }

    public function run(array $f): array
    {
        $rows = $this->rows($this->table('employees')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->when($f['status'], fn ($q, $v) => $q->where('employees.status', $v))
            ->when($f['employment_type'], fn ($q, $v) => $q->where('employees.employment_type', $v))
            ->groupBy('departments.id', 'departments.name')
            ->orderByRaw('departments.name IS NULL, departments.name')
            ->get([
                DB::raw("COALESCE(departments.name, 'Unassigned') as department"),
                DB::raw("SUM(employees.category = 'teaching') as teaching"),
                DB::raw("SUM(employees.category <> 'teaching') as non_teaching"),
                DB::raw("SUM(employees.gender = 'male') as male"),
                DB::raw("SUM(employees.gender = 'female') as female"),
                DB::raw("SUM(employees.employment_type = 'permanent') as permanent"),
                DB::raw("SUM(employees.employment_type = 'contract') as contract"),
                DB::raw("SUM(employees.employment_type = 'part_time') as part_time"),
                DB::raw('COUNT(*) as total'),
                DB::raw('SUM(employees.basic_salary) as basic_salary'),
            ]));

        $ints = ['teaching', 'non_teaching', 'male', 'female', 'permanent', 'contract', 'part_time', 'total'];
        foreach ($rows as &$r) {
            foreach ($ints as $k) {
                $r[$k] = (int) $r[$k];
            }
        }
        unset($r);

        $totals = ['department' => 'Total', 'basic_salary' => $this->sum($rows, 'basic_salary')];
        foreach ($ints as $k) {
            $totals[$k] = $this->count($rows, $k);
        }

        $expiring = $this->table('employees')->where('status', 'active')
            ->whereBetween('contract_end_date', [$this->today(), now()->addDays(60)->toDateString()])->count();

        return [
            'columns' => [
                $this->col('department', 'Department'),
                $this->col('teaching', 'Teaching', 'number'),
                $this->col('non_teaching', 'Non-teaching', 'number'),
                $this->col('male', 'Male', 'number'),
                $this->col('female', 'Female', 'number'),
                $this->col('permanent', 'Permanent', 'number'),
                $this->col('contract', 'Contract', 'number'),
                $this->col('part_time', 'Part-time', 'number'),
                $this->col('total', 'Total', 'number'),
                $this->col('basic_salary', 'Basic salary bill', 'money'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Headcount', $totals['total'], 'number', 'primary', 'users'),
                $this->stat('Teaching', $totals['teaching'], 'number', 'info', 'graduation-cap'),
                $this->stat('Support staff', $totals['non_teaching'], 'number', 'secondary', 'briefcase'),
                $this->stat('Contracts ending ≤ 60 days', $expiring, 'number', 'warning', 'clock'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'stacked' => true,
                'categories' => array_column($rows, 'department'),
                'series' => [
                    ['name' => 'Teaching', 'data' => array_column($rows, 'teaching')],
                    ['name' => 'Non-teaching', 'data' => array_column($rows, 'non_teaching')],
                ],
            ] : null,
        ];
    }
}
