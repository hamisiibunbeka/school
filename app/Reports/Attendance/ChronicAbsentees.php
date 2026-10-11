<?php

namespace App\Reports\Attendance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class ChronicAbsentees extends Report
{
    public function key(): string
    {
        return 'chronic-absentees';
    }

    public function title(): string
    {
        return 'Chronic Absentees';
    }

    public function description(): string
    {
        return 'Learners with repeated unexcused absences in a period, with guardian contacts for follow-up.';
    }

    public function category(): string
    {
        return 'attendance';
    }

    public function icon(): string
    {
        return 'user-x';
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
            $this->numberFilter('min_absences', 'Min. absences', '3', ['min' => 1]),
        ];
    }

    public function run(array $f): array
    {
        $min = max((int) ($f['min_absences'] ?: 3), 1);

        $primaryPhone = DB::table('guardian_student')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->where('guardians.school_id', $this->schoolId())
            ->groupBy('guardian_student.student_id')
            ->selectRaw("guardian_student.student_id, MAX(CONCAT(guardians.first_name, ' ', guardians.last_name)) as guardian, MAX(guardians.phone) as phone");

        $q = $this->table('attendance_records')
            ->join('students', 'students.id', '=', 'attendance_records.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->leftJoinSub($primaryPhone, 'pg', 'pg.student_id', '=', 'students.id')
            ->whereNull('students.deleted_at')
            ->when($f['class'], fn ($q, $v) => $q->where('attendance_records.school_class_id', $v));
        $this->dateRange($q, 'attendance_records.date', $f);

        $rows = $q->groupBy('students.id', 'students.admission_no', 'students.first_name', 'students.middle_name', 'students.last_name', 'school_classes.name', 'streams.name', 'pg.guardian', 'pg.phone')
            ->havingRaw("SUM(attendance_records.status = 'absent') >= ?", [$min])
            ->orderByRaw("SUM(attendance_records.status = 'absent') DESC")
            ->get([
                'students.id', 'students.admission_no', $this->studentName(),
                DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
                DB::raw('COUNT(*) as days'),
                DB::raw("SUM(attendance_records.status = 'absent') as absent"),
                DB::raw("SUM(attendance_records.status = 'late') as late"),
                DB::raw("MAX(CASE WHEN attendance_records.status = 'absent' THEN attendance_records.date END) as last_absent"),
                DB::raw("COALESCE(pg.guardian, '') as guardian"),
                DB::raw("COALESCE(pg.phone, '') as phone"),
            ]);

        $rows = array_map(function ($r) {
            $r = (array) $r;
            $r['days'] = (int) $r['days'];
            $r['absent'] = (int) $r['absent'];
            $r['late'] = (int) $r['late'];
            $r['absence_rate'] = $this->pct($r['absent'], $r['days']);

            return $r;
        }, $this->rows($rows));

        return [
            'columns' => [
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('days', 'Days marked', 'number'),
                $this->col('absent', 'Absent', 'number'),
                $this->col('late', 'Late', 'number'),
                $this->col('absence_rate', 'Absence rate', 'percent'),
                $this->col('last_absent', 'Last absent', 'date'),
                $this->col('guardian', 'Guardian'),
                $this->col('phone', 'Phone'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('Chronic absentees', count($rows), 'number', 'danger', 'user-x'),
                $this->stat('Total absences', $this->count($rows, 'absent'), 'number', 'warning', 'x'),
                $this->stat('Highest absences', $rows ? max(array_column($rows, 'absent')) : 0, 'number', 'secondary', 'alert-triangle'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'horizontal' => true,
                'categories' => array_column(array_slice($rows, 0, 15), 'student'),
                'series' => [['name' => 'Days absent', 'data' => array_column(array_slice($rows, 0, 15), 'absent')]],
            ] : null,
        ];
    }
}
