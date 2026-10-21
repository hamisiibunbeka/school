<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\GradeScale;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\User;
use App\Services\Exams\ResultsService;
use App\Services\SchoolProvisioner;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/** Pre-primary and Primary: NECTA PSLE/SFNA-style grading (average grade, no divisions) on the main calendar. */
class PrimaryGradingTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    /** Provision a school of the given type (nursery | primary | secondary | combined). */
    private function primarySchool(string $level = 'primary'): void
    {
        $result = app(SchoolProvisioner::class)->provision(['school_name' => 'Upendo '.ucfirst($level).' School', 'admin_name' => 'Head Teacher', 'email' => fake()->unique()->safeEmail(), 'password' => 'password', 'level' => $level]);
        $result['tenant']->update(['status' => 'active']);
        ['school' => $this->school, 'admin' => $this->admin] = $result;
    }

    private function in(callable $fn): mixed
    {
        return app(Tenancy::class)->runAs($this->school->fresh(), $fn);
    }

    /** @param  array<string, float|null>  $scores  subject code => score out of 50 (null = absent) */
    private function pupil(Exam $exam, SchoolClass $class, string $name, array $scores): Student
    {
        $student = $this->makeStudent($this->school, ['school_class_id' => $class->id, 'first_name' => $name]);
        $this->in(function () use ($exam, $class, $student, $scores) {
            $results = app(ResultsService::class);
            foreach ($scores as $code => $score) {
                $subject = Subject::firstOrCreate(['code' => $code], ['name' => $code, 'type' => 'core']);
                $grade = $score === null ? null : $results->grade($results->percentage($exam, $score), 'primary');
                ExamMark::create(['exam_id' => $exam->id, 'student_id' => $student->id, 'school_class_id' => $class->id, 'subject_id' => $subject->id,
                    'score' => $score, 'is_absent' => $score === null, 'grade' => $grade['grade'] ?? null, 'points' => $grade['points'] ?? null]);
            }
        });

        return $student;
    }

    public function test_school_type_decides_which_grade_scales_are_installed(): void
    {
        $this->primarySchool();
        $levels = $this->in(fn () => GradeScale::distinct()->pluck('education_level')->sort()->values()->all());
        $this->assertContains('primary', $levels);
        $this->assertContains('pre_primary', $levels);

        // PSLE-style bands; pass = A–C.
        $primary = $this->in(fn () => GradeScale::where('education_level', 'primary')->orderByDesc('min_score')->get());
        $this->assertSame(['A', 'B', 'C', 'D', 'E'], $primary->pluck('grade')->all());
        $this->assertSame([true, true, true, false, false], $primary->pluck('is_pass')->all());
        $this->assertSame(41.0, $this->in(fn () => app(ResultsService::class)->passMark('primary')));

        // A primary school is not given secondary (CSEE / ACSEE) scales.
        $this->assertNotContains('o_level', $levels);
        $this->assertNotContains('a_level', $levels);

        // A new primary class always has a scale; the grading page offers only the levels in use.
        $this->actingAs($this->admin)->post('/academics/classes', ['name' => 'Standard Seven', 'level' => 7, 'education_level' => 'primary'])->assertSessionHasNoErrors();
        $this->get('/exams/grading')->assertInertia(fn (Assert $p) => $p
            ->where('level', 'primary')
            ->where('usesDivision', false)
            ->where('levels', fn ($l) => collect($l)->pluck('value')->contains('primary') && ! collect($l)->pluck('value')->contains('a_level')));
        // A primary school creates Nursery / Primary classes only.
        $this->get('/academics/classes')->assertInertia(fn (Assert $p) => $p->where('levels', fn ($l) => collect($l)->pluck('value')->all() === ['pre_primary', 'primary']));
        // Level-specific menus: no A-Level here.
        $this->get('/dashboard')->assertInertia(fn (Assert $p) => $p->where('school.levels', ['primary']));
    }

    public function test_primary_results_use_an_average_grade_and_rank_by_average_then_total(): void
    {
        $this->primarySchool();
        [$class, $exam] = $this->in(function () {
            $class = SchoolClass::create(['name' => 'Standard Seven', 'level' => 7, 'education_level' => 'primary']);
            $year = AcademicYear::current();
            $exam = Exam::create(['academic_year_id' => $year->id, 'name' => 'Mock PSLE', 'type' => 'mock', 'max_score' => 50, 'weight' => 100, 'status' => 'marks_entry']);
            $exam->classes()->sync([$class->id]);

            return [$class, $exam];
        });

        // Scores out of 50, like PSLE subjects.
        $amina = $this->pupil($exam, $class, 'Amina', ['KIS' => 45, 'ENG' => 40, 'MAT' => 42, 'SCI' => 38, 'SST' => 35]); // 200 → 80% → B
        $baraka = $this->pupil($exam, $class, 'Baraka', ['KIS' => 48, 'ENG' => 46, 'MAT' => 44, 'SCI' => 45, 'SST' => 47]); // 230 → 92% → A
        // Same average (80%) as Amina but fewer subjects sat → fewer total marks → below her.
        $chiku = $this->pupil($exam, $class, 'Chiku', ['KIS' => 40, 'ENG' => 40, 'MAT' => 40, 'SCI' => 40, 'SST' => null]);
        $daudi = $this->pupil($exam, $class, 'Daudi', ['KIS' => 15, 'ENG' => 18, 'MAT' => 10, 'SCI' => 20, 'SST' => 12]); // 75 → 30% → D, not a pass

        $analysis = $this->in(fn () => app(ResultsService::class)->classResults($exam, $class->id));
        $rows = collect($analysis['students'])->keyBy('id');

        $this->assertFalse($analysis['has_division']);
        $this->assertSame([], $analysis['divisions']);
        $this->assertSame(['A', 'B', 'C'], $analysis['pass_grades']);
        $this->assertSame([92.0, 'A', null, true], [$rows[$baraka->id]['average'], $rows[$baraka->id]['grade'], $rows[$baraka->id]['division'], $rows[$baraka->id]['passed']]);
        $this->assertSame([80.0, 'B', 200.0], [$rows[$amina->id]['average'], $rows[$amina->id]['grade'], $rows[$amina->id]['total']]);
        $this->assertSame(['D', false], [$rows[$daudi->id]['grade'], $rows[$daudi->id]['passed']]);
        $this->assertSame([1, 2, 3, 4], [$rows[$baraka->id]['position'], $rows[$amina->id]['position'], $rows[$chiku->id]['position'], $rows[$daudi->id]['position']]);
        $this->assertSame(75.0, $analysis['summary']['pass_rate']);

        $this->actingAs($this->admin)->get("/exams/{$exam->id}/results?class={$class->id}")->assertOk();
        $this->get("/exams/report-cards?exam={$exam->id}&class={$class->id}")->assertOk();
    }

    public function test_primary_classes_use_the_main_calendar_and_exams_do_not_mix_levels(): void
    {
        $this->primarySchool('combined');
        [$std7, $formOne, $year] = $this->in(fn () => [
            SchoolClass::create(['name' => 'Standard Seven', 'level' => 7, 'education_level' => 'primary']),
            SchoolClass::create(['name' => 'Form One', 'level' => 8, 'education_level' => 'o_level']),
            AcademicYear::current(),
        ]);

        // Fees, enrolment and admissions find the main-calendar year for a primary class.
        $this->assertSame($year->id, $this->in(fn () => AcademicYear::currentFor($std7->id)?->id));

        $exam = ['name' => 'Midterm', 'type' => 'midterm', 'academic_year_id' => $year->id, 'max_score' => 100, 'weight' => 100];
        $this->actingAs($this->admin)->post('/exams', $exam + ['class_ids' => [$std7->id, $formOne->id]])->assertSessionHasErrors('class_ids');
        $this->actingAs($this->admin)->post('/exams', $exam + ['class_ids' => [$std7->id]])->assertSessionHasNoErrors();
    }

    public function test_nursery_moves_up_into_standard_one_but_standard_seven_does_not_move_into_form_one(): void
    {
        $this->primarySchool('combined');
        [$preUnit, $std1, $std7, $form1, $year] = $this->in(fn () => [
            SchoolClass::create(['name' => 'Pre-Unit', 'level' => 1, 'education_level' => 'pre_primary']),
            SchoolClass::create(['name' => 'Standard One', 'level' => 2, 'education_level' => 'primary']),
            SchoolClass::create(['name' => 'Standard Seven', 'level' => 8, 'education_level' => 'primary']),
            SchoolClass::create(['name' => 'Form One', 'level' => 9, 'education_level' => 'o_level']),
            AcademicYear::current(),
        ]);

        $child = $this->makeStudent($this->school, ['school_class_id' => $preUnit->id]);
        $this->actingAs($this->admin)->post('/students/promotions', [
            'from_class_id' => $preUnit->id, 'to_class_id' => $std1->id, 'academic_year_id' => $year->id,
            'decisions' => [['student_id' => $child->id, 'action' => 'promote']],
        ])->assertSessionHasNoErrors();
        $this->assertSame($std1->id, $child->fresh()->school_class_id);

        $leaver = $this->makeStudent($this->school, ['school_class_id' => $std7->id]);
        $this->actingAs($this->admin)->post('/students/promotions', [
            'from_class_id' => $std7->id, 'to_class_id' => $form1->id, 'academic_year_id' => $year->id,
            'decisions' => [['student_id' => $leaver->id, 'action' => 'promote']],
        ])->assertSessionHasErrors('to_class_id');

        // The promotion screen suggests Standard One as the next class for Pre-Unit.
        $this->get("/students/promotions?class={$preUnit->id}")->assertInertia(fn (Assert $p) => $p->where('suggestedNextClass', $std1->id));
    }
}
