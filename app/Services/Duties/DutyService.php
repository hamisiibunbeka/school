<?php

namespace App\Services\Duties;

use App\Models\DutyAssignment;
use App\Models\DutyLog;
use App\Models\DutyType;
use App\Models\Employee;
use App\Models\Student;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Duty rosters for staff (Teacher on Duty, Prep, Games …) and students (dining hall, cleaning …).
 *
 * A duty type says when the duty runs (weekdays, times) and how many people each period needs;
 * an assignment puts one person on it for a date range; a log records done / missed per day.
 */
class DutyService
{
    /** Column holding the person for an audience. */
    public static function personColumn(string $audience): string
    {
        return $audience === 'staff' ? 'employee_id' : 'student_id';
    }

    /**
     * Put several people on a duty for the same dates.
     *
     * @param  array<int, int>  $personIds
     * @return Collection<int, DutyAssignment>
     */
    public function assign(DutyType $type, array $personIds, string $start, string $end, ?string $role = null, ?string $notes = null, string $field = 'people'): Collection
    {
        $personIds = array_values(array_unique(array_map('intval', $personIds)));
        $this->ensurePeople($type->audience, $personIds, $field);
        $this->ensureNoOverlap($type, $personIds, $start, $end, null, $field);

        return DB::transaction(fn () => collect($personIds)->map(fn (int $id) => DutyAssignment::create([
            'duty_type_id' => $type->id,
            self::personColumn($type->audience) => $id,
            'start_date' => $start,
            'end_date' => $end,
            'role' => $role,
            'notes' => $notes,
            'assigned_by' => auth()->id(),
        ])));
    }

    /** Change dates / person / role of one assignment. */
    public function update(DutyAssignment $assignment, int $personId, string $start, string $end, ?string $role, ?string $notes): DutyAssignment
    {
        $type = $assignment->dutyType;
        $this->ensurePeople($type->audience, [$personId], 'person_id');
        $this->ensureNoOverlap($type, [$personId], $start, $end, $assignment->id, 'person_id');

        $assignment->update([self::personColumn($type->audience) => $personId, 'start_date' => $start, 'end_date' => $end, 'role' => $role, 'notes' => $notes]);
        // Logs outside the new range no longer belong to this assignment.
        $assignment->logs()->where(fn ($q) => $q->whereDate('date', '<', $start)->orWhereDate('date', '>', $end))->delete();

        return $assignment;
    }

    /**
     * Rotation plan: walk the pool round-robin, `perPeriod` people for each period of `lengthDays`,
     * skipping anyone already on this duty during that period. People already rostered count
     * towards the period, so a period that is already covered gets nobody new.
     *
     * @param  array<int, int>  $pool
     * @return array<int, array{start:string, end:string, people:array<int,int>}>
     */
    public function plan(DutyType $type, array $pool, string $start, int $periods, int $lengthDays, int $perPeriod): array
    {
        $pool = array_values(array_unique(array_map('intval', $pool)));
        if (count($pool) < $perPeriod) {
            throw ValidationException::withMessages(['pool' => "Pick at least {$perPeriod} people for the rotation."]);
        }

        $column = self::personColumn($type->audience);
        $plan = [];
        $cursor = 0;
        $from = Carbon::parse($start);
        for ($p = 0; $p < $periods; $p++) {
            $to = $from->copy()->addDays($lengthDays - 1);
            $busy = DutyAssignment::where('duty_type_id', $type->id)->overlapping($from, $to)->pluck($column)->map(fn ($v) => (int) $v)->unique()->values()->all();
            $needed = max(0, $perPeriod - count($busy));
            $people = [];
            for ($tries = 0; $tries < count($pool) && count($people) < $needed; $tries++) {
                $candidate = $pool[$cursor % count($pool)];
                $cursor++;
                if (! in_array($candidate, $busy, true)) {
                    $people[] = $candidate;
                }
            }
            $plan[] = ['start' => $from->toDateString(), 'end' => $to->toDateString(), 'people' => $people];
            $from = $to->copy()->addDay();
        }

        return $plan;
    }

