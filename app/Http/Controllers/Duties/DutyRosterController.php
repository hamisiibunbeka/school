<?php

namespace App\Http\Controllers\Duties;

use App\Http\Controllers\Controller;
use App\Models\BedAllocation;
use App\Models\Dormitory;
use App\Models\DutyAssignment;
use App\Models\DutyLog;
use App\Models\DutyType;
use App\Models\Employee;
use App\Models\Student;
use App\Models\Term;
use App\Services\Duties\DutyService;
use App\Support\Lookups;
use Carbon\CarbonInterface;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Duty roster shared by staff duties (HR) and student duties (Students):
 * duty types, assignments, rota generation and the daily done / missed check.
 */
abstract class DutyRosterController extends Controller
{
    public function __construct(protected DutyService $duties) {}

    /** 'staff' | 'student' */
    abstract protected function audience(): string;

    /** URL prefix, e.g. /hr/duties */
    abstract protected function basePath(): string;

    abstract protected function managePermission(): string;

    public function index(Request $request): Response
    {
        $audience = $this->audience();
        $week = $this->duties->week($audience, $this->parseDate($request->query('week')));
        $date = $this->parseDate($request->query('date'));
        $column = DutyService::personColumn($audience);
        $today = today();

        $types = DutyType::for($audience)->withCount(['assignments as current_count' => fn ($q) => $q->covering($today)])->orderBy('name')->get()
            ->map(fn (DutyType $t) => [
                ...$t->only(['id', 'name', 'code', 'description', 'location', 'rotation', 'people_needed', 'workload_periods', 'is_active']),
                'start_time' => $t->start_time ? substr($t->start_time, 0, 5) : null,
                'end_time' => $t->end_time ? substr($t->end_time, 0, 5) : null,
                'days' => array_map('intval', $t->days ?? []),
                'time' => $t->timeLabel(),
                'current_count' => (int) $t->current_count,
            ]);

        $scope = in_array($request->query('scope'), ['current', 'upcoming', 'ended', 'all'], true) ? $request->query('scope') : 'active';
        $assignments = DutyAssignment::with(['dutyType:id,name', 'employee:id,first_name,last_name,employee_no', 'student:id,first_name,last_name,admission_no'])
            ->whereNotNull($column)
            ->whereHas('dutyType', fn ($q) => $q->where('audience', $audience))
            ->withCount(['logs as done_count' => fn ($q) => $q->where('status', 'done'), 'logs as missed_count' => fn ($q) => $q->where('status', 'missed')])
            ->when($scope === 'active', fn ($q) => $q->whereDate('end_date', '>=', $today))
            ->when($scope === 'current', fn ($q) => $q->covering($today))
            ->when($scope === 'upcoming', fn ($q) => $q->whereDate('start_date', '>', $today))
            ->when($scope === 'ended', fn ($q) => $q->whereDate('end_date', '<', $today))
            ->orderBy('start_date')->limit(1000)->get()
            ->map(fn (DutyAssignment $a) => [
                'id' => $a->id,
                'duty_type_id' => $a->duty_type_id,
                'duty' => $a->dutyType?->name,
                'person_id' => $a->{$column},
                'person' => $a->personName(),
                'person_no' => $a->employee?->employee_no ?? $a->student?->admission_no,
                'start_date' => $a->start_date->toDateString(),
                'end_date' => $a->end_date->toDateString(),
                'role' => $a->role,
                'notes' => $a->notes,
                'status' => $a->status($today),
                'done' => (int) $a->done_count,
                'missed' => (int) $a->missed_count,
            ]);

        $missed = DutyLog::where('status', 'missed')->whereDate('date', '>=', $today->copy()->subDays(30))
            ->whereHas('assignment.dutyType', fn ($q) => $q->where('audience', $audience))->count();
        $term = Term::current();

        return Inertia::render('duties/index', [
            'audience' => $audience,
            'basePath' => $this->basePath(),
            'canManage' => $request->user()->can($this->managePermission()),
            'types' => $types,
            'week' => $week,
            'day' => ['date' => $date->toDateString(), 'duties' => $this->duties->day($audience, $date)],
            'assignments' => $assignments,
            'scope' => $scope,
            'people' => $this->people(),
            'filters' => $audience === 'student'
                ? ['classes' => Lookups::classes(), 'dormitories' => Dormitory::orderBy('name')->get(['id', 'name'])->map(fn ($d) => ['value' => $d->id, 'label' => $d->name])]
                : ['categories' => [['value' => 'teaching', 'label' => 'Teaching staff'], ['value' => 'non_teaching', 'label' => 'Support staff']]],
            'term' => $term ? ['name' => $term->name, 'start' => $term->start_date?->toDateString(), 'end' => $term->end_date?->toDateString()] : null,
            'stats' => [
                'types' => $types->where('is_active', true)->count(),
                'on_duty_today' => DutyAssignment::covering($today)->whereNotNull($column)->whereHas('dutyType', fn ($q) => $q->where('audience', $audience)->where('is_active', true))->distinct($column)->count($column),
                'shortfalls' => $week['shortfalls'],
                'missed_30' => $missed,
            ],
        ]);
    }

