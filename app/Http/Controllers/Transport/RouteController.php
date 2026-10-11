<?php

namespace App\Http\Controllers\Transport;

use App\Http\Controllers\Controller;
use App\Models\RouteStop;
use App\Models\TransportRoute;
use App\Models\Vehicle;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class RouteController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->string('search')->toString();

        $routes = TransportRoute::query()
            ->with(['vehicle.driver:id,first_name,last_name,phone', 'stops' => fn ($q) => $q->withCount(['assignments' => fn ($a) => $a->where('status', 'active')])])
            ->withCount('activeAssignments')
            ->when($search, fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhereHas('stops', fn ($s) => $s->where('name', 'like', "%{$search}%"))))
            ->orderBy('name')
            ->get()
            ->map(fn (TransportRoute $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'description' => $r->description,
                'fare' => (string) $r->fare,
                'vehicle_id' => $r->vehicle_id,
                'vehicle' => $r->vehicle ? trim("{$r->vehicle->registration_no} · {$r->vehicle->make} {$r->vehicle->model}") : null,
                'vehicle_status' => $r->vehicle?->status,
                'driver' => $r->vehicle?->driver?->full_name,
                'driver_phone' => $r->vehicle?->driver?->phone,
                'capacity' => $r->capacity(),
                'assigned' => (int) $r->active_assignments_count,
                'stops' => $r->stops->map(fn (RouteStop $s) => [
                    'id' => $s->id,
                    'name' => $s->name,
                    'pickup_time' => $s->pickup_time ? substr($s->pickup_time, 0, 5) : '',
                    'dropoff_time' => $s->dropoff_time ? substr($s->dropoff_time, 0, 5) : '',
                    'sequence' => $s->sequence,
                    'riders' => (int) ($s->assignments_count ?? 0),
                ])->values(),
            ]);

        return Inertia::render('transport/routes', [
            'routes' => $routes,
            'filters' => ['search' => $search],
            'vehicles' => Vehicle::where('status', '!=', 'retired')->orderBy('registration_no')->get()
                ->map(fn ($v) => ['value' => $v->id, 'label' => "{$v->registration_no} · {$v->make} {$v->model} ({$v->capacity} seats)"]),
            'stats' => [
                'routes' => $routes->count(),
                'stops' => $routes->sum(fn ($r) => count($r['stops'])),
                'riders' => $routes->sum('assigned'),
                'seats' => $routes->sum('capacity'),
                'revenue' => (string) $routes->reduce(fn ($c, $r) => bcadd($c, bcmul($r['fare'], (string) $r['assigned'], 2), 2), '0'),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $route = DB::transaction(function () use ($data) {
            $route = TransportRoute::create(collect($data)->except('stops')->all());
            $this->syncStops($route, $data['stops'] ?? []);

            return $route;
        });

        $this->audit('created', $route, "Transport route {$route->name} created", 'transport');
        $this->toast('Route created.');

        return back();
    }

    public function update(Request $request, TransportRoute $transportRoute): RedirectResponse
    {
        $data = $this->validated($request, $transportRoute);

        if (! empty($data['vehicle_id'])) {
            $capacity = (int) Vehicle::find($data['vehicle_id'])?->capacity;
            $assigned = $transportRoute->activeAssignments()->count();
            if ($capacity < $assigned) {
                return back()->withErrors(['vehicle_id' => "This vehicle seats {$capacity} but {$assigned} students are assigned to the route."]);
            }
        }

        DB::transaction(function () use ($transportRoute, $data) {
            $transportRoute->update(collect($data)->except('stops')->all());
            $this->syncStops($transportRoute, $data['stops'] ?? []);
        });

        $this->audit('updated', $transportRoute, "Transport route {$transportRoute->name} updated", 'transport');
        $this->toast('Route updated.');

        return back();
    }

    public function destroy(TransportRoute $transportRoute): RedirectResponse
    {
        if ($transportRoute->activeAssignments()->exists()) {
            $this->toast('Students are still assigned to this route. End their assignments first.', 'error');

            return back();
        }

        $this->audit('deleted', $transportRoute, "Transport route {$transportRoute->name} deleted", 'transport');
        $transportRoute->delete();
        $this->toast('Route deleted.');

        return back();
    }

    /**
     * Upsert stops in the given order; stops removed from the list are deleted
     * (assignments pointing at them keep the route but lose the stop).
     *
     * @param  array<int, array<string, mixed>>  $stops
     */
    private function syncStops(TransportRoute $route, array $stops): void
    {
        $keep = [];
        foreach (array_values($stops) as $i => $stop) {
            $attrs = [
                'name' => $stop['name'],
                'pickup_time' => $stop['pickup_time'] ?: null,
                'dropoff_time' => $stop['dropoff_time'] ?: null,
                'sequence' => $i + 1,
            ];
            $existing = ! empty($stop['id']) ? $route->stops()->whereKey($stop['id'])->first() : null;
            if ($existing) {
                $existing->update($attrs);
                $keep[] = $existing->id;
            } else {
                $keep[] = $route->stops()->create($attrs)->id;
            }
        }
        $route->stops()->whereNotIn('id', $keep)->delete();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?TransportRoute $route = null): array
    {
        $school = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('transport_routes', 'name')->where('school_id', $school)->ignore($route?->id)],
            'vehicle_id' => ['nullable', Rule::exists('vehicles', 'id')->where('school_id', $school)],
            'fare' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'description' => ['nullable', 'string', 'max:255'],
            'stops' => ['array', 'max:40'],
            'stops.*.id' => ['nullable', 'integer'],
            'stops.*.name' => ['required', 'string', 'max:100'],
            'stops.*.pickup_time' => ['nullable', 'date_format:H:i'],
            'stops.*.dropoff_time' => ['nullable', 'date_format:H:i'],
        ], ['stops.*.name.required' => 'Every stop needs a name.']);
    }
}
