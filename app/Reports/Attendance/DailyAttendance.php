<?php

namespace App\Reports\Attendance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class DailyAttendance extends Report
{
    public function key(): string
    {
        return 'daily-attendance';
    }

    public function title(): string
    {
        return 'Daily Attendance Summary by Class';
    }

    public function description(): string
    {
        return 'Present, late, absent and excused counts per class and stream for a single day.';
    }

    public function category(): string
    {
        return 'attendance';
    }

    public function icon(): string
    {
        return 'calendar-check';
    }

    public function permissions(): array
    {
        return ['attendance.view'];
    }

    public function filters(): array
    {
        return [$this->dateFilter('date', 'Date', $this->today())];
    }

    public function run(array $f): array
    {
        $date = $f['date'] ?: $this->today();

        $enrolled = $this->table('students')->whereNull('deleted_at')->where('status', 'active')
            ->groupBy('stream_id')->selectRaw('stream_id, COUNT(*) as total')->pluck('total', 'stream_id');

        $rows = $this->table('streams')
            ->join('school_classes', 'school_classes.id', '=', 'streams.school_class_id')
            ->leftJoin('attendance_records', function ($j) use ($date) {
                $j->on('attendance_records.stream_id', '=', 'streams.id')->where('attendance_records.date', '=', $date);
            })
            ->groupBy('streams.id', 'streams.name', 'school_classes.name', 'school_classes.level')
            ->orderBy('school_classes.level')->orderBy('streams.name')
            ->get([
                'streams.id',
                DB::raw("CONCAT(school_classes.name, ' ', streams.name) as class"),
                DB::raw('COUNT(attendance_records.id) as marked'),
                DB::raw("COALESCE(SUM(attendance_records.status = 'present'), 0) as present"),
                DB::raw("COALESCE(SUM(attendance_records.status = 'late'), 0) as late"),
                DB::raw("COALESCE(SUM(attendance_records.status = 'absent'), 0) as absent"),
                DB::raw("COALESCE(SUM(attendance_records.status = 'excused'), 0) as excused"),
            ]);

        $rows = array_map(function ($r) use ($enrolled) {
            $r = (array) $r;
            foreach (['marked', 'present', 'late', 'absent', 'excused'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            $r['enrolled'] = (int) ($enrolled[$r['id']] ?? 0);
            $r['rate'] = $this->pct($r['present'] + $r['late'], $r['marked']);
            $r['register'] = $r['marked'] > 0 ? 'marked' : 'not_marked';

            return $r;
        }, $this->rows($rows));

        $marked = $this->count($rows, 'marked');
        $attended = $this->count($rows, 'present') + $this->count($rows, 'late');

        return [
            'columns' => [
                $this->col('class', 'Class / stream'),
                $this->col('enrolled', 'Enrolled', 'number'),
                $this->col('marked', 'Marked', 'number'),
                $this->col('present', 'Present', 'number'),
                $this->col('late', 'Late', 'number'),
                $this->col('absent', 'Absent', 'number'),
                $this->col('excused', 'Excused', 'number'),
                $this->col('rate', 'Attendance', 'percent'),
                $this->col('register', 'Register', 'badge'),
            ],
            'rows' => $rows,
            'totals' => [
                'class' => 'Whole school',
                'enrolled' => $this->count($rows, 'enrolled'),
                'marked' => $marked,
                'present' => $this->count($rows, 'present'),
                'late' => $this->count($rows, 'late'),
                'absent' => $this->count($rows, 'absent'),
                'excused' => $this->count($rows, 'excused'),
                'rate' => $this->pct($attended, $marked),
            ],
            'summary' => [
                $this->stat('Attendance rate', $this->pct($attended, $marked), 'percent', 'success', 'trending-up'),
                $this->stat('Present (incl. late)', $attended, 'number', 'primary', 'check'),
                $this->stat('Absent', $this->count($rows, 'absent'), 'number', 'danger', 'x'),
                $this->stat('Registers not marked', count(array_filter($rows, fn ($r) => $r['marked'] === 0)), 'number', 'warning', 'clock'),
            ],
            'chart' => $marked ? [
                'type' => 'bar',
                'format' => 'percent',
                'categories' => array_column($rows, 'class'),
                'series' => [['name' => 'Attendance %', 'data' => array_map(fn ($r) => $r['rate'] ?? 0, $rows)]],
            ] : null,
        ];
    }
}
