<?php

namespace App\Reports\Attendance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class StudentAttendance extends Report
{
    public function key(): string
    {
        return 'student-attendance';
    }

    public function title(): string
    {
        return 'Student Attendance Percentage';
    }

    public function description(): string
    {
        return 'Attendance rate per learner over a period, flagging those below a threshold.';
    }

    public function category(): string
    {
        return 'attendance';
    }

    public function icon(): string
    {
        return 'percent';
    }

    public function permissions(): array
    {
        return ['attendance.view'];
    }

    public function filters(): array
    {
        return [
            ...$this->rangeFilters($this->termStart(), $this->today()),
            $this->classFilter(),
            $this->streamFilter(),
            $this->numberFilter('threshold', 'Threshold %', '90', ['min' => 0, 'max' => 100]),
            $this->selectFilter('show', 'Show', [['value' => 'below', 'label' => 'Below threshold only']], '', 'All learners'),
        ];
    }

    public function run(array $f): array
    {
        $threshold = min(max((float) ($f['threshold'] ?: 90), 0), 100);

        $q = $this->table('attendance_records')
            ->join('students', 'students.id', '=', 'attendance_records.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->whereNull('students.deleted_at')
            ->when($f['class'], fn ($q, $v) => $q->where('attendance_records.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('attendance_records.stream_id', $v));
        $this->dateRange($q, 'attendance_records.date', $f);

        $rows = $q->groupBy('students.id', 'students.admission_no', 'students.first_name', 'students.middle_name', 'students.last_name', 'school_classes.name', 'school_classes.level', 'streams.name')
            ->orderBy('school_classes.level')->orderBy('streams.name')->orderBy('students.first_name')
            ->get([
                'students.id', 'students.admission_no', $this->studentName(),
                DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
                DB::raw('COUNT(*) as days'),
                DB::raw("SUM(attendance_records.status = 'present') as present"),
                DB::raw("SUM(attendance_records.status = 'late') as late"),
                DB::raw("SUM(attendance_records.status = 'absent') as absent"),
                DB::raw("SUM(attendance_records.status = 'excused') as excused"),
            ]);

        $rows = array_map(function ($r) use ($threshold) {
            $r = (array) $r;
            foreach (['days', 'present', 'late', 'absent', 'excused'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            $r['rate'] = $this->pct($r['present'] + $r['late'], $r['days']);
            $r['flag'] = ($r['rate'] ?? 0) < $threshold ? 'below' : 'ok';

            return $r;
        }, $this->rows($rows));

        $below = array_values(array_filter($rows, fn ($r) => $r['flag'] === 'below'));
        $all = $rows;
        if ($f['show'] === 'below') {
            $rows = $below;
        }

        $days = $this->count($all, 'days');
        $bands = ['< 75%' => 0, '75–84%' => 0, '85–94%' => 0, '95%+' => 0];
        foreach ($all as $r) {
            $rate = $r['rate'] ?? 0;
            $bands[$rate < 75 ? '< 75%' : ($rate < 85 ? '75–84%' : ($rate < 95 ? '85–94%' : '95%+'))]++;
        }

        return [
            'columns' => [
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('days', 'Days marked', 'number'),
                $this->col('present', 'Present', 'number'),
                $this->col('late', 'Late', 'number'),
                $this->col('absent', 'Absent', 'number'),
                $this->col('excused', 'Excused', 'number'),
                $this->col('rate', 'Attendance', 'percent'),
                $this->col('flag', 'Flag', 'badge'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('Learners', count($all), 'number', 'primary', 'users'),
                $this->stat('Average attendance', $this->pct($this->count($all, 'present') + $this->count($all, 'late'), $days), 'percent', 'success', 'trending-up'),
                $this->stat("Below {$threshold}%", count($below), 'number', 'danger', 'alert-triangle'),
                $this->stat('Absences recorded', $this->count($all, 'absent'), 'number', 'warning', 'x'),
            ],
            'chart' => $all ? [
                'type' => 'bar',
                'categories' => array_keys($bands),
                'series' => [['name' => 'Learners', 'data' => array_values($bands)]],
            ] : null,
        ];
    }
}