    /** Create every assignment of a rotation plan; returns how many were created. */
    public function generate(DutyType $type, array $pool, string $start, int $periods, int $lengthDays, int $perPeriod, ?string $role = null): int
    {
        $this->ensurePeople($type->audience, $pool, 'pool');
        $plan = $this->plan($type, $pool, $start, $periods, $lengthDays, $perPeriod);

        return DB::transaction(function () use ($type, $plan, $role) {
            $created = 0;
            foreach ($plan as $period) {
                if ($period['people'] === []) {
                    continue; // everyone in the pool is already on this duty then
                }
                $created += $this->assign($type, $period['people'], $period['start'], $period['end'], $role)->count();
            }

            return $created;
        });
    }

    /** Record (or change) whether the person did the duty on a date. */
    public function log(DutyAssignment $assignment, string $date, string $status, ?string $remarks): DutyLog
    {
        $day = Carbon::parse($date);
        if ($day->lt($assignment->start_date) || $day->gt($assignment->end_date)) {
            throw ValidationException::withMessages(['date' => 'That date is outside this person\'s duty period.']);
        }
        if ($day->isFuture() && ! $day->isToday()) {
            throw ValidationException::withMessages(['date' => 'You cannot record a duty for a future date.']);
        }

        return DutyLog::updateOrCreate(
            ['duty_assignment_id' => $assignment->id, 'date' => $day->toDateString()],
            ['status' => $status, 'remarks' => $remarks, 'recorded_by' => auth()->id()],
        );
    }

    /**
     * Week grid: for each duty type, the people on duty each day.
     *
     * @return array{start:string, end:string, days:array<int,string>, rows:array<int,array<string,mixed>>, shortfalls:int}
     */
    public function week(string $audience, CarbonInterface $weekStart): array
    {
        $start = $weekStart->copy()->startOfWeek(Carbon::MONDAY);
        $end = $start->copy()->addDays(6);
        $days = collect(range(0, 6))->map(fn ($i) => $start->copy()->addDays($i));
        $types = DutyType::for($audience)->active()->orderBy('name')->get();
        $assignments = DutyAssignment::with(['employee:id,first_name,last_name', 'student:id,first_name,last_name'])
            ->whereIn('duty_type_id', $types->pluck('id'))->overlapping($start, $end)->get()->groupBy('duty_type_id');

        $shortfalls = 0;
        $rows = $types->map(function (DutyType $t) use ($days, $assignments, &$shortfalls) {
            $mine = $assignments->get($t->id, collect());
            $cells = $days->map(function (CarbonInterface $d) use ($t, $mine, &$shortfalls) {
                if (! $t->runsOn($d)) {
                    return null; // duty does not run that day
                }
                $people = $mine->filter(fn (DutyAssignment $a) => $a->start_date->lte($d) && $a->end_date->gte($d))
                    ->map(fn (DutyAssignment $a) => ['id' => $a->id, 'name' => $a->personName(), 'role' => $a->role])->values();
                if ($people->count() < $t->people_needed) {
                    $shortfalls++;
                }

                return $people;
            })->values();

            return ['id' => $t->id, 'name' => $t->name, 'code' => $t->code, 'time' => $t->timeLabel(), 'location' => $t->location, 'needed' => $t->people_needed, 'cells' => $cells];
        })->values()->all();

        return ['start' => $start->toDateString(), 'end' => $end->toDateString(), 'days' => $days->map->toDateString()->all(), 'rows' => $rows, 'shortfalls' => $shortfalls];
    }

