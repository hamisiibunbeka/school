<?php

namespace Database\Seeders;

use App\Models\DisciplineCase;
use App\Models\Employee;
use App\Models\Student;
use App\Models\User;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo attendance: ~30 school days of student registers (≈93% present), 10 days of
 * staff attendance and ~20 discipline cases / awards. Runs inside the demo school's
 * tenancy context (see DatabaseSeeder).
 */
class AttendanceDemoSeeder extends Seeder
{
    public function run(): void
    {
        $tenancy = app(Tenancy::class);
        $schoolId = $tenancy->schoolId();
        $tenantId = $tenancy->tenantId();
        if (! $schoolId || DB::table('attendance_records')->where('school_id', $schoolId)->exists()) {
            return;
        }

        mt_srand(4707);

        $recorder = User::where('school_id', $schoolId)->where('email', 'teacher@mzenzi.test')->value('id')
            ?? User::where('school_id', $schoolId)->value('id');
        $admin = User::where('school_id', $schoolId)->where('email', 'principal@mzenzi.test')->value('id') ?? $recorder;

        // ---------------------------------------------------------- school days
        $days = [];
        $d = CarbonImmutable::today();
        while (count($days) < 30) {
            if (! $d->isWeekend()) {
                $days[] = $d->toDateString();
            }
            $d = $d->subDay();
        }
        $days = array_reverse($days);

        // ------------------------------------------------------- student registers
        $students = Student::where('status', 'active')->whereNotNull('school_class_id')->get(['id', 'school_class_id', 'stream_id']);
        // A few learners are chronic absentees / latecomers so reports have something to flag.
        $profile = [];
        foreach ($students as $s) {
            $r = mt_rand(1, 100);
            $profile[$s->id] = $r <= 6 ? 4.0 : ($r <= 18 ? 1.8 : 0.7); // absence multiplier
        }

        $now = now();
        $rows = [];
        $remarks = ['absent' => [null, null, 'Sick — parent called', 'No communication from home', 'Family emergency'], 'late' => [null, 'Traffic', 'Bus delayed', 'Arrived 07:50'], 'excused' => ['Medical appointment', 'School trip', 'Sports competition', 'Bereavement']];
        foreach ($days as $i => $day) {
            $dayFactor = in_array(CarbonImmutable::parse($day)->dayOfWeek, [1, 5], true) ? 1.25 : 1.0; // Mondays/Fridays slightly worse
            foreach ($students as $s) {
                $roll = mt_rand(1, 10000) / 100; // 0.01 … 100
                $absent = 3.2 * $profile[$s->id] * $dayFactor;
                $late = 3.0 * ($profile[$s->id] > 1 ? 1.5 : 1);
                $excused = 1.0;
                $status = $roll <= $absent ? 'absent' : ($roll <= $absent + $late ? 'late' : ($roll <= $absent + $late + $excused ? 'excused' : 'present'));

                $rows[] = [
                    'tenant_id' => $tenantId,
                    'school_id' => $schoolId,
                    'student_id' => $s->id,
                    'school_class_id' => $s->school_class_id,
                    'stream_id' => $s->stream_id,
                    'date' => $day,
                    'status' => $status,
                    'remarks' => $status === 'present' ? null : $remarks[$status][mt_rand(0, count($remarks[$status]) - 1)],
                    'recorded_by' => $recorder,
                    'created_at' => $day.' 08:'.str_pad((string) mt_rand(0, 45), 2, '0', STR_PAD_LEFT).':00',
                    'updated_at' => $now,
                ];
                if (count($rows) >= 1000) {
                    DB::table('attendance_records')->insertOrIgnore($rows);
                    $rows = [];
                }
            }
        }
        if ($rows) {
            DB::table('attendance_records')->insertOrIgnore($rows);
        }

        // --------------------------------------------------------- staff attendance
        $employees = Employee::whereNot('status', 'terminated')->get(['id']);
        $rows = [];
        foreach (array_slice($days, -10) as $day) {
            foreach ($employees as $e) {
                $roll = mt_rand(1, 100);
                $status = $roll <= 88 ? 'present' : ($roll <= 95 ? 'late' : ($roll <= 98 ? 'absent' : 'on_leave'));
                $in = match ($status) {
                    'present' => sprintf('07:%02d:00', mt_rand(0, 35)),
                    'late' => sprintf('%02d:%02d:00', mt_rand(0, 2) ? 7 : 8, mt_rand(0, 2) ? mt_rand(45, 59) : mt_rand(0, 30)),
                    default => null,
                };
                $rows[] = [
                    'tenant_id' => $tenantId,
                    'school_id' => $schoolId,
                    'employee_id' => $e->id,
                    'date' => $day,
                    'status' => $status,
                    'check_in' => $in,
                    'check_out' => $in ? sprintf('%02d:%02d:00', mt_rand(15, 16), mt_rand(0, 59)) : null,
                    'remarks' => $status === 'absent' ? 'Sick leave (unplanned)' : ($status === 'late' ? 'Transport delay' : null),
                    'recorded_by' => $admin,
                    'created_at' => $day.' 09:00:00',
                    'updated_at' => $now,
                ];
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('staff_attendances')->insertOrIgnore($chunk);
        }

        // ------------------------------------------------------- discipline & awards
        $misconduct = [
            ['Fighting during break time', 'Counselling and parent meeting held'],
            ['Persistent lateness', 'Warning letter to parent'],
            ['Use of mobile phone in class', 'Phone confiscated, returned to parent'],
            ['Incomplete homework (repeated)', 'Detention — Saturday prep'],
            ['Bullying a junior student', 'Two-day suspension, counselling'],
            ['Leaving school without permission', 'Parent summoned; written warning'],
            ['Disrespect to a teacher', 'Apology letter and counselling'],
            ['Improper school uniform', 'Verbal warning'],
            ['Cheating in a class test', 'Test cancelled; parent informed'],
            ['Damaging school property', 'Parent to cover repair cost'],
            ['Noise making during prep', 'Manual work (compound cleaning)'],
            ['Skipping evening prep (boarder)', 'Boarding master warning'],
        ];
        $positive = [
            ['award', '1st place — Regional Science Fair', 'Certificate presented at assembly'],
            ['award', 'Best in Mathematics, Term I', 'Book prize'],
            ['award', 'Inter-school debate champion', 'Trophy and certificate'],
            ['commendation', 'Helped organise the school clean-up day', 'Commended at assembly'],
            ['commendation', 'Outstanding leadership as class monitor', 'Letter of commendation to parent'],
            ['award', 'Zonal athletics — 400m gold', 'Medal and certificate'],
            ['commendation', 'Returned lost money to the office', 'Integrity certificate'],
            ['award', 'Most improved student, Form Two', 'Certificate'],
        ];

        $pool = $students->shuffle(mt_rand())->values();
        $n = 0;
        foreach ($misconduct as $i => [$title, $action]) {
            $date = CarbonImmutable::today()->subDays(mt_rand(1, 75));
            DisciplineCase::create([
                'student_id' => $pool[$n++ % $pool->count()]->id,
                'incident_date' => $date->toDateString(),
                'type' => 'misconduct',
                'title' => $title,
                'description' => 'Reported by the duty teacher. Student was interviewed and the matter recorded.',
                'action_taken' => $i % 4 === 3 ? null : $action,
                'status' => $date->lt(CarbonImmutable::today()->subDays(14)) && $i % 4 !== 3 ? 'resolved' : 'open',
                'reported_by' => $i % 2 ? $recorder : $admin,
            ]);
        }
        foreach ($positive as [$type, $title, $action]) {
            DisciplineCase::create([
                'student_id' => $pool[$n++ % $pool->count()]->id,
                'incident_date' => CarbonImmutable::today()->subDays(mt_rand(1, 120))->toDateString(),
                'type' => $type,
                'title' => $title,
                'description' => null,
                'action_taken' => $action,
                'status' => 'resolved',
                'reported_by' => $admin,
            ]);
        }
    }
}