    public function storeType(Request $request): RedirectResponse
    {
        $type = DutyType::create(['audience' => $this->audience(), ...$this->validatedType($request)]);
        $this->audit('created', $type, "Duty type {$type->name} created", $this->module());
        $this->toast("{$type->name} added.");

        return back();
    }

    public function updateType(Request $request, DutyType $dutyType): RedirectResponse
    {
        $this->ensureAudience($dutyType);
        $data = $this->validatedType($request, $dutyType);
        $old = $dutyType->only(array_keys($data));
        $dutyType->update($data);
        $this->audit('updated', $dutyType, "Duty type {$dutyType->name} updated", $this->module(), $old, $dutyType->only(array_keys($data)));
        $this->toast('Duty updated.');

        return back();
    }

    public function destroyType(DutyType $dutyType): RedirectResponse
    {
        $this->ensureAudience($dutyType);
        if ($dutyType->assignments()->whereHas('logs')->exists()) {
            $this->toast("{$dutyType->name} has a duty record. Deactivate it instead of deleting.", 'error');

            return back();
        }

        $this->audit('deleted', $dutyType, "Duty type {$dutyType->name} deleted", $this->module());
        $dutyType->delete();
        $this->toast('Duty deleted.');

        return back();
    }

    public function assign(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'duty_type_id' => ['required', $this->typeRule()],
            'people' => ['required', 'array', 'min:1', 'max:500'],
            'people.*' => ['integer'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'role' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], [], ['duty_type_id' => 'duty', 'people' => 'people']);

        $type = DutyType::findOrFail($data['duty_type_id']);
        $created = $this->duties->assign($type, $data['people'], $data['start_date'], $data['end_date'], $data['role'] ?? null, $data['notes'] ?? null);
        $this->audit('created', $type, "Rostered {$created->count()} on {$type->name} ({$data['start_date']} – {$data['end_date']})", $this->module());
        $this->toast("{$created->count()} ".str($this->noun())->plural($created->count())." put on {$type->name}.");

