<?php

namespace App\Reports\Operations;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class BoardingOccupancy extends Report
{
    public function key(): string
    {
        return 'boarding-occupancy';
    }

    public function title(): string
    {
        return 'Boarding Occupancy';
    }

    public function description(): string
    {
        return 'Beds, occupied and vacant places per dormitory with occupancy rate and warden.';
    }

    public function category(): string
    {
        return 'operations';
    }

    public function icon(): string
    {
        return 'bed';
    }

    public function permissions(): array
    {
        return ['boarding.view'];
    }

    public function filters(): array
    {
        return [
            $this->selectFilter('gender', 'Dormitory type', $this->enum(['male', 'female', 'mixed']), '', 'All dormitories'),
            $this->selectFilter('view', 'Detail', [['value' => 'dormitory', 'label' => 'Per dormitory'], ['value' => 'room', 'label' => 'Per room']], 'dormitory', null),
        ];
    }

    public function run(array $f): array
    {
        $occupied = $this->table('bed_allocations')->where('status', 'active')
            ->groupBy('dormitory_room_id')->selectRaw('dormitory_room_id, COUNT(*) as occupied');

        $perRoom = $f['view'] === 'room';

        // Patrons / matrons / assistants, e.g. "John Mushi (patron), Rose Kim (assistant)".
        $caretakers = $this->table('dormitory_caretakers')
            ->join('employees', 'employees.id', '=', 'dormitory_caretakers.employee_id')
            ->groupBy('dormitory_caretakers.dormitory_id')
            ->selectRaw("dormitory_caretakers.dormitory_id, GROUP_CONCAT(CONCAT(employees.first_name, ' ', employees.last_name, ' (', dormitory_caretakers.role, ')') ORDER BY FIELD(dormitory_caretakers.role, 'patron', 'matron', 'assistant') SEPARATOR ', ') as names");

        $q = $this->table('dormitories')
            ->leftJoin('dormitory_rooms as rooms', 'rooms.dormitory_id', '=', 'dormitories.id')
            ->leftJoinSub($occupied, 'occ', 'occ.dormitory_room_id', '=', 'rooms.id')
            ->leftJoinSub($caretakers, 'care', 'care.dormitory_id', '=', 'dormitories.id')
            ->when($f['gender'], fn ($q, $v) => $q->where('dormitories.gender', $v));

        if ($perRoom) {
            $rows = $this->rows($q->whereNotNull('rooms.id')
                ->groupBy('dormitories.id', 'dormitories.name', 'dormitories.gender', 'rooms.id', 'rooms.name', 'rooms.capacity')
                ->orderBy('dormitories.name')->orderBy('rooms.name')
                ->get([
                    DB::raw("CONCAT(dormitories.name, ' · ', rooms.name) as name"), 'dormitories.gender',
                    DB::raw('1 as rooms'), DB::raw('rooms.capacity as capacity'),
                    DB::raw('COALESCE(SUM(occ.occupied), 0) as occupied'), DB::raw("'' as warden"),
                ]));
        } else {
            $rows = $this->rows($q->groupBy('dormitories.id', 'dormitories.name', 'dormitories.gender', 'dormitories.capacity', 'care.names')
                ->orderBy('dormitories.name')
                ->get([
                    'dormitories.name', 'dormitories.gender',
                    DB::raw('COUNT(rooms.id) as rooms'),
                    DB::raw('GREATEST(COALESCE(SUM(rooms.capacity), 0), dormitories.capacity) as capacity'),
                    DB::raw('COALESCE(SUM(occ.occupied), 0) as occupied'),
                    DB::raw("COALESCE(care.names, '') as warden"),
                ]));
        }

        foreach ($rows as &$r) {
            $r['rooms'] = (int) $r['rooms'];
            $r['capacity'] = (int) $r['capacity'];
            $r['occupied'] = (int) $r['occupied'];
            $r['vacant'] = max($r['capacity'] - $r['occupied'], 0);
            $r['rate'] = $this->pct($r['occupied'], $r['capacity']);
        }
        unset($r);

        $capacity = $this->count($rows, 'capacity');
        $occupiedTotal = $this->count($rows, 'occupied');
        $boarders = $this->table('students')->whereNull('deleted_at')->where('status', 'active')->where('residence_type', 'boarding')->count();
        $onLeave = $this->table('leave_passes')->where('status', 'out')->count();

        return [
            'columns' => [
                $this->col('name', $perRoom ? 'Dormitory · room' : 'Dormitory'),
                $this->col('gender', 'Type', 'badge'),
                ...($perRoom ? [] : [$this->col('rooms', 'Rooms', 'number')]),
                $this->col('capacity', 'Beds', 'number'),
                $this->col('occupied', 'Occupied', 'number'),
                $this->col('vacant', 'Vacant', 'number'),
                $this->col('rate', 'Occupancy', 'percent'),
                ...($perRoom ? [] : [$this->col('warden', 'Patron / matron')]),
            ],
            'rows' => $rows,
            'totals' => ['name' => 'Total', 'rooms' => $this->count($rows, 'rooms'), 'capacity' => $capacity, 'occupied' => $occupiedTotal, 'vacant' => $this->count($rows, 'vacant'), 'rate' => $this->pct($occupiedTotal, $capacity)],
            'summary' => [
                $this->stat('Occupancy', $this->pct($occupiedTotal, $capacity), 'percent', 'primary', 'bed'),
                $this->stat('Beds allocated', $occupiedTotal, 'number', 'success', 'check'),
                $this->stat('Vacant beds', $this->count($rows, 'vacant'), 'number', 'info', 'bed'),
                $this->stat('Boarders without bed', max($boarders - $occupiedTotal, 0), 'number', 'warning', 'alert-triangle'),
                $this->stat('Out on leave pass', $onLeave, 'number', 'secondary', 'log-out'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'stacked' => true,
                'categories' => array_column($rows, 'name'),
                'series' => [
                    ['name' => 'Occupied', 'data' => array_column($rows, 'occupied')],
                    ['name' => 'Vacant', 'data' => array_column($rows, 'vacant')],
                ],
            ] : null,
        ];
    }
}
