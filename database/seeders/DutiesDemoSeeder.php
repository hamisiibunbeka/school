<?php

namespace Database\Seeders;

use App\Models\DutyAssignment;
use App\Models\DutyLog;
use App\Models\DutyType;
use App\Models\Employee;
use App\Models\Stream;
use App\Models\Student;
use App\Services\Duties\DutyService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * Duty rosters for the demo school: Teacher on Duty, Prep and Games for staff;
 * dining hall, classroom cleaning, compound and flag duty for students. Rotas run
 * from three weeks ago to four weeks ahead, with done / missed records for past days.
 * Also gives a class teacher to any stream still without one.
 */
class DutiesDemoSeeder extends Seeder
{
    private const STAFF = [
        ['Teacher on Duty', 'TOD', 'weekly', 2, null, null, null, 'Whole school', 0, 'Supervises the school day: morning parade, punctuality, meals, discipline and the TOD report.'],
        ['Prep Supervision', 'PREP', 'weekly', 2, '19:30', '21:30', [1, 2, 3, 4, 5], 'Classrooms', 3, 'Evening preparation for boarders, Monday to Friday.'],
        ['Games & Sports', 'GAMES', 'weekly', 1, '16:00', '17:30', [2, 4], 'Sports ground', 0, 'Afternoon games on Tuesday and Thursday.'],
        ['Weekend Duty', 'WKD', 'weekly', 1, '08:00', '17:00', [6, 7], 'Boarding area', 0, 'Supervises boarders over the weekend.'],
    ];

    private const STUDENT = [
        ['Dining Hall', 'DH', 'weekly', 6, '12:30', '13:30', [1, 2, 3, 4, 5], 'Dining hall', 'Serve, clear tables and sweep after lunch.'],
        ['Classroom Cleaning', 'CLN', 'weekly', 4, '16:00', '16:30', [1, 2, 3, 4, 5], 'Classrooms', 'Sweep and arrange desks after classes.'],
        ['Compound Cleaning', 'CMP', 'weekly', 8, '07:00', '07:40', [6], 'School compound', 'Saturday morning general cleaning.'],
        ['Flag Duty', 'FLAG', 'weekly', 2, '07:15', '07:30', [1, 5], 'Assembly ground', 'Raise and lower the national flag on assembly days.'],
    ];

    public function run(): void
    {
        if (DutyType::exists()) {
            return; // already seeded
        }
        mt_srand(2028);
        $duties = app(DutyService::class);
        $start = CarbonImmutable::today()->startOfWeek()->subWeeks(3);

        // A class teacher for any stream still without one (e.g. A-Level combination streams).
        $teachers = Employee::teachers()->active()->orderBy('id')->pluck('id');
        foreach (Stream::whereNull('class_teacher_id')->orderBy('id')->get() as $i => $stream) {
            $stream->update(['class_teacher_id' => $teachers[($i * 5 + 2) % max(1, $teachers->count())] ?? null]);
        }

        $staffPool = Employee::teachers()->active()->orderBy('first_name')->pluck('id')->all();
        foreach (self::STAFF as [$name, $code, $rotation, $needed, $from, $to, $days, $location, $periods, $description]) {
            $type = DutyType::create([
                'audience' => 'staff', 'name' => $name, 'code' => $code, 'rotation' => $rotation, 'people_needed' => $needed,
                'start_time' => $from, 'end_time' => $to, 'days' => $days, 'location' => $location, 'workload_periods' => $periods, 'description' => $description,
            ]);
            shuffle($staffPool);
            $duties->generate($type, array_slice($staffPool, 0, max($needed * 4, 6)), $start->toDateString(), 7, 7, $needed, $needed > 1 ? null : 'In charge');
        }

        $students = Student::active()->get(['id', 'school_class_id', 'residence_type']);
        $boarders = $students->where('residence_type', 'boarding')->pluck('id')->all();
        $everyone = $students->pluck('id')->all();
        foreach (self::STUDENT as [$name, $code, $rotation, $needed, $from, $to, $days, $location, $description]) {
            $type = DutyType::create([
                'audience' => 'student', 'name' => $name, 'code' => $code, 'rotation' => $rotation, 'people_needed' => $needed,
                'start_time' => $from, 'end_time' => $to, 'days' => $days, 'location' => $location, 'description' => $description,
            ]);
            $pool = $code === 'CMP' && count($boarders) >= $needed ? $boarders : $everyone; // Saturday compound: boarders
            shuffle($pool);
            $duties->generate($type, array_slice($pool, 0, $needed * 7), $start->toDateString(), 7, 7, $needed);
        }

        $this->logPastDays();
    }

    /** Done for most past duty-days, a few missed or excused. */
    private function logPastDays(): void
    {
        $today = CarbonImmutable::today();
        $rows = [];
        DutyAssignment::with('dutyType')->whereDate('start_date', '<', $today)->get()->each(function (DutyAssignment $a) use ($today, &$rows) {
            for ($d = CarbonImmutable::parse($a->start_date); $d->lt($today) && $d->lte($a->end_date); $d = $d->addDay()) {
                if (! $a->dutyType->runsOn($d)) {
                    continue;
                }
                $roll = mt_rand(1, 100);
                $rows[] = [
                    'tenant_id' => $a->tenant_id, 'school_id' => $a->school_id, 'duty_assignment_id' => $a->id, 'date' => $d->toDateString(),
                    'status' => $roll <= 88 ? 'done' : ($roll <= 96 ? 'missed' : 'excused'),
                    'remarks' => $roll > 88 && $roll <= 96 ? 'Did not report for duty' : ($roll > 96 ? 'Sick — excused by the matron' : null),
                    'created_at' => now(), 'updated_at' => now(),
                ];
            }
        });

        foreach (array_chunk($rows, 500) as $chunk) {
            DutyLog::insert($chunk);
        }
    }
}
