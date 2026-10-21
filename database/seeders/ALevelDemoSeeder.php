<?php

namespace Database\Seeders;

use App\Http\Controllers\Admissions\JoiningInstructionController;
use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\Combination;
use App\Models\Enrolment;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\Guardian;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Services\Academics\ALevelRules;
use App\Services\Academics\CombinationService;
use App\Services\DocumentNumber;
use App\Services\Exams\ResultsService;
use App\Support\EducationLevel;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * A-Level (Form V–VI) demo for the demo school: standard combinations,
 * Form Five on the new system (Academic Communication + Historia ya Tanzania na Maadili,
 * average of all subjects) and Form Six finishing the old one (General Studies, average of
 * principals), streams by combination, the July–May A-Level
 * calendar, ~60 students, a published midterm graded the ACSEE way, a few
 * TAMISEMI-selected applicants for next intake and a joining-instruction template.
 */
class ALevelDemoSeeder extends Seeder
{
    private const MALE = ['Baraka', 'Juma', 'Emmanuel', 'Hamisi', 'Daudi', 'Godfrey', 'Elia', 'Abdallah', 'Frank', 'Yusuph'];

    private const FEMALE = ['Neema', 'Rehema', 'Asha', 'Glory', 'Zawadi', 'Faraja', 'Mwanaidi', 'Upendo', 'Salma', 'Witness'];

    private const SURNAMES = ['Mushi', 'Mwakyusa', 'Lyimo', 'Kimaro', 'Massawe', 'Njau', 'Komba', 'Mrema', 'Shayo', 'Temba', 'Mollel', 'Kisanga'];

