<?php

namespace App\Reports\Hr;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class LeaveSummary extends Report
{
    public function key(): string
    {
        return 'leave-summary';
    }

    public function title(): string
    {
        return 'Staff Leave Summary';
    }

    public function description(): string
    {
        return 'Leave days taken per employee and leave type against annual entitlement.';
    }

    public function category(): string
    {
        return 'hr';
    }

    public function icon(): string
    {
        return 'plane';
    }

    public function permissions(): array
    {
        return ['hr.view'];
    }

    public function filters(): array
    {
        $types = $this->table('leave_types')->orderBy('name')->get(['id', 'name'])->map(fn ($t) => ['value' => $t->id, 'label' => $t->name])->all();

        return [
            ...$this->rangeFilters(now()->startOfYear()->toDateString(), now()->endOfYear()->toDateString()),
            $this->selectFilter('status', 'Status', $this->enum(['pending', 'approved', 'rejected', 'cancelled']), 'approved', 'All statuses'),
            $this->selectFilter('leave_type', 'Leave type', $types, '', 'All types'),
            $this->departmentFilter(),
        ];
    }

    public function run(array $f): array
    {
        $q = $this->table('leave_requests')
            ->join('employees', 'employees.id', '=', 'leave_requests.employee_id')
            ->join('leave_types', 'leave_types.id', '=', 'leave_requests.leave_type_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->when($f['status'], fn ($q, $v) => $q->where('leave_requests.status', $v))
            ->when($f['leave_type'], fn ($q, $v) => $q->where('leave_requests.leave_type_id', $v))
            ->when($f['department'], fn ($q, $v) => $q->where('employees.department_id', $v));
        $this->dateRange($q, 'leave_requests.start_date', $f);

        $rows = $this->rows($q->groupBy('employees.id', 'employees.employee_no', 'employees.first_name', 'employees.last_name', 'departments.name', 'leave_types.id', 'leave_types.name', 'leave_types.days_per_year', 'leave_types.is_paid')
            ->orderBy('employees.first_name')->orderBy('leave_types.name')
            ->get([
                'employees.employee_no',
                DB::raw("CONCAT(employees.first_name, ' ', employees.last_name) as employee"),
                DB::raw("COALESCE(departments.name, '') as department"),
                'leave_types.name as leave_type',
                DB::raw("IF(leave_types.is_paid, 'Paid', 'Unpaid') as paid"),
                DB::raw('COUNT(*) as requests'),
                DB::raw('SUM(leave_requests.days) as days'),
                'leave_types.days_per_year as entitlement',
                DB::raw('MIN(leave_requests.start_date) as first_leave'),
                DB::raw('MAX(leave_requests.end_date) as last_leave'),
            ]));

        foreach ($rows as &$r) {
            $r['requests'] = (int) $r['requests'];
            $r['days'] = (int) $r['days'];
            $r['entitlement'] = (int) $r['entitlement'];
            $r['remaining'] = $r['entitlement'] > 0 ? $r['entitlement'] - $r['days'] : null;
        }
        unset($r);

        $byType = [];
        foreach ($rows as $r) {
            $byType[$r['leave_type']] = ($byType[$r['leave_type']] ?? 0) + $r['days'];
        }
        $pending = $this->table('leave_requests')->where('status', 'pending')->count();

        return [
            'columns' => [
                $this->col('employee_no', 'Staff No'),
                $this->col('employee', 'Employee'),
                $this->col('department', 'Department'),
                $this->col('leave_type', 'Leave type'),
                $this->col('paid', 'Paid'),
                $this->col('requests', 'Requests', 'number'),
                $this->col('days', 'Days taken', 'number'),
                $this->col('entitlement', 'Entitlement', 'number'),
                $this->col('remaining', 'Remaining', 'number'),
                $this->col('first_leave', 'First', 'date'),
                $this->col('last_leave', 'Last', 'date'),
            ],
            'rows' => $rows,
            'totals' => ['employee_no' => 'Total', 'requests' => $this->count($rows, 'requests'), 'days' => $this->count($rows, 'days')],
            'summary' => [
                $this->stat('Leave days', $this->count($rows, 'days'), 'number', 'primary', 'calendar'),
                $this->stat('Requests', $this->count($rows, 'requests'), 'number', 'info', 'file-text'),
                $this->stat('Staff on record', count(array_unique(array_column($rows, 'employee_no'))), 'number', 'secondary', 'users'),
                $this->stat('Pending approval', $pending, 'number', 'warning', 'clock'),
            ],
            'chart' => $byType ? [
                'type' => 'donut',
                'labels' => array_keys($byType),
                'series' => array_values($byType),
            ] : null,
        ];
    }
}
