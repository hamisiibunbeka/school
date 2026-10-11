<?php

namespace App\Http\Controllers\Transport;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use App\Models\VehicleLog;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class VehicleLogController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'vehicle' => '', 'type' => '', 'from' => '', 'to' => ''], $request->only(['search', 'vehicle', 'type', 'from', 'to']));
        $school = $this->tenancy()->schoolId();

        $query = VehicleLog::query()
            ->when($filters['vehicle'], fn ($q, $v) => $q->where('vehicle_id', $v))
            ->when($filters['type'], fn ($q, $t) => $q->where('type', $t))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('date', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('date', '<=', $d))
            ->when($filters['search'], fn ($q, $s) => $q->where('description', 'like', "%{$s}%"));

        $logs = (clone $query)
            ->with(['vehicle:id,registration_no', 'recorder:id,name'])
            ->orderByDesc('date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (VehicleLog $l) => [
                'id' => $l->id,
                'vehicle_id' => $l->vehicle_id,
                'vehicle' => $l->vehicle?->registration_no,
                'type' => $l->type,
                'date' => $l->date?->toDateString(),
                'amount' => (string) $l->amount,
                'litres' => $l->litres !== null ? (string) $l->litres : null,
                'odometer' => $l->odometer,
                'description' => $l->description,
                'recorded_by' => $l->recorder?->name,
            ]);

        // Cost per vehicle (respecting filters) split by type.
        $perVehicle = DB::table('vehicle_logs')
            ->join('vehicles', 'vehicles.id', '=', 'vehicle_logs.vehicle_id')
            ->where('vehicle_logs.school_id', $school)
            ->when($filters['vehicle'], fn ($q, $v) => $q->where('vehicle_logs.vehicle_id', $v))
            ->when($filters['type'], fn ($q, $t) => $q->where('vehicle_logs.type', $t))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('vehicle_logs.date', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('vehicle_logs.date', '<=', $d))
            ->groupBy('vehicles.id', 'vehicles.registration_no')
            ->selectRaw('vehicles.id, vehicles.registration_no as vehicle')
            ->selectRaw("SUM(CASE WHEN vehicle_logs.type = 'fuel' THEN vehicle_logs.amount ELSE 0 END) as fuel")
            ->selectRaw("SUM(CASE WHEN vehicle_logs.type IN ('maintenance','repair','inspection') THEN vehicle_logs.amount ELSE 0 END) as maintenance")
            ->selectRaw("SUM(CASE WHEN vehicle_logs.type NOT IN ('fuel','maintenance','repair','inspection') THEN vehicle_logs.amount ELSE 0 END) as other")
            ->selectRaw('SUM(vehicle_logs.amount) as total, SUM(COALESCE(vehicle_logs.litres,0)) as litres, MAX(vehicle_logs.odometer) - MIN(vehicle_logs.odometer) as distance')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'vehicle' => $r->vehicle,
                'fuel' => (string) $r->fuel,
                'maintenance' => (string) $r->maintenance,
                'other' => (string) $r->other,
                'total' => (string) $r->total,
                'litres' => (string) $r->litres,
                'distance' => $r->distance !== null ? (int) $r->distance : null,
            ]);

        // Monthly cost trend (last 6 months) by vehicle.
        $start = now()->startOfMonth()->subMonths(5);
        $months = collect(range(0, 5))->map(fn ($i) => $start->addMonths($i)->format('Y-m'));
        $monthly = DB::table('vehicle_logs')
            ->join('vehicles', 'vehicles.id', '=', 'vehicle_logs.vehicle_id')
            ->where('vehicle_logs.school_id', $school)
            ->where('vehicle_logs.date', '>=', $start->toDateString())
            ->groupBy('vehicles.registration_no', DB::raw("DATE_FORMAT(vehicle_logs.date, '%Y-%m')"))
            ->selectRaw("vehicles.registration_no as vehicle, DATE_FORMAT(vehicle_logs.date, '%Y-%m') as month, SUM(vehicle_logs.amount) as total")
            ->get();

        $series = $monthly->groupBy('vehicle')->map(fn ($rows, $vehicle) => [
            'name' => $vehicle,
            'data' => $months->map(fn ($m) => (float) ($rows->firstWhere('month', $m)->total ?? 0))->values(),
        ])->values();

        return Inertia::render('transport/logs', [
            'logs' => $logs,
            'filters' => $filters,
            'vehicles' => Vehicle::orderBy('registration_no')->get(['id', 'registration_no', 'make', 'model'])
                ->map(fn ($v) => ['value' => $v->id, 'label' => trim("{$v->registration_no} · {$v->make} {$v->model}")]),
            'types' => array_map(fn ($t) => ['value' => $t, 'label' => ucfirst($t)], VehicleLog::TYPES),
            'perVehicle' => $perVehicle,
            'chart' => ['months' => $months->map(fn ($m) => now()->parse($m.'-01')->format('M Y'))->values(), 'series' => $series],
            'stats' => [
                'total' => (string) (clone $query)->sum('amount'),
                'fuel' => (string) (clone $query)->where('type', 'fuel')->sum('amount'),
                'litres' => (string) (clone $query)->where('type', 'fuel')->sum('litres'),
                'maintenance' => (string) (clone $query)->whereIn('type', ['maintenance', 'repair', 'inspection'])->sum('amount'),
                'incidents' => (clone $query)->where('type', 'incident')->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $log = VehicleLog::create($this->validated($request) + ['recorded_by' => auth()->id()]);
        $this->audit('created', $log, ucfirst($log->type)." log recorded for {$log->vehicle?->registration_no}", 'transport');
        $this->toast('Log recorded.');

        return back();
    }

    public function update(Request $request, VehicleLog $log): RedirectResponse
    {
        $data = $this->validated($request);
        $old = $log->only(array_keys($data));
        $log->update($data);
        $this->audit('updated', $log, "Vehicle log #{$log->id} updated", 'transport', $old, $data);
        $this->toast('Log updated.');

        return back();
    }

    public function destroy(VehicleLog $log): RedirectResponse
    {
        $this->audit('deleted', $log, "Vehicle log #{$log->id} ({$log->type}) deleted", 'transport');
        $log->delete();
        $this->toast('Log deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'vehicle_id' => ['required', Rule::exists('vehicles', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'type' => ['required', Rule::in(VehicleLog::TYPES)],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'amount' => ['required', 'numeric', 'min:0', 'max:1000000000'],
            'litres' => ['nullable', 'numeric', 'min:0', 'max:10000', 'required_if:type,fuel'],
            'odometer' => ['nullable', 'integer', 'min:0'],
            'description' => ['nullable', 'string', 'max:255'],
        ], ['litres.required_if' => 'Enter litres for a fuel entry.']);
    }
}