    public function run(): void
    {
        if (Combination::exists()) {
            return; // already seeded
        }
        mt_srand(2027);
        $combos = app(CombinationService::class);
        $combos->seedStandard();

        // Calendar: Form V starts in July; the A-Level year runs to May (ACSEE).
        $now = CarbonImmutable::now();
        $startYear = $now->month >= 7 ? $now->year : $now->year - 1;
        $year = AcademicYear::create([
            'name' => "{$startYear}/".($startYear + 1), 'education_level' => EducationLevel::A_LEVEL,
            'start_date' => "{$startYear}-07-01", 'end_date' => ($startYear + 1).'-05-31', 'is_current' => true,
        ]);
        $term1 = $year->terms()->create(['name' => 'Term I', 'start_date' => "{$startYear}-07-07", 'end_date' => "{$startYear}-12-05", 'is_current' => $now->lt(CarbonImmutable::parse("{$startYear}-12-06"))]);
        $year->terms()->create(['name' => 'Term II', 'start_date' => ($startYear + 1).'-01-08', 'end_date' => ($startYear + 1).'-05-31', 'is_current' => $now->gte(CarbonImmutable::parse("{$startYear}-12-06"))]);
        $nextYear = AcademicYear::create([
            'name' => ($startYear + 1).'/'.($startYear + 2), 'education_level' => EducationLevel::A_LEVEL,
            'start_date' => ($startYear + 1).'-07-01', 'end_date' => ($startYear + 2).'-05-31',
        ]);

        // Form Five / Form Six (re-use classes already named Form V/VI).
        $lastLevel = (int) SchoolClass::max('level');
        $plan = ['Form Five' => ['PCM', 'PCB', 'HGL', 'EGM'], 'Form Six' => ['PCM', 'CBG', 'HGK']];
        $classes = [];
        foreach (array_keys($plan) as $i => $name) {
            $class = SchoolClass::where('education_level', EducationLevel::A_LEVEL)->orderBy('level')->skip($i)->first()
                ?? SchoolClass::create(['name' => $name, 'code' => $i ? 'F6' : 'F5', 'level' => $lastLevel + $i + 1, 'capacity' => 160]);
            $class->update(['education_level' => EducationLevel::A_LEVEL]);
            if ($name === 'Form Six') {
                // The current Form Six started before the reform: it finishes on General Studies.
                $gs = Subject::firstOrCreate(['code' => 'GS'], ['name' => 'General Studies', 'type' => 'core']);
                $class->forceFill(['a_level_rules' => ['label' => 'Old system (General Studies)', 'compulsory' => [$gs->id], 'average' => ALevelRules::AVERAGE_PRINCIPAL]])->save();
            }
            $class->streams()->doesntHave('students')->delete(); // replace empty placeholder streams
            foreach ($plan[$name] as $code) {
                $stream = $class->streams()->create(['name' => $code, 'combination_id' => Combination::where('code', $code)->value('id'), 'capacity' => 40]);
                $combos->syncStreamAllocations($stream);
            }
            $classes[$name] = $class->fresh('streams');
        }

        $admNo = 1;
        foreach ($classes as $name => $class) {
            foreach ($class->streams as $stream) {
                for ($n = 0, $count = mt_rand(7, 10); $n < $count; $n++) {
                    $gender = mt_rand(0, 1) ? 'male' : 'female';
                    $surname = self::SURNAMES[array_rand(self::SURNAMES)];
                    $student = new Student([
                        'first_name' => ($gender === 'male' ? self::MALE : self::FEMALE)[array_rand(self::MALE)],
                        'middle_name' => self::MALE[array_rand(self::MALE)],
                        'last_name' => $surname,
                        'gender' => $gender,
                        'date_of_birth' => $now->subYears($name === 'Form Five' ? 18 : 19)->subDays(mt_rand(0, 360))->toDateString(),
                        'school_class_id' => $class->id,
                        'stream_id' => $stream->id,
                        'residence_type' => 'boarding',
                        'admission_date' => ($name === 'Form Five' ? $startYear : $startYear - 1).'-07-07',
                        'previous_school' => ['Azania Secondary', 'Mzumbe Secondary', 'Kibaha Secondary', 'Tabora Boys', 'Msalato Girls'][mt_rand(0, 4)],
                        'status' => 'active',
                    ]);
                    $student->admission_no = sprintf('MZSS/A%d/%04d', $name === 'Form Five' ? $startYear : $startYear - 1, $admNo++);
                    $student->save();

                    $guardian = Guardian::create(['first_name' => self::MALE[array_rand(self::MALE)], 'last_name' => $surname, 'phone' => '+2557'.mt_rand(10000000, 99999999), 'occupation' => 'Business']);
                    $student->guardians()->attach($guardian->id, ['relationship' => 'Father', 'is_primary' => true]);
                    Enrolment::create(['student_id' => $student->id, 'academic_year_id' => $year->id, 'school_class_id' => $class->id, 'stream_id' => $stream->id, 'status' => 'active', 'start_date' => $year->start_date]);
                }
            }
        }

        $this->midterm($year, $term1, $classes);
        $this->intake($nextYear, $classes['Form Five']);
    }

    /** Published Term I midterm, graded with the ACSEE scale. */
    private function midterm(AcademicYear $year, $term, array $classes): void
    {
        $exam = Exam::create([
            'academic_year_id' => $year->id, 'term_id' => $term->id, 'name' => 'A-Level Term I Midterm', 'type' => 'midterm',
            'start_date' => $term->start_date->addWeeks(9)->toDateString(), 'end_date' => $term->start_date->addWeeks(10)->toDateString(),
            'max_score' => 100, 'weight' => 30, 'status' => 'draft',
        ]);
        $exam->classes()->sync(collect($classes)->pluck('id'));

        $results = app(ResultsService::class);
        foreach ($classes as $class) {
            foreach ($results->streamCombinations($class->id) as $streamId => $combo) {
                foreach (Student::where('stream_id', $streamId)->get() as $student) {
                    $ability = mt_rand(40, 85);
                    foreach ($combo['subjects'] as $subjectId) {
                        $score = max(8, min(98, $ability + mt_rand(-18, 14)));
                        $grade = $results->grade((float) $score, EducationLevel::A_LEVEL);
                        ExamMark::create([
                            'exam_id' => $exam->id, 'student_id' => $student->id, 'subject_id' => $subjectId, 'school_class_id' => $class->id,
                            'score' => $score, 'grade' => $grade['grade'] ?? null, 'points' => $grade['points'] ?? null,
                        ]);
                    }
                }
            }
        }
        $exam->forceFill(['status' => 'published', 'published_at' => $exam->end_date->addDays(5)])->save();
        app(ALevelRules::class)->freeze($exam);
    }

