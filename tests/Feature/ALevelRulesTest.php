<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\ClassSubject;
use App\Models\Combination;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Student;
use App\Models\Subject;
use App\Models\User;
use App\Services\Academics\ALevelRules;
use App\Services\Academics\CombinationService;
use App\Services\Exams\ResultsService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Data-driven A-Level rules: categories, per-class rules for the transition, ranking, frozen results. */
class ALevelRulesTest extends TestCase
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

    /** Form Five and Form Six, each with a PCM stream; an A-Level year. */
    private function setUpClasses(): array
    {
        return $this->in(function () {
            app(CombinationService::class)->seedStandard();
            $pcm = Combination::where('code', 'PCM')->first();
            $five = SchoolClass::create(['name' => 'Form Five', 'level' => 5, 'education_level' => 'a_level']);
            $six = SchoolClass::create(['name' => 'Form Six', 'level' => 6, 'education_level' => 'a_level']);
            $s5 = $five->streams()->create(['name' => 'PCM', 'combination_id' => $pcm->id]);
            $s6 = $six->streams()->create(['name' => 'PCM', 'combination_id' => $pcm->id]);
            $year = AcademicYear::create(['name' => '2026/2027', 'education_level' => 'a_level', 'start_date' => '2026-07-01', 'end_date' => '2027-05-31', 'is_current' => true]);

            return compact('pcm', 'five', 'six', 's5', 's6', 'year');
        });
    }

    /** Make the school look like it did before the reform: GS compulsory, the new subjects not yet in use. */
    private function legacySchool(array $ctx): int
    {
        return $this->in(function () {
            Subject::whereIn('code', ['ACOM', 'HTM'])->update(['a_level_category' => null]);
            $gs = Subject::create(['name' => 'General Studies', 'code' => 'GS', 'type' => 'core', 'a_level_category' => 'compulsory']);
            $school = $this->school->fresh();
            $school->forceFill(['settings' => [...($school->settings ?? []), ALevelRules::AVERAGE_SETTING => 'principal']])->save();
            app(Tenancy::class)->setSchool($school);
            app(CombinationService::class)->refreshAll();

            return $gs->id;
        });
    }

    private function exam(SchoolClass $class, AcademicYear $year, string $name = 'Midterm'): Exam
    {
        return $this->in(function () use ($class, $year, $name) {
            $exam = Exam::create(['academic_year_id' => $year->id, 'name' => $name, 'type' => 'midterm', 'max_score' => 100, 'weight' => 100, 'status' => 'marks_entry']);
            $exam->classes()->sync([$class->id]);

            return $exam;
        });
    }

    /** @param  array<string, int|null>  $scores  subject code => score (null = absent) */
    private function student(Exam $exam, SchoolClass $class, Stream $stream, string $name, array $scores): Student
    {
        $student = $this->makeStudent($this->school, ['school_class_id' => $class->id, 'stream_id' => $stream->id, 'first_name' => $name]);
        $this->in(function () use ($exam, $class, $student, $scores) {
            $results = app(ResultsService::class);
            foreach ($scores as $code => $score) {
                $grade = $score === null ? null : $results->grade((float) $score, 'a_level');
                ExamMark::create(['exam_id' => $exam->id, 'student_id' => $student->id, 'school_class_id' => $class->id, 'subject_id' => Subject::where('code', $code)->value('id'),
                    'score' => $score, 'is_absent' => $score === null, 'grade' => $grade['grade'] ?? null, 'points' => $grade['points'] ?? null]);
            }
        });

        return $student;
    }

    public function test_position_is_division_points_then_average_then_total_marks(): void
    {
        ['five' => $five, 's5' => $s5, 'year' => $year] = $this->setUpClasses();
        $exam = $this->exam($five, $year);

        // Division I on 4 points, higher average (65.0).
        $a = $this->student($exam, $five, $s5, 'Asha', ['AMATH' => 85, 'PHY' => 85, 'CHEM' => 75, 'ACOM' => 40, 'HTM' => 40]);
        // Division I on 3 points, lower average (57.8) — still first.
        $b = $this->student($exam, $five, $s5, 'Baraka', ['AMATH' => 85, 'PHY' => 82, 'CHEM' => 82, 'ACOM' => 20, 'HTM' => 20]);
        // Same points (5) and average (60.0); Chiku has more total marks (300 vs 240, Daudi absent in HTM).
        $c = $this->student($exam, $five, $s5, 'Chiku', ['AMATH' => 85, 'PHY' => 75, 'CHEM' => 75, 'ACOM' => 35, 'HTM' => 30]);
        $d = $this->student($exam, $five, $s5, 'Daudi', ['AMATH' => 85, 'PHY' => 75, 'CHEM' => 75, 'ACOM' => 5, 'HTM' => null]);
        // Equal to Chiku on every factor → shares her position.
        $e = $this->student($exam, $five, $s5, 'Elia', ['AMATH' => 85, 'PHY' => 75, 'CHEM' => 75, 'ACOM' => 30, 'HTM' => 35]);

        $rows = collect($this->in(fn () => app(ResultsService::class)->classResults($exam, $five->id))['students'])->keyBy('id');
        $this->assertSame([3.0, 57.8], [$rows[$b->id]['points'], $rows[$b->id]['average']]);
        $this->assertSame([4.0, 65.0], [$rows[$a->id]['points'], $rows[$a->id]['average']]);
        $this->assertSame([60.0, 300.0, 240.0], [$rows[$c->id]['average'], $rows[$c->id]['total'], $rows[$d->id]['total']]);
        $this->assertSame(
            [1, 2, 3, 3, 5],
            [$rows[$b->id]['position'], $rows[$a->id]['position'], $rows[$c->id]['position'], $rows[$e->id]['position'], $rows[$d->id]['position']],
        );
    }

    public function test_new_intake_switches_while_form_six_finishes_on_general_studies(): void
    {
        $ctx = $this->setUpClasses();
        ['five' => $five, 'six' => $six, 's5' => $s5, 's6' => $s6] = $ctx;
        $gs = $this->legacySchool($ctx);
        $this->assertSame([$gs], $this->in(fn () => app(ALevelRules::class)->current()['compulsory']));

        $this->actingAs($this->admin)->post('/academics/a-level-rules/adopt', ['class_ids' => [$five->id]])->assertSessionHasNoErrors();

        $codes = fn (Stream $s) => $this->in(fn () => Subject::whereIn('id', ClassSubject::where('stream_id', $s->id)->pluck('subject_id'))->pluck('code')->sort()->values()->all());
        // Form Five: the new compulsory subsidiaries, average of all subjects.
        $this->assertSame(['ACOM', 'AMATH', 'CHEM', 'HTM', 'PHY'], $codes($s5));
        $this->assertSame(['all', false], $this->in(fn () => [app(ALevelRules::class)->forClass($five->fresh())['average'], app(ALevelRules::class)->forClass($five->fresh())['pinned']]));
        // Form Six keeps General Studies and the average of principals.
        $this->assertSame(['AMATH', 'CHEM', 'GS', 'PHY'], $codes($s6));
        $sixRules = $this->in(fn () => app(ALevelRules::class)->forClass($six->fresh()));
        $this->assertSame([[$gs], 'principal', true], [$sixRules['compulsory'], $sixRules['average'], $sixRules['pinned']]);
        // General Studies is retired from the current rules.
        $this->assertNull($this->in(fn () => Subject::find($gs)->a_level_category));

        // Results: Form Six averages principals only (GS 20 ignored); Form Five averages everything.
        $examSix = $this->exam($six, $ctx['year'], 'F6 Midterm');
        $old = $this->student($examSix, $six, $s6, 'Zawadi', ['AMATH' => 80, 'PHY' => 70, 'CHEM' => 60, 'GS' => 20]);
        $examFive = $this->exam($five, $ctx['year'], 'F5 Midterm');
        $new = $this->student($examFive, $five, $s5, 'Neema', ['AMATH' => 80, 'PHY' => 70, 'CHEM' => 60, 'ACOM' => 20, 'HTM' => 40]);
        $this->assertSame(70.0, $this->in(fn () => collect(app(ResultsService::class)->classResults($examSix, $six->id)['students'])->firstWhere('id', $old->id)['average']));
        $this->assertSame(54.0, $this->in(fn () => collect(app(ResultsService::class)->classResults($examFive, $five->id)['students'])->firstWhere('id', $new->id)['average']));
    }

    public function test_published_results_keep_their_rules_when_categories_change(): void
    {
        ['five' => $five, 's5' => $s5, 'year' => $year] = $this->setUpClasses();
        $exam = $this->exam($five, $year);
        $student = $this->student($exam, $five, $s5, 'Glory', ['AMATH' => 80, 'PHY' => 70, 'CHEM' => 60, 'ACOM' => 20, 'HTM' => 40]);
        $this->in(fn () => $exam->update(['status' => 'moderation']));
        $this->actingAs($this->admin)->post("/exams/{$exam->id}/status", ['action' => 'publish'])->assertSessionHasNoErrors();
        $this->assertSame('published', $exam->fresh()->status);
        $this->assertNotNull($exam->fresh()->a_level_rules);

        // The school later switches the average to principals only.
        $this->actingAs($this->admin)->put('/academics/a-level-rules/average', ['average' => 'principal'])->assertSessionHasNoErrors();
        $this->school = $this->school->fresh(); // pick up the new setting
        $average = fn (Exam $e, Student $s) => $this->in(fn () => collect(app(ResultsService::class)->classResults($e->fresh(), $five->id)['students'])->firstWhere('id', $s->id)['average']);
        $this->assertSame(54.0, $average($exam, $student), 'Published results are frozen.');

        // Unpublishing for a correction keeps the frozen rules too.
        $this->actingAs($this->admin)->post("/exams/{$exam->id}/status", ['action' => 'unpublish', 'reason' => 'Fix a typo'])->assertSessionHasNoErrors();
        $this->assertSame(54.0, $average($exam, $student));

        // A new, unpublished exam follows the live rules (principals only now).
        $draft = $this->exam($five, $year, 'Terminal');
        $other = $this->student($draft, $five, $s5, 'Upendo', ['AMATH' => 80, 'PHY' => 70, 'CHEM' => 60, 'ACOM' => 20, 'HTM' => 40]);
        $this->assertSame(70.0, $average($draft, $other));
    }

    public function test_promotion_carries_the_cohort_rules_into_the_next_class(): void
    {
        $ctx = $this->setUpClasses();
        ['five' => $five, 'six' => $six] = $ctx;
        $this->legacySchool($ctx);
        $this->actingAs($this->admin)->post('/academics/a-level-rules/adopt', ['class_ids' => [$five->id]])->assertSessionHasNoErrors();
        $this->assertNotNull($six->fresh()->a_level_rules);

        $student = $this->makeStudent($this->school, ['school_class_id' => $five->id]);
        $this->actingAs($this->admin)->post('/students/promotions', [
            'from_class_id' => $five->id, 'to_class_id' => $six->id, 'academic_year_id' => $ctx['year']->id,
            'decisions' => [['student_id' => $student->id, 'action' => 'promote']],
        ])->assertSessionHasNoErrors();

        $this->assertNull($six->fresh()->a_level_rules, 'Form Six now follows the new system its new students started on.');
    }

    public function test_subject_categories_drive_combinations_and_are_protected(): void
    {
        ['pcm' => $pcm, 's5' => $s5] = $this->setUpClasses();
        $physics = $this->in(fn () => Subject::where('code', 'PHY')->firstOrFail());

        // A principal used by a combination cannot lose that role.
        $this->actingAs($this->admin)->put("/academics/subjects/{$physics->id}", ['name' => 'Physics', 'code' => 'PHY', 'type' => 'elective', 'a_level_category' => 'compulsory'])
            ->assertSessionHasErrors('a_level_category');

        // A new compulsory subsidiary reaches every stream on the current rules straight away.
        $this->actingAs($this->admin)->post('/academics/subjects', ['name' => 'Entrepreneurship', 'code' => 'ENT', 'type' => 'core', 'a_level_category' => 'compulsory'])->assertSessionHasNoErrors();
        $ent = $this->in(fn () => Subject::where('code', 'ENT')->value('id'));
        $this->assertTrue($this->in(fn () => ClassSubject::where('stream_id', $s5->id)->where('subject_id', $ent)->exists()));

        // An optional subsidiary that stops being optional leaves its combinations.
        $bam = $this->in(fn () => Subject::where('code', 'BAM')->firstOrFail());
        $pcb = $this->in(fn () => Combination::with('items')->where('code', 'PCB')->firstOrFail());
        $this->assertContains($bam->id, $pcb->optionalIds());
        $this->actingAs($this->admin)->put("/academics/subjects/{$bam->id}", ['name' => $bam->name, 'code' => 'BAM', 'type' => 'core', 'a_level_category' => ''])->assertSessionHasNoErrors();
        $this->assertNotContains($bam->id, $this->in(fn () => $pcb->fresh('items')->optionalIds()));

        $this->actingAs($this->admin)->get('/academics/combinations')->assertOk();
        $this->actingAs($this->admin)->get('/academics/subjects?a_level=principal')->assertOk();
        $this->assertNotNull($pcm);
    }
}
