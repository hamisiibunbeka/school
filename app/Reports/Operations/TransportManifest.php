<?php

namespace App\Reports\Operations;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class TransportManifest extends Report
{
    public function key(): string
    {
        return 'transport-manifest';
    }

    public function title(): string
    {
        return 'Transport Route Manifest';
    }

    public function description(): string
    {
        return 'Learners per route and stop with pickup/drop-off times and guardian phone.';
    }

    public function category(): string
    {
        return 'operations';
    }

    public function icon(): string
    {
        return 'bus';
    }

    public function permissions(): array
    {
        return ['transport.view'];
    }

    public function filters(): array
    {
        $routes = $this->table('transport_routes')->orderBy('name')->get(['id', 'name'])->map(fn ($r) => ['value' => $r->id, 'label' => $r->name])->all();

        return [
            $this->selectFilter('route', 'Route', $routes, '', 'All routes'),
            $this->classFilter(),
        ];
    }

    public function run(array $f): array
    {
        $phone = DB::table('guardian_student')
            ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
            ->where('guardians.school_id', $this->schoolId())
            ->groupBy('guardian_student.student_id')
            ->selectRaw("guardian_student.student_id, MAX(CONCAT(guardians.first_name, ' ', guardians.last_name)) as guardian, MAX(guardians.phone) as phone");

        $rows = $this->rows($this->table('student_transports')
            ->join('students', 'students.id', '=', 'student_transports.student_id')
            ->join('transport_routes', 'transport_routes.id', '=', 'student_transports.transport_route_id')
            ->leftJoin('route_stops', 'route_stops.id', '=', 'student_transports.route_stop_id')
            ->leftJoin('vehicles', 'vehicles.id', '=', 'transport_routes.vehicle_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->leftJoinSub($phone, 'pg', 'pg.student_id', '=', 'students.id')
            ->where('student_transports.status', 'active')
            ->whereNull('students.deleted_at')->where('students.status', 'active')
            ->when($f['route'], fn ($q, $v) => $q->where('student_transports.transport_route_id', $v))
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->orderBy('transport_routes.name')->orderBy('route_stops.sequence')->orderBy('students.first_name')
            ->get([
                'transport_routes.name as route', DB::raw("COALESCE(vehicles.registration_no, '') as vehicle"),
                DB::raw("COALESCE(route_stops.name, '') as stop"),
                DB::raw("TIME_FORMAT(route_stops.pickup_time, '%H:%i') as pickup"),
                DB::raw("TIME_FORMAT(route_stops.dropoff_time, '%H:%i') as dropoff"),
                'students.admission_no', $this->studentName(),
                DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
                DB::raw("COALESCE(pg.guardian, '') as guardian"), DB::raw("COALESCE(pg.phone, '') as phone"),
            ]));

        $byRoute = array_count_values(array_column($rows, 'route'));

        return [
            'columns' => [
                $this->col('route', 'Route'),
                $this->col('vehicle', 'Vehicle'),
                $this->col('stop', 'Stop'),
                $this->col('pickup', 'Pickup'),
                $this->col('dropoff', 'Drop-off'),
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('guardian', 'Guardian'),
                $this->col('phone', 'Phone'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('Learners on transport', count($rows), 'number', 'primary', 'users'),
                $this->stat('Routes', count($byRoute), 'number', 'info', 'map'),
                $this->stat('Stops served', count(array_unique(array_filter(array_map(fn ($r) => $r['route'].'|'.$r['stop'], $rows)))), 'number', 'secondary', 'map-pin'),
            ],
            'chart' => $byRoute ? [
                'type' => 'bar',
                'horizontal' => true,
                'categories' => array_keys($byRoute),
                'series' => [['name' => 'Learners', 'data' => array_values($byRoute)]],
            ] : null,
        ];
    }
}
