<?php

namespace App\Reports\Operations;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class TransportUtilisation extends Report
{
    public function key(): string
    {
        return 'transport-utilisation';
    }

    public function title(): string
    {
        return 'Transport Route Utilisation & Costs';
    }

    public function description(): string
    {
        return 'Seats used per route against vehicle capacity, expected fare income and running costs.';
    }

    public function category(): string
    {
        return 'operations';
    }

    public function icon(): string
    {
        return 'gauge';
    }

    public function permissions(): array
    {
        return ['transport.view'];
    }

    public function filters(): array
    {
        return [...$this->rangeFilters($this->termStart(), $this->today())];
    }

    public function run(array $f): array
    {
        $riders = $this->table('student_transports')->where('status', 'active')
            ->groupBy('transport_route_id')->selectRaw('transport_route_id, COUNT(*) as riders');
        $stops = DB::table('route_stops')->groupBy('transport_route_id')->selectRaw('transport_route_id, COUNT(*) as stops');
        $costs = $this->table('vehicle_logs')
            ->when($f['from'], fn ($q, $v) => $q->whereDate('date', '>=', $v))
            ->when($f['to'], fn ($q, $v) => $q->whereDate('date', '<=', $v))
            ->groupBy('vehicle_id')
            ->selectRaw("vehicle_id, SUM(amount) as cost, SUM(CASE WHEN type = 'fuel' THEN litres END) as litres");

        $rows = $this->rows($this->table('transport_routes')
            ->leftJoin('vehicles', 'vehicles.id', '=', 'transport_routes.vehicle_id')
            ->leftJoin('employees as driver', 'driver.id', '=', 'vehicles.driver_id')
            ->leftJoinSub($riders, 'r', 'r.transport_route_id', '=', 'transport_routes.id')
            ->leftJoinSub($stops, 's', 's.transport_route_id', '=', 'transport_routes.id')
            ->leftJoinSub($costs, 'c', 'c.vehicle_id', '=', 'vehicles.id')
            ->orderBy('transport_routes.name')
            ->get([
                'transport_routes.name as route',
                DB::raw("COALESCE(vehicles.registration_no, 'Unassigned') as vehicle"),
                DB::raw("COALESCE(CONCAT(driver.first_name, ' ', driver.last_name), '') as driver"),
                DB::raw('COALESCE(s.stops, 0) as stops'),
                DB::raw('COALESCE(vehicles.capacity, 0) as capacity'),
                DB::raw('COALESCE(r.riders, 0) as riders'),
                'transport_routes.fare',
                DB::raw('COALESCE(r.riders, 0) * transport_routes.fare as expected_income'),
                DB::raw('COALESCE(c.cost, 0) as running_cost'),
                DB::raw('COALESCE(c.litres, 0) as litres'),
            ]));

        foreach ($rows as &$r) {
            $r['stops'] = (int) $r['stops'];
            $r['capacity'] = (int) $r['capacity'];
            $r['riders'] = (int) $r['riders'];
            $r['utilisation'] = $this->pct($r['riders'], $r['capacity']);
        }
        unset($r);

        $capacity = $this->count($rows, 'capacity');
        $riders = $this->count($rows, 'riders');

        return [
            'columns' => [
                $this->col('route', 'Route'),
                $this->col('vehicle', 'Vehicle'),
                $this->col('driver', 'Driver'),
                $this->col('stops', 'Stops', 'number'),
                $this->col('capacity', 'Seats', 'number'),
                $this->col('riders', 'Learners', 'number'),
                $this->col('utilisation', 'Utilisation', 'percent'),
                $this->col('fare', 'Fare / term', 'money'),
                $this->col('expected_income', 'Expected income / term', 'money'),
                $this->col('running_cost', 'Vehicle costs (period)', 'money'),
                $this->col('litres', 'Fuel (L)', 'number'),
            ],
            'rows' => $rows,
            'totals' => [
                'route' => 'Total', 'stops' => $this->count($rows, 'stops'), 'capacity' => $capacity, 'riders' => $riders,
                'utilisation' => $this->pct($riders, $capacity), 'expected_income' => $this->sum($rows, 'expected_income'),
                'running_cost' => $this->sum($rows, 'running_cost'), 'litres' => $this->sum($rows, 'litres'),
            ],
            'summary' => [
                $this->stat('Seat utilisation', $this->pct($riders, $capacity), 'percent', 'primary', 'gauge'),
                $this->stat('Learners transported', $riders, 'number', 'info', 'users'),
                $this->stat('Expected fares / term', $this->sum($rows, 'expected_income'), 'money', 'success', 'wallet'),
                $this->stat('Vehicle costs', $this->sum($rows, 'running_cost'), 'money', 'danger', 'fuel'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'categories' => array_column($rows, 'route'),
                'series' => [
                    ['name' => 'Seats', 'data' => array_column($rows, 'capacity')],
                    ['name' => 'Learners', 'data' => array_column($rows, 'riders')],
                ],
            ] : null,
            'note' => 'Vehicle costs are shared by every route a vehicle serves.',
        ];
    }
}