    /** TAMISEMI-selected Form Five applicants for next year, and a joining-instruction template. */
    private function intake(AcademicYear $nextYear, SchoolClass $formFive): void
    {
        foreach ([['Rehema', 'Kimaro', 'female', 'PCB', 'I', 11], ['Daudi', 'Massawe', 'male', 'PCM', 'I', 9], ['Upendo', 'Shayo', 'female', 'HGL', 'II', 18], ['Hamisi', 'Temba', 'male', 'EGM', 'I', 13]] as $i => [$first, $last, $gender, $code, $div, $pts]) {
            $application = new AdmissionApplication([
                'academic_year_id' => $nextYear->id, 'school_class_id' => $formFive->id, 'combination_id' => Combination::where('code', $code)->value('id'),
                'first_name' => $first, 'last_name' => $last, 'gender' => $gender, 'residence_type' => 'boarding',
                'previous_school' => 'Kibaha Secondary School', 'csee_index_no' => sprintf('S0145/%04d/%d', 31 + $i, $nextYear->start_date->year - 1),
                'csee_division' => $div, 'csee_points' => $pts, 'guardian_name' => "Mzee {$last}", 'guardian_phone' => '+2557'.mt_rand(10000000, 99999999),
                'status' => 'accepted', 'source' => 'tamisemi', 'decision_notes' => 'Selected by TAMISEMI (Form Five selection)',
            ]);
            $application->application_no = DocumentNumber::next('application');
            $application->save();
        }

        $school = app(Tenancy::class)->school();
        $settings = $school->settings ?? [];
        $settings[JoiningInstructionController::SETTING] = array_merge(JoiningInstructionController::DEFAULTS, [
            'council' => 'HALMASHAURI YA MANISPAA YA KINONDONI',
            'reference' => 'MZSS/ADM/F5/',
            'reporting_date' => $nextYear->start_date->addDays(6)->toDateString(),
            'directions' => 'Shule ipo Mbezi Beach, Kinondoni. Ukitoka stendi ya Magufuli (Mbezi Luis) panda daladala za Tegeta kupitia Goba, shuka kituo cha Mzenzi. Nauli ni Tsh 1,000/=.',
            'requirements' => "Suruali/sketi za rangi ya dark blue (02)\nMashati meupe mikono mirefu (02)\nViatu vya ngozi vyeusi vyenye kamba jozi mbili (02)\nShuka mbili (cotton) za rangi ya blue\nGodoro futi 2½ × 6 × inchi 4\nChandarua, ndoo mbili za lita 10 na dumu la lita 20\nRimu mbili za karatasi A4",
            'combination_items' => ['PCB' => 'Dissecting kit (seti moja) na white laboratory coat', 'PCM' => 'Scientific calculator (isiyo programmable) na white laboratory coat', 'HGL' => 'Advanced English Oxford Dictionary', 'EGM' => 'Scientific calculator (isiyo programmable)'],
            'contributions' => [['item' => 'Mchango wa uendeshaji wa shule', 'amount' => 65000], ['item' => 'Tahadhari', 'amount' => 5000], ['item' => 'Nembo', 'amount' => 5000], ['item' => 'Kitambulisho cha shule', 'amount' => 5000]],
            'bank_name' => 'NMB', 'account_name' => strtoupper((string) $school->name), 'account_no' => '21101100099', 'branch' => 'NMB Mlimani City',
            'contacts' => "Mkuu wa shule: 0754 000 101\nMakamu mkuu wa shule: 0754 000 102\nTaaluma: 0754 000 103\nMatron (wasichana): 0754 000 104\nPatron (wavulana): 0754 000 105",
            'rules' => "Kila mwanafunzi avae sare za shule kama zilivyoainishwa\nMawasiliano yote shuleni ni kwa lugha ya Kiingereza\nNi marufuku kutoka nje ya eneo la shule bila ruhusa\nNi marufuku kumiliki simu ya mkononi shuleni",
            'motto' => 'Elimu ni ufunguo wa maisha',
            'head_name' => 'Rose Mwakalinga',
        ]);
        $school->settings = $settings;
        $school->save();
    }
}
