<?php

namespace App\Http\Controllers\Transport;

use App\Http\Controllers\Controller;
use App\Models\RouteStop;
use App\Models\Student;
use App\Models\StudentTransport;
use App\Models\TransportRoute;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AssignmentController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'route' => '', 'status' => ''], $request->only(['search', 'route', 'status']));

        $assignments = StudentTransport::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id,photo_path', 'student.schoolClass:id,name', 'student.stream:id,name', 'route:id,name', 'stop:id,name,pickup_time,dropoff_time'])
            ->when($filters['route'], fn ($q, $r) => $q->where('transport_route_id', $r))
            ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
            ->when($filters['search'], fn ($q, $s) => $q->whereHas('student', fn ($st) => $st->search($s)))
            ->orderBy('status')
            ->orderBy('transport_route_id')
            ->orderByDesc('start_date')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (StudentTransport $a) => [
                'id' => $a->id,
                'student_id' => $a->student_id,
                'student' => $a->student?->full_name,
                'admission_no' => $a->student?->admission_no,
                'photo_url' => $a->student?->photo_url,
                'class' => trim(($a->student?->schoolClass?->name ?? '').' '.($a->student?->stream?->name ?? '')),
                'route_id' => $a->transport_route_id,
                'route' => $a->route?->name,
                'stop' => $a->stop?->name,
                'pickup_time' => $a->stop?->pickup_time ? substr($a->stop->pickup_time, 0, 5) : null,
                'start_date' => $a->start_date?->toDateString(),
                'end_date' => $a->end_date?->toDateString(),
                'status' => $a->status,
            ]);

        $routes = TransportRoute::with(['vehicle:id,capacity', 'stops'])->withCount('activeAssignments')->orderBy('name')->get();
        $assignedIds = StudentTransport::where('status', 'active')->pluck('student_id');

        return Inertia::render('transport/assignments', [
            'assignments' => $assignments,
            'filters' => $filters,
            'routes' => $routes->map(fn (TransportRoute $r) => [
                'value' => $r->id,
                'label' => "{$r->name} ({$r->active_assignments_count}/{$r->capacity()})",
                'name' => $r->name,
                'free' => max(0, $r->capacity() - $r->active_assignments_count),
                'capacity' => $r->capacity(),
                'assigned' => (int) $r->active_assignments_count,
                'stops' => $r->stops->map(fn ($s) => ['value' => $s->id, 'label' => $s->name.($s->pickup_time ? ' · '.substr($s->pickup_time, 0, 5) : '')])->values(),
            ]),
            'students' => Student::active()->where('residence_type', 'day')->whereNotIn('id', $assignedIds)
                ->orderBy('first_name')->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no'])
                ->map(fn ($s) => ['value' => $s->id, 'label' => "{$s->full_name} ({$s->admission_no})"]),
            'stats' => [
                'active' => $assignedIds->count(),
                'day_students' => Student::active()->where('residence_type', 'day')->count(),
                'seats' => $routes->sum(fn ($r) => $r->capacity()),
                'full_routes' => $routes->filter(fn ($r) => $r->capacity() > 0 && $r->active_assignments_count >= $r->capacity())->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $school = $this->tenancy()->schoolId();
        $data = $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $school)],
            'transport_route_id' => ['required', Rule::exists('transport_routes', 'id')->where('school_id', $school)],
            'route_stop_id' => ['required', Rule::exists('route_stops', 'id')->where('transport_route_id', $request->input('transport_route_id'))],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);

        $assignment = DB::transaction(function () use ($data) {
            $route = TransportRoute::with('vehicle')->whereKey($data['transport_route_id'])->lockForUpdate()->firstOrFail();
            $student = Student::findOrFail($data['student_id']);

            if (StudentTransport::where('student_id', $student->id)->where('status', 'active')->exists()) {
                throw ValidationException::withMessages(['student_id' => "{$student->full_name} is already assigned to a route. End that assignment first."]);
            }
            if (! $route->vehicle) {
                throw ValidationException::withMessages(['transport_route_id' => 'This route has no vehicle assigned, so it has no capacity.']);
            }
            $assigned = $route->activeAssignments()->count();
            if ($assigned >= $route->capacity()) {
                throw ValidationException::withMessages(['transport_route_id' => "{$route->name} is full ({$assigned}/{$route->capacity()} seats)."]);
            }

            return StudentTransport::create($data + ['status' => 'active']);
        });

        $assignment->load('student', 'route');
        $this->audit('assigned', $assignment, "{$assignment->student->full_name} assigned to route {$assignment->route->name}", 'transport');
        $this->toast('Student assigned to route.');

        return back();
    }

    public function end(Request $request, StudentTransport $assignment): RedirectResponse
    {
        $data = $request->validate(['end_date' => ['required', 'date', 'after_or_equal:'.$assignment->start_date->toDateString()], 'reason' => ['nullable', 'string', 'max:255']]);
        if ($assignment->status !== 'active') {
            $this->toast('This assignment has already ended.', 'error');

            return back();
        }

        $assignment->update(['status' => 'ended', 'end_date' => $data['end_date']]);
        $this->audit('ended', $assignment, "Transport ended for {$assignment->student?->full_name}".(! empty($data['reason']) ? ": {$data['reason']}" : ''), 'transport');
        $this->toast('Assignment ended.');

        return back();
    }

    public function destroy(StudentTransport $assignment): RedirectResponse
    {
        $this->audit('deleted', $assignment, "Transport assignment deleted for {$assignment->student?->full_name}", 'transport');
        $assignment->delete();
        $this->toast('Assignment deleted.');

        return back();
    }

    /** Printable route manifest: stops in order with the students picked up at each. */
    public function manifest(TransportRoute $transportRoute): Response
    {
        $transportRoute->load(['vehicle.driver', 'stops']);
        $assignments = $transportRoute->activeAssignments()
            ->with(['student.schoolClass:id,name', 'student.stream:id,name', 'student.guardians:id,first_name,last_name,phone'])
            ->get();

        $row = function (StudentTransport $a) {
            $g = $a->student?->guardians->firstWhere('pivot.is_primary', true) ?? $a->student?->guardians->first();

            return [
                'id' => $a->id,
                'student' => $a->student?->full_name,
                'admission_no' => $a->student?->admission_no,
                'class' => trim(($a->student?->schoolClass?->name ?? '').' '.($a->student?->stream?->name ?? '')),
                'guardian' => $g?->full_name,
                'guardian_phone' => $g?->phone,
            ];
        };

        $stops = $transportRoute->stops->map(fn (RouteStop $s) => [
            'id' => $s->id,
            'name' => $s->name,
            'sequence' => $s->sequence,
            'pickup_time' => $s->pickup_time ? substr($s->pickup_time, 0, 5) : null,
            'dropoff_time' => $s->dropoff_time ? substr($s->dropoff_time, 0, 5) : null,
            'students' => $assignments->where('route_stop_id', $s->id)->sortBy('student.first_name')->map($row)->values(),
        ]);

        $unassignedStop = $assignments->whereNull('route_stop_id')->map($row)->values();

        $this->audit('printed', $transportRoute, "Route manifest viewed for {$transportRoute->name}", 'transport');

        return Inertia::render('transport/manifest', [
            'route' => [
                'id' => $transportRoute->id,
                'name' => $transportRoute->name,
                'description' => $transportRoute->description,
                'vehicle' => $transportRoute->vehicle ? trim("{$transportRoute->vehicle->registration_no} · {$transportRoute->vehicle->make} {$transportRoute->vehicle->model}") : null,
                'driver' => $transportRoute->vehicle?->driver?->full_name,
                'driver_phone' => $transportRoute->vehicle?->driver?->phone,
                'capacity' => $transportRoute->capacity(),
                'assigned' => $assignments->count(),
            ],
            'stops' => $stops->values(),
            'noStop' => $unassignedStop,
            'printedAt' => now()->toDateTimeString(),
        ]);
    }
}
