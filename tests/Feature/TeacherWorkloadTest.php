<?php

namespace Tests\Feature;

use App\Models\ClassSubject;
use App\Models\Combination;
use App\Models\Employee;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Subject;
use App\Models\TimetableSlot;
use App\Models\User;
use App\Services\Academics\CombinationService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TeacherWorkloadTest extends TestCase
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

    private function teacher(array $attrs = []): Employee
    {
        return $this->in(fn () => Employee::create(array_merge([
            'employee_no' => 'T'.fake()->unique()->numberBetween(100, 999), 'first_name' => 'Asha', 'last_name' => fake()->lastName(),
            'gender' => 'female', 'designation' => 'Teacher', 'category' => 'teaching', 'status' => 'active',
        ], $attrs)));
    }

    private function settings(array $values): void
    {
        $this->actingAs($this->admin)->put('/admin/settings/general', array_merge([
            'pass_mark' => 30, 'attendance_alert_threshold' => 80, 'fee_reminder_days' => 7,
            'max_teaching_periods' => 30, 'workload_enforcement' => 'warn', 'class_teacher_periods' => 0,
        ], $values))->assertSessionHasNoErrors();
    }

    private function workloadOf(Employee $t): array
    {
        $rows = $this->actingAs($this->admin)->get('/academics/allocations')->viewData('page')['props']['workload'];

        return collect($rows)->firstWhere('id', $t->id);
    }

    public function test_limit_comes_from_settings_or_the_teachers_own_limit(): void
    {
        $formOne = $this->in(fn () => tap(SchoolClass::create(['name' => 'Form One', 'level' => 1]), fn ($c) => [$c->streams()->create(['name' => 'A']), $c->streams()->create(['name' => 'B'])]));
        $maths = $this->in(fn () => Subject::create(['name' => 'Mathematics', 'code' => 'MATH']));
        $t = $this->teacher();

        // 6 periods × 2 streams = 12.
        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $formOne->id, 'subject_id' => $maths->id, 'employee_id' => $t->id, 'periods_per_week' => 6])->assertSessionHasNoErrors();
        $this->assertSame([12, 30, 'ok'], [$this->workloadOf($t)['periods'], $this->workloadOf($t)['limit'], $this->workloadOf($t)['status']]);

        $this->settings(['max_teaching_periods' => 10]);
        $this->assertSame([10, 'over'], [$this->workloadOf($t)['limit'], $this->workloadOf($t)['status']]);

        // Own limit overrides the school default.
        $t->update(['max_periods' => 14]);
        $this->assertSame([14, 'near'], [$this->workloadOf($t)['limit'], $this->workloadOf($t)['status']]);
        $this->actingAs($this->admin)->get('/academics/allocations')->assertInertia(fn (Assert $p) => $p->where('workloadSettings.max_teaching_periods', 10));
    }

    public function test_joint_teaching_counts_once_and_block_mode_refuses_overload(): void
    {
        $formOne = $this->in(fn () => tap(SchoolClass::create(['name' => 'Form One', 'level' => 1]), fn ($c) => [$c->streams()->create(['name' => 'A']), $c->streams()->create(['name' => 'B']), $c->streams()->create(['name' => 'C'])]));
        [$bio, $chem] = $this->in(fn () => [Subject::create(['name' => 'Biology']), Subject::create(['name' => 'Chemistry'])]);
        $t = $this->teacher();

        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $formOne->id, 'subject_id' => $bio->id, 'employee_id' => $t->id, 'periods_per_week' => 4, 'is_joint' => true])->assertSessionHasNoErrors();
        $this->assertSame(4, $this->workloadOf($t)['teaching'], 'Joint lessons count once, not × 3 streams.');

        $this->settings(['max_teaching_periods' => 10, 'workload_enforcement' => 'block']);
        // 4 × 3 streams = 12 more → 16 > 10: refused.
        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $formOne->id, 'subject_id' => $chem->id, 'employee_id' => $t->id, 'periods_per_week' => 4])->assertSessionHasErrors('employee_id');
        $this->assertSame(1, $this->in(fn () => ClassSubject::where('employee_id', $t->id)->count()));
        // Warn mode saves it.
        $this->settings(['max_teaching_periods' => 10, 'workload_enforcement' => 'warn']);
        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $formOne->id, 'subject_id' => $chem->id, 'employee_id' => $t->id, 'periods_per_week' => 4])->assertSessionHasNoErrors();
        $this->assertSame(16, $this->workloadOf($t)['periods']);
    }

    public function test_duties_and_timetable_comparison(): void
    {
        $formOne = $this->in(fn () => SchoolClass::create(['name' => 'Form One', 'level' => 1]));
        $stream = $this->in(fn () => $formOne->streams()->create(['name' => 'A']));
        $eng = $this->in(fn () => Subject::create(['name' => 'English']));
        $t = $this->teacher(['duty_periods' => 3, 'duty_note' => 'Games master']);
        $this->settings(['class_teacher_periods' => 2]);

        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $formOne->id, 'stream_id' => $stream->id, 'subject_id' => $eng->id, 'employee_id' => $t->id, 'periods_per_week' => 5]);
        $this->actingAs($this->admin)->put("/academics/streams/{$stream->id}", ['name' => 'A', 'class_teacher_id' => $t->id])->assertSessionHasNoErrors();
        $this->in(fn () => TimetableSlot::create(['school_class_id' => $formOne->id, 'stream_id' => $stream->id, 'subject_id' => $eng->id, 'employee_id' => $t->id, 'day_of_week' => 1, 'start_time' => '08:00', 'end_time' => '08:40']));

        $w = $this->workloadOf($t);
        $this->assertSame([5, 1, 5, 10], [$w['teaching'], $w['class_teacher_streams'], $w['duties'], $w['periods']]); // duties = 1×2 + 3
        $this->assertSame([1, 4], [$w['timetabled'], $w['timetable_gap']]);

        // Block mode also applies to class-teacher duty.
        $this->settings(['max_teaching_periods' => 10, 'workload_enforcement' => 'block', 'class_teacher_periods' => 2]);
        $streamB = $this->in(fn () => $formOne->streams()->create(['name' => 'B']));
        $this->actingAs($this->admin)->put("/academics/streams/{$streamB->id}", ['name' => 'B', 'class_teacher_id' => $t->id])->assertSessionHasErrors('class_teacher_id');
    }

    public function test_a_level_class_wide_allocation_counts_only_streams_taking_the_subject(): void
    {
        $class = $this->in(function () {
            app(CombinationService::class)->seedStandard();
            $class = SchoolClass::create(['name' => 'Form Five', 'level' => 5, 'education_level' => 'a_level']);
            foreach (['PCM', 'PCB', 'HGL'] as $code) {
                $class->streams()->create(['name' => $code, 'combination_id' => Combination::where('code', $code)->value('id')]);
            }

            return $class;
        });
        $physics = $this->in(fn () => Subject::where('code', 'PHY')->value('id'));
        $gs = $this->in(fn () => Subject::where('code', 'GS')->value('id'));
        $t = $this->teacher();

        // Physics: PCM + PCB take it (not HGL) → 5 × 2 = 10, not × 3.
        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $class->id, 'subject_id' => $physics, 'employee_id' => $t->id, 'periods_per_week' => 5])->assertSessionHasNoErrors();
        $this->assertSame(10, $this->workloadOf($t)['teaching']);
        // GS is in every combination → × 3, unless taught jointly.
        $this->actingAs($this->admin)->post('/academics/allocations', ['school_class_id' => $class->id, 'subject_id' => $gs, 'employee_id' => $t->id, 'periods_per_week' => 2, 'is_joint' => true])->assertSessionHasNoErrors();
        $this->assertSame(12, $this->workloadOf($t)['teaching']);
    }

    public function test_employee_own_limit_and_duties_are_saved(): void
    {
        $t = $this->teacher();
        $this->actingAs($this->admin)->put("/hr/employees/{$t->id}", [
            'first_name' => $t->first_name, 'last_name' => $t->last_name, 'gender' => 'female', 'designation' => 'Head of Science', 'category' => 'teaching',
            'employment_type' => 'permanent', 'basic_salary' => 900000, 'max_periods' => 20, 'duty_periods' => '', 'duty_note' => 'Head of department',
        ])->assertSessionHasNoErrors();
        $t->refresh();
        $this->assertSame([20, 0, 'Head of department'], [$t->max_periods, $t->duty_periods, $t->duty_note]);
    }
}