    /**
     * Everyone on duty on a date (for the done / missed check), grouped by duty.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function day(string $audience, CarbonInterface $date): Collection
    {
        $types = DutyType::for($audience)->active()->orderBy('name')->get()->filter(fn (DutyType $t) => $t->runsOn($date));
        $assignments = DutyAssignment::with(['employee:id,first_name,last_name,phone', 'student:id,first_name,last_name,admission_no', 'logs' => fn ($q) => $q->whereDate('date', $date)])
            ->whereIn('duty_type_id', $types->pluck('id'))->covering($date)->get()->groupBy('duty_type_id');

        return $types->map(fn (DutyType $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'time' => $t->timeLabel(),
            'location' => $t->location,
            'needed' => $t->people_needed,
            'people' => $assignments->get($t->id, collect())->map(fn (DutyAssignment $a) => [
                'assignment_id' => $a->id,
                'name' => $a->personName(),
                'sub' => $a->employee?->phone ?? $a->student?->admission_no,
                'role' => $a->role,
                'status' => $a->logs->first()?->status,
                'remarks' => $a->logs->first()?->remarks,
            ])->values(),
        ])->values();
    }

    /**
     * Rostered workload periods per employee for duties running now (staff duty types with workload periods).
     *
     * @return array<int, array{periods:int, names:array<int,string>}>
     */
    public function workloadByEmployee(?CarbonInterface $date = null): array
    {
        $date ??= today();
        $out = [];
        DutyAssignment::with('dutyType:id,name,workload_periods,is_active')->whereNotNull('employee_id')->covering($date)
            ->whereHas('dutyType', fn ($q) => $q->where('audience', 'staff')->where('workload_periods', '>', 0)->where('is_active', true))
            ->get()
            ->each(function (DutyAssignment $a) use (&$out) {
                $out[$a->employee_id] ??= ['periods' => 0, 'names' => []];
                $out[$a->employee_id]['periods'] += $a->dutyType->workload_periods;
                $out[$a->employee_id]['names'][] = $a->dutyType->name;
            });

        return $out;
    }

    /**
     * Duties of one person for their profile: current / upcoming first, with done / missed counts.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function forPerson(Employee|Student $person, int $limit = 30): Collection
    {
        $today = today();

        return $person->dutyAssignments()->with('dutyType:id,name,code,location,start_time,end_time,days')
            ->withCount(['logs as done_count' => fn ($q) => $q->where('status', 'done'), 'logs as missed_count' => fn ($q) => $q->where('status', 'missed')])
            ->orderByRaw('end_date < ? asc', [$today->toDateString()])->orderBy('start_date')
            ->limit($limit)->get()
            ->map(fn (DutyAssignment $a) => [
                'id' => $a->id,
                'duty' => $a->dutyType?->name,
                'time' => $a->dutyType?->timeLabel(),
                'location' => $a->dutyType?->location,
                'days' => $a->dutyType?->days,
                'start_date' => $a->start_date->toDateString(),
                'end_date' => $a->end_date->toDateString(),
                'role' => $a->role,
                'status' => $a->status($today),
                'done' => (int) $a->done_count,
                'missed' => (int) $a->missed_count,
            ]);
    }

    /** @param  array<int, int>  $ids */
    private function ensurePeople(string $audience, array $ids, string $field): void
    {
        if ($ids === []) {
            throw ValidationException::withMessages([$field => 'Choose at least one person.']);
        }
        $model = $audience === 'staff' ? Employee::query() : Student::query();
        $found = $model->whereIn('id', $ids)->where('status', 'active')->count();
        if ($found !== count(array_unique($ids))) {
            throw ValidationException::withMessages([$field => $audience === 'staff' ? 'Only active staff can be put on duty.' : 'Only active students can be put on duty.']);
        }
    }

    /** @param  array<int, int>  $ids */
    private function ensureNoOverlap(DutyType $type, array $ids, string $start, string $end, ?int $exceptId, string $field): void
    {
        if (Carbon::parse($end)->lt(Carbon::parse($start))) {
            throw ValidationException::withMessages(['end_date' => 'The end date must be on or after the start date.']);
        }

        $column = self::personColumn($type->audience);
        $clash = DutyAssignment::with(['employee:id,first_name,last_name', 'student:id,first_name,last_name'])
            ->where('duty_type_id', $type->id)->whereIn($column, $ids)->overlapping($start, $end)
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))->get();

        if ($clash->isNotEmpty()) {
            $names = $clash->map(fn (DutyAssignment $a) => $a->personName().' ('.$a->start_date->format('d M').'–'.$a->end_date->format('d M').')')->unique()->implode(', ');
            throw ValidationException::withMessages([$field => "Already on {$type->name} during those dates: {$names}."]);
        }
    }
}