        return back();
    }

    public function generate(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'duty_type_id' => ['required', $this->typeRule()],
            'pool' => ['required', 'array', 'min:1', 'max:500'],
            'pool.*' => ['integer'],
            'start_date' => ['required', 'date'],
            'periods' => ['required', 'integer', 'min:1', 'max:52'],
            'length_days' => ['required', 'integer', 'min:1', 'max:120'],
            'per_period' => ['required', 'integer', 'min:1', 'max:50'],
            'role' => ['nullable', 'string', 'max:60'],
        ], [], ['duty_type_id' => 'duty', 'pool' => 'people', 'per_period' => 'people per period', 'length_days' => 'period length']);

        $type = DutyType::findOrFail($data['duty_type_id']);
        $created = $this->duties->generate($type, $data['pool'], $data['start_date'], (int) $data['periods'], (int) $data['length_days'], (int) $data['per_period'], $data['role'] ?? null);
        $this->audit('created', $type, "Generated {$type->name} rota: {$created} assignments from {$data['start_date']}", $this->module());
        $this->toast("Rota generated: {$created} assignments on {$type->name}.");

        return back();
    }

    public function updateAssignment(Request $request, DutyAssignment $dutyAssignment): RedirectResponse
    {
        $this->ensureAudience($dutyAssignment->dutyType);
        $data = $request->validate([
            'person_id' => ['required', 'integer'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'role' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $old = $dutyAssignment->only(['employee_id', 'student_id', 'start_date', 'end_date', 'role']);
        $this->duties->update($dutyAssignment, (int) $data['person_id'], $data['start_date'], $data['end_date'], $data['role'] ?? null, $data['notes'] ?? null);
        $this->audit('updated', $dutyAssignment, "Changed {$dutyAssignment->dutyType->name} assignment", $this->module(), $old, $dutyAssignment->only(array_keys($old)));
        $this->toast('Assignment updated.');

        return back();
    }

    public function destroyAssignment(DutyAssignment $dutyAssignment): RedirectResponse
    {
        $this->ensureAudience($dutyAssignment->dutyType);
        $dutyAssignment->load(['dutyType', 'employee', 'student']);
        $this->audit('deleted', $dutyAssignment, "Removed {$dutyAssignment->personName()} from {$dutyAssignment->dutyType->name}", $this->module());
        $dutyAssignment->delete();
        $this->toast('Removed from the roster.');

        return back();
    }

    public function log(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'date' => ['required', 'date'],
            'status' => ['required', Rule::in(DutyLog::STATUSES)],
            'remarks' => ['nullable', 'string', 'max:255'],
        ]);

        $assignment = DutyAssignment::with('dutyType')->findOrFail($data['assignment_id']);
        $this->ensureAudience($assignment->dutyType);
        $this->duties->log($assignment, $data['date'], $data['status'], $data['remarks'] ?? null);

        return back();
    }

    /** People who can be put on duty, with what the picker filters on. */
    protected function people(): array
    {
        if ($this->audience() === 'staff') {
            return Employee::active()->orderBy('first_name')->get(['id', 'first_name', 'last_name', 'employee_no', 'designation', 'category', 'gender'])
                ->map(fn (Employee $e) => ['id' => $e->id, 'name' => $e->full_name, 'sub' => trim("{$e->employee_no} · {$e->designation}", ' ·'), 'category' => $e->category, 'gender' => $e->gender])
                ->all();
        }

        $dorms = BedAllocation::active()->join('dormitory_rooms', 'dormitory_rooms.id', '=', 'bed_allocations.dormitory_room_id')
            ->pluck('dormitory_rooms.dormitory_id', 'bed_allocations.student_id');

        return Student::active()->with(['schoolClass:id,name', 'stream:id,name'])->orderBy('first_name')->orderBy('last_name')
            ->get(['id', 'first_name', 'last_name', 'admission_no', 'school_class_id', 'stream_id', 'gender'])
            ->map(fn (Student $s) => [
                'id' => $s->id,
                'name' => $s->full_name,
                'sub' => trim("{$s->admission_no} · {$s->schoolClass?->name} {$s->stream?->name}"),
                'class_id' => $s->school_class_id,
                'stream_id' => $s->stream_id,
                'dormitory_id' => $dorms[$s->id] ?? null,
                'gender' => $s->gender,
            ])->all();
    }

    protected function module(): string
    {
        return $this->audience() === 'staff' ? 'hr' : 'students';
    }

    protected function noun(): string
    {
        return $this->audience() === 'staff' ? 'staff member' : 'student';
    }

    /** @return array<string, mixed> */
    private function validatedType(Request $request, ?DutyType $type = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('duty_types')->where('school_id', $this->tenancy()->schoolId())->where('audience', $this->audience())->ignore($type?->id)],
            'code' => ['nullable', 'string', 'max:20'],
            'description' => ['nullable', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:100'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'days' => ['nullable', 'array'],
            'days.*' => ['integer', 'between:1,7'],
            'rotation' => ['required', Rule::in(DutyType::ROTATIONS)],
            'people_needed' => ['required', 'integer', 'min:1', 'max:200'],
            'workload_periods' => ['nullable', 'integer', 'min:0', 'max:40'],
            'is_active' => ['boolean'],
        ], [], ['people_needed' => 'people needed', 'workload_periods' => 'workload periods']);

        $days = array_values(array_unique(array_map('intval', $data['days'] ?? [])));
        sort($days);
        $data['days'] = count($days) === 7 ? null : ($days ?: null);
        // Only staff duties add to a teacher's workload.
        $data['workload_periods'] = $this->audience() === 'staff' ? (int) ($data['workload_periods'] ?? 0) : 0;
        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        return $data;
    }

    private function typeRule(): Exists
    {
        return Rule::exists('duty_types', 'id')->where('school_id', $this->tenancy()->schoolId())->where('audience', $this->audience());
    }

    private function ensureAudience(?DutyType $type): void
    {
        abort_unless($type && $type->audience === $this->audience(), 404);
    }

    private function parseDate(mixed $value): CarbonInterface
    {
        try {
            return $value ? Carbon::parse((string) $value)->startOfDay() : today();
        } catch (\Throwable) {
            return today();
        }
    }
}
