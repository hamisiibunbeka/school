<?php

namespace Tests\Feature;

use App\Imports\FormFiveSelectionImporter;
use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\ClassSubject;
use App\Models\Combination;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Term;
use App\Models\User;
use App\Services\Academics\CombinationService;
use App\Services\Exams\ResultsService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ALevelTest extends TestCase
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

    /** Form Five with a PCM stream and a PCB stream, an A-Level year and an exam. */
    private function setUpFormFive(): array
    {
        return $this->in(function () {
            app(CombinationService::class)->seedStandard();
            $class = SchoolClass::create(['name' => 'Form Five', 'level' => 5, 'education_level' => 'a_level']);
            $pcm = Combination::where('code', 'PCM')->first();
            $pcb = Combination::where('code', 'PCB')->first();
            $s1 = $class->streams()->create(['name' => 'A', 'combination_id' => $pcm->id]);
            $s2 = $class->streams()->create(['name' => 'B', 'combination_id' => $pcb->id]);
            foreach ([$s1, $s2] as $s) {
                app(CombinationService::class)->syncStreamAllocations($s);
            }
            $year = AcademicYear::create(['name' => '2026/2027', 'education_level' => 'a_level', 'start_date' => '2026-07-01', 'end_date' => '2027-05-31', 'is_current' => true]);

            return compact('class', 'pcm', 'pcb', 's1', 's2', 'year');
        });
    }

    public function test_acsee_division_matches_necta_published_results(): void
    {
        $r = app(ResultsService::class);
        // Real ACSEE 2025 candidates (Azania Secondary, S0101): principal grades → points → division.
        $cases = [
            [[3, 3, 2], 8, 'I'],     // GEO C, ADV MATHS C, ECON B
            [[3, 2, 1], 6, 'I'],     // PHY C, CHEM B, ADV MATHS A
            [[4, 4, 4], 12, 'II'],   // D D D
            [[4, 3, 3], 10, 'II'],   // PHY D, CHEM C, BIO C (BAM excluded)
            [[5, 6, 5], 16, 'III'],  // E S E
            [[6, 6, 7], 19, 'IV'],   // S S F
            [[7, 7, 7], 21, '0'],    // F F F
        ];
        foreach ($cases as [$points, $total, $division]) {
            $this->assertSame(['division' => $division, 'points' => (float) $total], array_map(fn ($v) => is_int($v) ? (float) $v : $v, $r->aLevelDivision($points)));
        }
        $this->assertSame('INC', $r->aLevelDivision([1, 2])['division']);
        $this->assertSame('IV', $r->aLevelDivision([7, 6, 5])['division']); // 18 → IV
        $this->assertSame('0', $r->aLevelDivision([6, 7, 7])['division']); // 20 → 0
    }

    public function test_standard_combinations_and_bam_choice(): void
    {
        $this->actingAs($this->admin)->post('/academics/combinations/standard')->assertSessionHasNoErrors();

        $codes = $this->in(fn () => Combination::orderBy('code')->pluck('code')->all());
        $this->assertCount(count(CombinationService::STANDARD), $codes);
        $pcb = $this->in(fn () => Combination::with('items.subject')->where('code', 'PCB')->first());
        $this->assertSame(['Biology', 'Chemistry', 'Physics'], $pcb->items->where('role', 'principal')->map->subject->pluck('name')->sort()->values()->all());
        $this->assertEqualsCanonicalizing(['GS', 'BAM'], $pcb->items->where('role', 'subsidiary')->map->subject->pluck('code')->all());

        // The school decides BAM per combination: untick it for PCB.
        $this->actingAs($this->admin)->put("/academics/combinations/{$pcb->id}", [
            'code' => 'PCB', 'name' => $pcb->name, 'principal_subject_ids' => $pcb->principalIds(), 'requires_bam' => false, 'is_active' => true,
        ])->assertSessionHasNoErrors();
        $this->assertSame(['GS'], $this->in(fn () => $pcb->fresh()->items()->where('role', 'subsidiary')->with('subject')->get()->pluck('subject.code')->all()));

        // Exactly three principal subjects, never GS/BAM.
        $gs = $this->in(fn () => Subject::where('code', 'GS')->value('id'));
        $this->actingAs($this->admin)->post('/academics/combinations', ['code' => 'XYZ', 'name' => 'x', 'principal_subject_ids' => [$gs, $pcb->principalIds()[0], $pcb->principalIds()[1]]])
            ->assertSessionHasErrors('principal_subject_ids');
        $this->actingAs($this->admin)->post('/academics/combinations', ['code' => 'XY', 'name' => 'x', 'principal_subject_ids' => [$pcb->principalIds()[0]]])
            ->assertSessionHasErrors('principal_subject_ids');
    }

    public function test_a_level_streams_need_a_combination_and_get_its_subjects(): void
    {
        ['class' => $class, 's1' => $s1, 'pcm' => $pcm] = $this->setUpFormFive();

        $this->actingAs($this->admin)->post("/academics/classes/{$class->id}/streams", ['name' => 'C'])->assertSessionHasErrors('combination_id');
        $this->assertEqualsCanonicalizing(
            $pcm->load('items')->subjectIds(),
            $this->in(fn () => ClassSubject::where('stream_id', $s1->id)->pluck('subject_id')->all()),
        );

        $formOne = $this->in(fn () => SchoolClass::create(['name' => 'Form One', 'level' => 1]));
        $this->actingAs($this->admin)->post("/academics/classes/{$formOne->id}/streams", ['name' => 'A', 'combination_id' => $pcm->id])->assertSessionHasErrors('combination_id');
    }

    public function test_marks_and_results_follow_each_students_combination(): void
    {
        ['class' => $class, 's1' => $s1, 's2' => $s2, 'year' => $year] = $this->setUpFormFive();
        $pcmStudent = $this->makeStudent($this->school, ['school_class_id' => $class->id, 'stream_id' => $s1->id, 'first_name' => 'Pendo']);
        $pcbStudent = $this->makeStudent($this->school, ['school_class_id' => $class->id, 'stream_id' => $s2->id, 'first_name' => 'Baraka']);
        $ids = $this->in(fn () => Subject::pluck('id', 'code'));

        // Exam rules: a single level, and the matching calendar.
        $this->actingAs($this->admin)->post('/exams', ['name' => 'Mixed', 'type' => 'midterm', 'academic_year_id' => $year->id, 'max_score' => 100, 'weight' => 100,
            'class_ids' => [$class->id, $this->in(fn () => SchoolClass::create(['name' => 'Form One', 'level' => 1]))->id]])->assertSessionHasErrors('class_ids');
        $oYear = $this->in(fn () => AcademicYear::create(['name' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31']));
        $this->actingAs($this->admin)->post('/exams', ['name' => 'Wrong year', 'type' => 'midterm', 'academic_year_id' => $oYear->id, 'max_score' => 100, 'weight' => 100, 'class_ids' => [$class->id]])
            ->assertSessionHasErrors('class_ids');
        $this->actingAs($this->admin)->post('/exams', ['name' => 'Form Five Midterm', 'type' => 'midterm', 'academic_year_id' => $year->id, 'max_score' => 100, 'weight' => 100, 'class_ids' => [$class->id]])
            ->assertSessionHasNoErrors();
        $exam = $this->in(fn () => Exam::where('name', 'Form Five Midterm')->firstOrFail());
        $exam->update(['status' => 'marks_entry']);

        // Roster per subject: Advanced Maths only for PCM, Biology and BAM only for PCB, GS for both.
        $roster = fn (string $code) => $this->actingAs($this->admin)->get("/exams/{$exam->id}/marks?class={$class->id}&subject={$ids[$code]}")->viewData('page')['props']['roster'];
        $this->assertSame(['Pendo'], collect($roster('AMATH'))->pluck('full_name')->map(fn ($n) => strtok($n, ' '))->all());
        $this->assertSame(['Baraka'], collect($roster('BAM'))->pluck('full_name')->map(fn ($n) => strtok($n, ' '))->all());
        $this->assertCount(2, $roster('GS'));

        $enter = fn (string $code, array $scores) => $this->actingAs($this->admin)->post("/exams/{$exam->id}/marks", [
            'school_class_id' => $class->id, 'subject_id' => $ids[$code],
            'marks' => collect($scores)->map(fn ($score, $sid) => ['student_id' => $sid, 'score' => $score])->values()->all(),
        ]);
        $enter('PHY', [$pcmStudent->id => 65, $pcbStudent->id => 55])->assertSessionHasNoErrors();   // C, D
        $enter('CHEM', [$pcmStudent->id => 72, $pcbStudent->id => 62])->assertSessionHasNoErrors();  // B, C
        $enter('AMATH', [$pcmStudent->id => 85])->assertSessionHasNoErrors();                         // A
        $enter('BIO', [$pcbStudent->id => 61])->assertSessionHasNoErrors();                           // C
        $enter('GS', [$pcmStudent->id => 20, $pcbStudent->id => 30])->assertSessionHasNoErrors();    // F — never counted
        $enter('BAM', [$pcbStudent->id => 45])->assertSessionHasNoErrors();                           // E — never counted
        // A PCM student cannot get a Biology mark.
        $enter('BIO', [$pcmStudent->id => 90]);
        $this->assertNull($this->in(fn () => ExamMark::where('student_id', $pcmStudent->id)->where('subject_id', $ids['BIO'])->first()));

        $this->assertSame('A', $this->in(fn () => ExamMark::where('student_id', $pcmStudent->id)->where('subject_id', $ids['AMATH'])->value('grade')));
        $this->assertSame('1.0', (string) $this->in(fn () => ExamMark::where('student_id', $pcmStudent->id)->where('subject_id', $ids['AMATH'])->value('points')));

        $analysis = $this->in(fn () => app(ResultsService::class)->classResults($exam, $class->id));
        $rows = collect($analysis['students'])->keyBy('id');
        $this->assertSame('a_level', $analysis['level']);
        // PCM: C(3)+B(2)+A(1) = 6 → Div I, despite GS F.
        $this->assertSame(['I', 6.0, 'PCM'], [$rows[$pcmStudent->id]['division'], $rows[$pcmStudent->id]['points'], $rows[$pcmStudent->id]['combination']]);
        // PCB: D(4)+C(3)+C(3) = 10 → Div II; BAM E and GS F excluded.
        $this->assertSame(['II', 10.0], [$rows[$pcbStudent->id]['division'], $rows[$pcbStudent->id]['points']]);
        $this->assertSame('subsidiary', $rows[$pcbStudent->id]['marks'][$ids['BAM']]['role']);
        $this->assertSame(1, $rows[$pcmStudent->id]['position']);
        $this->assertSame(['I' => 1, 'II' => 0, 'III' => 0, 'IV' => 0, '0' => 0, 'INC' => 0], $analysis['combinations']['PCM']);
    }

    public function test_separate_calendars_and_no_promotion_into_form_five(): void
    {
        ['class' => $formFive, 'year' => $aYear] = $this->setUpFormFive();
        [$formFour, $oYear] = $this->in(fn () => [
            SchoolClass::create(['name' => 'Form Four', 'level' => 4]),
            AcademicYear::create(['name' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'is_current' => true]),
        ]);

        // Each level keeps its own current year.
        $this->actingAs($this->admin)->post("/academics/years/{$oYear->id}/current")->assertSessionHasNoErrors();
        $this->assertTrue($aYear->fresh()->is_current);
        $this->assertSame($aYear->id, $this->in(fn () => AcademicYear::current('a_level')->id));
        $this->assertSame($oYear->id, $this->in(fn () => AcademicYear::current()->id));
        $term = $this->in(fn () => $aYear->terms()->create(['name' => 'Term I', 'start_date' => '2026-07-01', 'end_date' => '2026-12-10', 'is_current' => true]));
        $this->assertSame($term->id, $this->in(fn () => Term::current('a_level')?->id));
        $oTerm = $this->in(fn () => Term::current());
        $this->assertNotSame($term->id, $oTerm?->id, 'Setting an A-Level term current must not change the O-Level current term.');
        $this->assertTrue($oTerm === null || $oTerm->academicYear->education_level === 'o_level');

        $student = $this->makeStudent($this->school, ['school_class_id' => $formFour->id]);
        $this->actingAs($this->admin)->post('/students/promotions', [
            'from_class_id' => $formFour->id, 'to_class_id' => $formFive->id, 'academic_year_id' => $aYear->id,
            'decisions' => [['student_id' => $student->id, 'action' => 'promote']],
        ])->assertSessionHasErrors('to_class_id');
        $this->assertSame($formFour->id, $student->fresh()->school_class_id);
    }

    public function test_selection_import_and_joining_instructions(): void
    {
        ['class' => $class, 's2' => $pcbStream] = $this->setUpFormFive();

        $importer = new FormFiveSelectionImporter;
        $preview = $this->in(fn () => $importer->preview([
            ['First Name', 'Last Name', 'Sex', 'Combination', 'CSEE Index No', 'Division', 'Points', 'Previous School'],
            ['Neema', 'Mushi', 'F', 'pcb', 'S0101/0001/2025', 'I', '12', 'Azania'],
            ['Juma', 'Ali', 'M', 'ZZZ', 'S0101/0002/2025', 'II', '19', 'Azania'],
        ]));
        $this->assertSame(1, collect($preview['rows'])->where('errors', [])->count());
        $this->in(fn () => $importer->commit($preview['rows']));

        $app = $this->in(fn () => AdmissionApplication::firstOrFail());
        $this->assertSame(['accepted', 'tamisemi', 'PCB', $class->id], [$app->status, $app->source, $app->combination->code, $app->school_class_id]);

        $this->actingAs($this->admin)->put('/admissions/joining-instructions', [
            'subject' => 'YAH: KUJIUNGA NA KIDATO CHA TANO {school_name} MWAKA {year}',
            'intro' => 'Umepangiwa tahasusi ya {combination}.',
            'combination_items' => ['PCB' => 'Dissecting kit - moja'],
            'contributions' => [['item' => 'Mchango wa uendeshaji', 'amount' => 65000]],
            'include_acceptance_form' => true, 'include_medical_form' => true,
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->admin)->get("/admissions/joining-instructions/print?application={$app->id}")->assertInertia(fn (Assert $p) => $p
            ->component('admissions/joining-instruction-print')
            ->has('letters', 1)
            ->where('letters.0.combination', 'PCB')
            ->where('letters.0.combination_items', 'Dissecting kit - moja')
            ->where('template.contributions.0.amount', 65000));

        // Enrolment suggests the PCB stream; the student lands in the A-Level year.
        $this->actingAs($this->admin)->get("/admissions/{$app->id}")->assertInertia(fn (Assert $p) => $p->where('application.combination', 'PCB'));
        $app->update(['date_of_birth' => '2008-01-01']);
        $this->actingAs($this->admin)->post("/admissions/{$app->id}/enrol", ['school_class_id' => $class->id, 'stream_id' => $pcbStream->id, 'admission_date' => now()->toDateString()])->assertSessionHasNoErrors();
        // No fees are billed in this setup, so finance can clear the student straight away.
        $this->actingAs($this->admin)->post("/fees/clearance/{$app->id}/verify")->assertSessionHasNoErrors();
        $student = $this->in(fn () => Student::where('first_name', 'Neema')->firstOrFail());
        $this->assertSame($pcbStream->id, $student->stream_id);
        $this->assertSame('a_level', $this->in(fn () => $student->enrolments()->first()->academicYear->education_level));
    }

    public function test_pages_render(): void
    {
        $this->setUpFormFive();
        foreach (['/academics/combinations', '/academics/classes', '/academics/years', '/exams/grading?level=a_level', '/admissions/joining-instructions', '/admissions/create'] as $url) {
            $this->actingAs($this->admin)->get($url)->assertOk();
        }
        $this->actingAs($this->admin)->get('/exams/grading?level=a_level')->assertInertia(fn (Assert $p) => $p->where('grades.0.grade', 'A')->where('grades.6.grade', 'F')->has('grades', 7));
    }
}
