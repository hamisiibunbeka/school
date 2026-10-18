<?php

namespace Tests\Feature;

use App\Models\BedAllocation;
use App\Models\ClassSubject;
use App\Models\Dormitory;
use App\Models\DutyAssignment;
use App\Models\DutyLog;
use App\Models\DutyType;
use App\Models\Employee;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Subject;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DutyRosterTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
    }

    private function in(callable $fn): mixed
    {
        return app(Tenancy::class)->runAs($this->school, $fn);
    }

    private function staff(string $first, array $attrs = []): Employee
    {
        return $this->in(fn () => Employee::create(array_merge([
            'employee_no' => 'E'.fake()->unique()->numberBetween(100, 999), 'first_name' => $first, 'last_name' => 'Test',
            'gender' => 'male', 'designation' => 'Teacher', 'category' => 'teaching', 'status' => 'active',
        ], $attrs)));
    }

    private function staffType(array $attrs = []): DutyType
    {
        $this->actingAs($this->admin)->post('/hr/duties/types', array_merge([
            'name' => 'Teacher on Duty', 'code' => 'TOD', 'rotation' => 'weekly', 'people_needed' => 2, 'days' => [1, 2, 3, 4, 5, 6, 7], 'is_active' => true,
        ], $attrs))->assertSessionHasNoErrors();

        return $this->in(fn () => DutyType::where('name', $attrs['name'] ?? 'Teacher on Duty')->firstOrFail());
    }

    public function test_staff_duty_can_have_several_people_and_refuses_overlaps(): void
    {
        $tod = $this->staffType();
        $this->assertNull($tod->days, 'All seven days are stored as "every day".');
        [$a, $b] = [$this->staff('Juma'), $this->staff('Asha', ['gender' => 'female'])];
        $monday = Carbon::parse('monday this week')->toDateString();
        $sunday = Carbon::parse($monday)->addDays(6)->toDateString();

        $this->actingAs($this->admin)->post('/hr/duties/assign', ['duty_type_id' => $tod->id, 'people' => [$a->id, $b->id], 'start_date' => $monday, 'end_date' => $sunday])->assertSessionHasNoErrors();
        $this->assertSame(2, $this->in(fn () => DutyAssignment::count()));

        // Same person, same duty, overlapping dates: refused.
        $this->actingAs($this->admin)->post('/hr/duties/assign', ['duty_type_id' => $tod->id, 'people' => [$a->id], 'start_date' => $sunday, 'end_date' => $sunday])->assertSessionHasErrors('people');

        $this->actingAs($this->admin)->get('/hr/duties')->assertInertia(fn (Assert $p) => $p
            ->component('duties/index')
            ->where('stats.on_duty_today', 2)
            ->where('week.shortfalls', 0)
            ->where('week.rows.0.cells.0', fn ($cell) => count($cell) === 2));

        // Students' duty types are not reachable from the staff roster.
        $studentType = $this->in(fn () => DutyType::create(['audience' => 'student', 'name' => 'Dining hall', 'rotation' => 'daily', 'people_needed' => 4]));
        $this->actingAs($this->admin)->put("/hr/duties/types/{$studentType->id}", ['name' => 'X', 'rotation' => 'daily', 'people_needed' => 1])->assertNotFound();
    }

    public function test_rota_rotates_the_pool_fairly_and_skips_people_already_on_duty(): void
    {
        $prep = $this->staffType(['name' => 'Prep supervision', 'rotation' => 'weekly', 'people_needed' => 1, 'days' => [1, 2, 3, 4, 5]]);
        [$a, $b, $c] = [$this->staff('Ally'), $this->staff('Bora'), $this->staff('Chema')];
        $start = Carbon::parse('next monday');

        // Bora already covers week 1.
        $this->in(fn () => DutyAssignment::create(['duty_type_id' => $prep->id, 'employee_id' => $b->id, 'start_date' => $start->toDateString(), 'end_date' => $start->copy()->addDays(6)->toDateString()]));

        $this->actingAs($this->admin)->post('/hr/duties/generate', [
            'duty_type_id' => $prep->id, 'pool' => [$a->id, $b->id, $c->id], 'start_date' => $start->toDateString(), 'periods' => 4, 'length_days' => 7, 'per_period' => 1,
        ])->assertSessionHasNoErrors();

        $order = $this->in(fn () => DutyAssignment::where('duty_type_id', $prep->id)->orderBy('start_date')->orderBy('id')->get()->map(fn ($x) => [$x->start_date->toDateString(), $x->employee_id])->all());
        // Week 1 is already covered by Bora, so the rotation starts in week 2: Ally, Bora, Chema.
        $this->assertSame([$b->id, $a->id, $b->id, $c->id], array_column($order, 1));

        // Week view shows "—" on weekends for a Mon–Fri duty.
        $this->actingAs($this->admin)->get('/hr/duties?week='.$start->toDateString())->assertInertia(fn (Assert $p) => $p
            ->where('week.rows.0.cells.5', null)
            ->where('week.rows.0.cells.0', fn ($cell) => count($cell) === 1));
    }

    public function test_daily_check_records_done_or_missed_and_shows_on_profiles(): void
    {
        $student = $this->makeStudent($this->school, ['first_name' => 'Neema']);
        $this->actingAs($this->admin)->post('/students/duties/types', ['name' => 'Dining hall', 'rotation' => 'daily', 'people_needed' => 2, 'start_time' => '12:30', 'end_time' => '13:30', 'is_active' => true])->assertSessionHasNoErrors();
        $type = $this->in(fn () => DutyType::where('audience', 'student')->firstOrFail());
        $today = today()->toDateString();

        $this->actingAs($this->admin)->post('/students/duties/assign', ['duty_type_id' => $type->id, 'people' => [$student->id], 'start_date' => $today, 'end_date' => $today])->assertSessionHasNoErrors();
        $assignment = $this->in(fn () => DutyAssignment::firstOrFail());

        $this->actingAs($this->admin)->post('/students/duties/log', ['assignment_id' => $assignment->id, 'date' => $today, 'status' => 'missed', 'remarks' => 'Absent from duty'])->assertSessionHasNoErrors();
        $this->actingAs($this->admin)->post('/students/duties/log', ['assignment_id' => $assignment->id, 'date' => today()->addDay()->toDateString(), 'status' => 'done'])->assertSessionHasErrors('date');
        $this->assertSame('missed', $this->in(fn () => DutyLog::firstOrFail()->status));

        $this->actingAs($this->admin)->get('/students/duties')->assertInertia(fn (Assert $p) => $p
            ->where('audience', 'student')
            ->where('day.duties.0.people.0.status', 'missed')
            ->where('day.duties.0.people.0.remarks', 'Absent from duty')
            ->where('stats.missed_30', 1)
            ->where('week.shortfalls', 7)); // needs 2 every day; only today has 1

        $this->actingAs($this->admin)->get("/students/{$student->id}")->assertInertia(fn (Assert $p) => $p
            ->where('duties.0.duty', 'Dining hall')
            ->where('duties.0.time', '12:30–13:30')
            ->where('duties.0.missed', 1));

        // Staff routes are separate from student routes: a student id is not a valid staff member.
        $tod = $this->staffType();
        $this->actingAs($this->admin)->post('/hr/duties/assign', ['duty_type_id' => $tod->id, 'people' => [$student->id], 'start_date' => $today, 'end_date' => $today])->assertSessionHasErrors('people');
    }

    public function test_dormitory_caretakers_and_class_teachers_show_on_the_student_profile(): void
    {
        $patron = $this->staff('Baraka');
        $assistant = $this->staff('Mussa');
        $classTeacher = $this->staff('Grace', ['gender' => 'female']);

        $this->actingAs($this->admin)->post('/boarding/dormitories', [
            'name' => 'Kilimanjaro', 'gender' => 'male',
            'caretakers' => [['employee_id' => $patron->id, 'role' => 'patron'], ['employee_id' => $assistant->id, 'role' => 'assistant']],
        ])->assertSessionHasNoErrors();
        $this->actingAs($this->admin)->post('/boarding/dormitories', [
            'name' => 'Dup', 'gender' => 'male', 'caretakers' => [['employee_id' => $patron->id, 'role' => 'patron'], ['employee_id' => $patron->id, 'role' => 'assistant']],
        ])->assertSessionHasErrors('caretakers.1.employee_id');

        $dorm = $this->in(fn () => Dormitory::firstOrFail());
        $room = $this->in(fn () => $dorm->rooms()->create(['name' => 'K1', 'capacity' => 6]));
        $student = $this->makeStudent($this->school, ['gender' => 'male', 'residence_type' => 'boarding']);
        $this->in(fn () => BedAllocation::create(['student_id' => $student->id, 'dormitory_room_id' => $room->id, 'bed_no' => '3', 'start_date' => today(), 'status' => 'active']));

        $stream = $this->in(fn () => SchoolClass::findOrFail($student->school_class_id)->streams()->create(['name' => 'A']));
        $this->in(fn () => $student->update(['stream_id' => $stream->id]));
        $this->actingAs($this->admin)->put("/academics/streams/{$stream->id}", ['name' => 'A', 'class_teacher_id' => $classTeacher->id])->assertSessionHasNoErrors();

        $this->actingAs($this->admin)->get("/students/{$student->id}")->assertInertia(fn (Assert $p) => $p
            ->where('care.teachers.0.name', $classTeacher->full_name)
            ->where('care.teachers.0.role', 'Class teacher')
            ->where('care.dormitory.name', 'Kilimanjaro')
            ->where('care.dormitory.bed', '3')
            ->where('care.dormitory.caretakers.0.role', 'Patron')
            ->where('care.dormitory.caretakers.1.name', $assistant->full_name));

        $this->actingAs($this->admin)->get('/boarding/dormitories')->assertInertia(fn (Assert $p) => $p->where('dormitories.0.caretakers', fn ($c) => count($c) === 2));
        $this->actingAs($this->admin)->get("/hr/employees/{$patron->id}")->assertInertia(fn (Assert $p) => $p->where('caretakerOf.0.role', 'Patron'));

        $report = $this->actingAs($this->admin)->get('/reports/boarding-occupancy')->assertOk()->viewData('page')['props'];
        $this->assertStringContainsString("{$patron->full_name} (patron), {$assistant->full_name} (assistant)", json_encode($report));

        // Editing replaces the list.
        $this->actingAs($this->admin)->put("/boarding/dormitories/{$dorm->id}", ['name' => 'Kilimanjaro', 'gender' => 'male', 'caretakers' => [['employee_id' => $assistant->id, 'role' => 'patron']]])->assertSessionHasNoErrors();
        $this->assertSame([[$assistant->id, 'patron']], $this->in(fn () => $dorm->caretakers()->get()->map(fn ($c) => [$c->employee_id, $c->role])->all()));
    }

    public function test_rostered_duties_and_class_teacher_count_on_teacher_workload(): void
    {
        $t = $this->staff('Halima', ['gender' => 'female']);
        $this->actingAs($this->admin)->put('/admin/settings/general', [
            'pass_mark' => 30, 'attendance_alert_threshold' => 80, 'fee_reminder_days' => 7,
            'max_teaching_periods' => 30, 'workload_enforcement' => 'warn', 'class_teacher_periods' => 2,
        ])->assertSessionHasNoErrors();

        $class = $this->in(fn () => SchoolClass::create(['name' => 'Form Two', 'level' => 2]));
        $this->in(fn () => $class->streams()->create(['name' => 'A', 'class_teacher_id' => $t->id]));
        $subject = $this->in(fn () => Subject::create(['name' => 'Physics']));
        $this->in(fn () => ClassSubject::create(['school_class_id' => $class->id, 'subject_id' => $subject->id, 'employee_id' => $t->id, 'periods_per_week' => 5]));
        $prep = $this->staffType(['name' => 'Prep', 'workload_periods' => 4, 'people_needed' => 1]);
        $this->actingAs($this->admin)->post('/hr/duties/assign', ['duty_type_id' => $prep->id, 'people' => [$t->id], 'start_date' => today()->toDateString(), 'end_date' => today()->addDays(6)->toDateString()])->assertSessionHasNoErrors();

        $w = collect($this->actingAs($this->admin)->get('/academics/allocations')->viewData('page')['props']['workload'])->firstWhere('id', $t->id);
        // 5 teaching + 2 class teacher + 4 prep
        $this->assertSame([5, 1, 4, ['Prep'], 11], [$w['teaching'], $w['class_teacher_streams'], $w['roster_periods'], $w['roster_duties'], $w['periods']]);

        $this->actingAs($this->admin)->get("/hr/employees/{$t->id}")->assertInertia(fn (Assert $p) => $p
            ->where('duties.0.duty', 'Prep')
            ->where('duties.0.status', 'current')
            ->where('classTeacherOf.0', 'Form Two A'));
    }
}
