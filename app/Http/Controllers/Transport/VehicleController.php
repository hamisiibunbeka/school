<?php

namespace App\Http\Controllers\Transport;

use App\Http\Controllers\Controller;
use App\Models\StudentTransport;
use App\Models\Vehicle;
use App\Models\VehicleLog;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class VehicleController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'compliance' => ''], $request->only(['search', 'status', 'compliance']));

        $vehicles = Vehicle::query()
            ->with(['driver:id,first_name,last_name,phone', 'routes:id,name,vehicle_id'])
            ->withSum(['logs as cost_ytd' => fn ($q) => $q->where('date', '>=', now()->startOfYear()->toDateString())], 'amount')
            ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('registration_no', 'like', "%{$s}%")->orWhere('make', 'like', "%{$s}%")->orWhere('model', 'like', "%{$s}%")))
            ->orderBy('registration_no')
            ->get()
            ->map(function (Vehicle $v) {
                $assigned = StudentTransport::where('status', 'active')->whereIn('transport_route_id', $v->routes->pluck('id'))->count();

                return [
                    'id' => $v->id,
                    'registration_no' => $v->registration_no,
                    'make' => $v->make,
                    'model' => $v->model,
                    'capacity' => (int) $v->capacity,
                    'driver_id' => $v->driver_id,
                    'driver' => $v->driver?->full_name,
                    'driver_phone' => $v->driver?->phone,
                    'insurance_expiry' => $v->insurance_expiry?->toDateString(),
                    'inspection_expiry' => $v->inspection_expiry?->toDateString(),
                    'next_service_date' => $v->next_service_date?->toDateString(),
                    'status' => $v->status,
                    'compliance' => $v->compliance(),
                    'has_issue' => $v->hasComplianceIssue(),
                    'routes' => $v->routes->pluck('name')->all(),
                    'assigned' => $assigned,
                    'cost_ytd' => (string) ($v->cost_ytd ?? '0'),
                ];
            })
            ->when($filters['compliance'] === 'due', fn ($c) => $c->filter(fn ($v) => $v['has_issue']))
            ->values();

        $all = Vehicle::all();

        return Inertia::render('transport/vehicles', [
            'vehicles' => $vehicles,
            'filters' => $filters,
            'drivers' => Lookups::employees('non_teaching'),
            'statuses' => Lookups::enum(Vehicle::STATUSES),
            'stats' => [
                'total' => $all->count(),
                'active' => $all->where('status', 'active')->count(),
                'seats' => (int) $all->where('status', 'active')->sum('capacity'),
                'riders' => StudentTransport::where('status', 'active')->count(),
                'issues' => $all->filter(fn ($v) => $v->status !== 'retired' && $v->hasComplianceIssue())->count(),
                'expired' => $all->filter(fn ($v) => $v->status !== 'retired' && in_array('expired', $v->compliance(), true))->count(),
                'cost_month' => (string) VehicleLog::where('date', '>=', now()->startOfMonth()->toDateString())->sum('amount'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $vehicle = Vehicle::create($this->validated($request));
        $this->audit('created', $vehicle, "Vehicle {$vehicle->registration_no} added", 'transport');
        $this->toast('Vehicle added.');

        return back();
    }

    public function update(Request $request, Vehicle $vehicle): RedirectResponse
    {
        $data = $this->validated($request, $vehicle);
        $old = $vehicle->only(array_keys($data));
        $vehicle->update($data);
        $this->audit('updated', $vehicle, "Vehicle {$vehicle->registration_no} updated", 'transport', $old, $data);
        $this->toast('Vehicle updated.');

        return back();
    }

    public function destroy(Vehicle $vehicle): RedirectResponse
    {
        if ($vehicle->routes()->exists()) {
            $this->toast('This vehicle serves a route. Reassign the route or mark the vehicle retired instead.', 'error');

            return back();
        }

        $this->audit('deleted', $vehicle, "Vehicle {$vehicle->registration_no} deleted", 'transport');
        $vehicle->delete();
        $this->toast('Vehicle deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Vehicle $vehicle = null): array
    {
        $school = $this->tenancy()->schoolId();

        return $request->validate([
            'registration_no' => ['required', 'string', 'max:20', Rule::unique('vehicles', 'registration_no')->where('school_id', $school)->ignore($vehicle?->id)],
            'make' => ['nullable', 'string', 'max:60'],
            'model' => ['nullable', 'string', 'max:60'],
            'capacity' => ['required', 'integer', 'min:1', 'max:120'],
            'driver_id' => ['nullable', Rule::exists('employees', 'id')->where('school_id', $school)],
            'insurance_expiry' => ['nullable', 'date'],
            'inspection_expiry' => ['nullable', 'date'],
            'next_service_date' => ['nullable', 'date'],
            'status' => ['required', Rule::in(Vehicle::STATUSES)],
        ]);
    }
}
