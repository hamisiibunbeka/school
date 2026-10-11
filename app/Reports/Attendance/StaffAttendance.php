<?php

namespace App\Reports\Attendance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class StaffAttendance extends Report
{
    public function key(): string
    {
        return 'staff-attendance';
    }

    public function title(): string
    {
        return 'Staff Attendance Summary';
    }

    public function description(): string
    {
        return 'Days present, late, absent and on leave per employee, with average check-in time.';
    }

    public function category(): string
    {
        return 'attendance';
    }

    public function icon(): string
    {
        return 'user-check';
    }

    public function permissions(): array
    {
        return ['attendance.view'];
    }

    public function filters(): array
    {
        return [
            ...$this->rangeFilters(now()->startOfMonth()->toDateString(), $this->today()),
            $this->departmentFilter(),
            $this->selectFilter('category', 'Category', $this->enum(['teaching', 'non_teaching']), '', 'All staff'),
        ];
    }

    public function run(array $f): array
    {
        $rows = $this->table('employees')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->leftJoin('staff_attendances as sa', function ($j) use ($f) {
                $j->on('sa.employee_id', '=', 'employees.id');
                if ($f['from'] !== '') {
                    $j->where('sa.date', '>=', $f['from']);
                }
                if ($f['to'] !== '') {
                    $j->where('sa.date', '<=', $f['to']);
                }
            })
            ->whereIn('employees.status', ['active', 'on_leave'])
            ->when($f['department'], fn ($q, $v) => $q->where('employees.department_id', $v))
            ->when($f['category'], fn ($q, $v) => $q->where('employees.category', $v))
            ->groupBy('employees.id', 'employees.employee_no', 'employees.first_name', 'employees.last_name', 'employees.designation', 'departments.name')
            ->orderBy('employees.first_name')
            ->get([
                'employees.id', 'employees.employee_no',
                DB::raw("CONCAT(employees.first_name, ' ', employees.last_name) as employee"),
                'employees.designation', DB::raw("COALESCE(departments.name, '') as department"),
                DB::raw('COUNT(sa.id) as days'),
                DB::raw("COALESCE(SUM(sa.status = 'present'), 0) as present"),
                DB::raw("COALESCE(SUM(sa.status = 'late'), 0) as late"),
                DB::raw("COALESCE(SUM(sa.status = 'absent'), 0) as absent"),
                DB::raw("COALESCE(SUM(sa.status = 'on_leave'), 0) as on_leave"),
                DB::raw("TIME_FORMAT(SEC_TO_TIME(AVG(TIME_TO_SEC(sa.check_in))), '%H:%i') as avg_check_in"),
            ]);

        $rows = array_map(function ($r) {
            $r = (array) $r;
            foreach (['days', 'present', 'late', 'absent', 'on_leave'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            $r['rate'] = $this->pct($r['present'] + $r['late'], $r['days'] - $r['on_leave']);

            return $r;
        }, $this->rows($rows));

        $days = $this->count($rows, 'days') - $this->count($rows, 'on_leave');
        $attended = $this->count($rows, 'present') + $this->count($rows, 'late');

        return [
            'columns' => [
                $this->col('employee_no', 'Staff No'),
                $this->col('employee', 'Employee'),
                $this->col('designation', 'Designation'),
                $this->col('department', 'Department'),
                $this->col('days', 'Days marked', 'number'),
                $this->col('present', 'Present', 'number'),
                $this->col('late', 'Late', 'number'),
                $this->col('absent', 'Absent', 'number'),
                $this->col('on_leave', 'On leave', 'number'),
                $this->col('avg_check_in', 'Avg. check-in'),
                $this->col('rate', 'Attendance', 'percent'),
            ],
            'rows' => $rows,
            'totals' => [
                'employee' => 'Total',
                'days' => $this->count($rows, 'days'),
                'present' => $this->count($rows, 'present'),
                'late' => $this->count($rows, 'late'),
                'absent' => $this->count($rows, 'absent'),
                'on_leave' => $this->count($rows, 'on_leave'),
                'rate' => $this->pct($attended, $days),
            ],
            'summary' => [
                $this->stat('Staff', count($rows), 'number', 'primary', 'users'),
                $this->stat('Attendance rate', $this->pct($attended, $days), 'percent', 'success', 'trending-up'),
                $this->stat('Late arrivals', $this->count($rows, 'late'), 'number', 'warning', 'clock'),
                $this->stat('Absences', $this->count($rows, 'absent'), 'number', 'danger', 'x'),
            ],
            'chart' => $this->count($rows, 'days') ? [
                'type' => 'donut',
                'labels' => ['Present', 'Late', 'Absent', 'On leave'],
                'series' => [$this->count($rows, 'present'), $this->count($rows, 'late'), $this->count($rows, 'absent'), $this->count($rows, 'on_leave')],
            ] : null,
        ];
    }
}
