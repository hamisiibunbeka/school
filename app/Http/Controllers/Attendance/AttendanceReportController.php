<?php

namespace App\Http\Controllers\Attendance;

use App\Http\Controllers\Controller;
use App\Models\Term;
use App\Support\Lookups;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Attendance reports: class/student summaries over a date range, daily trend and
 * students below a threshold. Attendance % = (present + late) ÷ days marked.
 */
class AttendanceReportController extends Controller
{
    public function index(Request $request): Response
    {
        $schoolId = $this->tenancy()->schoolId();
        $today = CarbonImmutable::today();

        $from = $this->date($request->input('from')) ?? $today->subDays(29)->toDateString();
        $to = $this->date($request->input('to')) ?? $today->toDateString();
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        $classId = $request->integer('class') ?: null;
        $streamId = $request->integer('stream') ?: null;
        $threshold = min(100, max(1, (int) ($request->input('threshold') ?: 85)));

        $base = fn () => DB::table('attendance_records')
            ->where('attendance_records.school_id', $schoolId)
            ->whereBetween('attendance_records.date', [$from, $to])
            ->when($classId, fn ($q) => $q->where('attendance_records.school_class_id', $classId))
            ->when($streamId, fn ($q) => $q->where('attendance_records.stream_id', $streamId));

        $statusSums = "SUM(attendance_records.status = 'present') as present, SUM(attendance_records.status = 'absent') as absent, "
            ."SUM(attendance_records.status = 'late') as late, SUM(attendance_records.status = 'excused') as excused, COUNT(*) as total";

        // Per-student summary
        $students = $base()
            ->join('students', 'students.id', '=', 'attendance_records.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->groupBy('students.id', 'students.admission_no', 'students.first_name', 'students.last_name', 'school_classes.name', 'streams.name')
            ->selectRaw("students.id, students.admission_no, CONCAT(students.first_name, ' ', students.last_name) as full_name, "
                ."TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class_name, {$statusSums}")
            ->get()
            ->map(fn ($r) => $this->withRate((array) $r))
            ->sortBy('full_name')->values();

        // Per-class summary
        $classes = $base()
            ->join('school_classes', 'school_classes.id', '=', 'attendance_records.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'attendance_records.stream_id')
            ->groupBy('school_classes.id', 'school_classes.name', 'school_classes.level', 'streams.id', 'streams.name')
            ->orderBy('school_classes.level')->orderBy('streams.name')
            ->selectRaw("school_classes.id as class_id, streams.id as stream_id, TRIM(CONCAT(school_classes.name, ' ', COALESCE(streams.name, ''))) as name, COUNT(DISTINCT attendance_records.student_id) as students, {$statusSums}")
            ->get()
            ->map(fn ($r) => $this->withRate((array) $r))->values();

        // Daily trend
        $daily = $base()
            ->groupBy('attendance_records.date')->orderBy('attendance_records.date')
            ->selectRaw("attendance_records.date, {$statusSums}")
            ->get()
            ->map(fn ($r) => $this->withRate(['date' => substr((string) $r->date, 0, 10)] + (array) $r))->values();

        $totals = $this->withRate([
            'present' => $students->sum('present'),
            'absent' => $students->sum('absent'),
            'late' => $students->sum('late'),
            'excused' => $students->sum('excused'),
            'total' => $students->sum('total'),
        ]);

        $term = Term::current();

        return Inertia::render('attendance/report', [
            'filters' => [
                'from' => $from,
                'to' => $to,
                'class' => $classId ? (string) $classId : '',
                'stream' => $streamId ? (string) $streamId : '',
                'threshold' => (string) $threshold,
            ],
            'classes' => Lookups::classes(),
            'students' => $students,
            'classSummary' => $classes,
            'daily' => $daily,
            'below' => $students->filter(fn ($s) => $s['rate'] !== null && $s['rate'] < $threshold)->sortBy('rate')->values(),
            'totals' => $totals + ['days' => $daily->count(), 'students' => $students->count()],
            'presets' => array_filter([
                'term' => $term ? ['from' => $term->start_date->toDateString(), 'to' => min($term->end_date->toDateString(), $today->toDateString()), 'label' => $term->name] : null,
                'month' => ['from' => $today->startOfMonth()->toDateString(), 'to' => $today->toDateString(), 'label' => 'This month'],
                'week' => ['from' => $today->startOfWeek()->toDateString(), 'to' => $today->toDateString(), 'label' => 'This week'],
            ]),
        ]);
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function withRate(array $row): array
    {
        foreach (['present', 'absent', 'late', 'excused', 'total'] as $k) {
            $row[$k] = (int) ($row[$k] ?? 0);
        }
        $row['rate'] = $row['total'] ? round(($row['present'] + $row['late']) / $row['total'] * 100, 1) : null;

        return $row;
    }

    private function date(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) && strtotime($value) ? $value : null;
    }
}
