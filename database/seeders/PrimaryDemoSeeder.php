<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\ClassSubject;
use App\Models\Employee;
use App\Models\Enrolment;
use App\Models\Exam;
use App\Models\FeeCategory;
use App\Models\FeeInstallment;
use App\Models\FeeStructure;
use App\Models\Guardian;
use App\Models\Invoice;
use App\Models\Role;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Term;
use App\Models\User;
use App\Services\Exams\ResultsService;
use App\Services\Fees\BillingService;
use App\Services\Fees\PaymentService;
use App\Support\EducationLevel;
use App\Support\Tenancy;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo data for Mzenzi Primary School (the tenant's second campus): Nursery (Baby, Middle, Pre-Unit) and
 * Standard I–VII, teachers, ~200 pupils with guardians, published PSLE-style exams (average grade, no
 * divisions), Term I & II fees with payments and installment settings. Login: primary@mzenzi.test.
 */
class PrimaryDemoSeeder extends Seeder
{
    private const MALE = ['Baraka', 'Juma', 'Emmanuel', 'Hamisi', 'Daudi', 'Godfrey', 'Elia', 'Abdallah', 'Frank', 'Yusuph', 'Ally', 'Musa', 'Rajabu', 'Kelvin'];

    private const FEMALE = ['Neema', 'Rehema', 'Asha', 'Glory', 'Zawadi', 'Faraja', 'Mwanaidi', 'Upendo', 'Salma', 'Witness', 'Amina', 'Halima', 'Joyce', 'Saida'];

    private const SURNAMES = ['Mushi', 'Mwakyusa', 'Lyimo', 'Kimaro', 'Massawe', 'Njau', 'Komba', 'Mrema', 'Shayo', 'Temba', 'Mollel', 'Kisanga', 'Mapunda', 'Haule', 'Mfinanga'];

    /** name, code, level, education level, streams, tuition per term */
    private const CLASSES = [
        ['Baby Class', 'BC', 1, EducationLevel::PRE_PRIMARY, ['A'], 250000],
        ['Middle Class', 'MC', 2, EducationLevel::PRE_PRIMARY, ['A'], 250000],
        ['Pre-Unit', 'PU', 3, EducationLevel::PRE_PRIMARY, ['A'], 270000],
        ['Standard One', 'STD1', 4, EducationLevel::PRIMARY, ['A', 'B'], 300000],
        ['Standard Two', 'STD2', 5, EducationLevel::PRIMARY, ['A'], 300000],
        ['Standard Three', 'STD3', 6, EducationLevel::PRIMARY, ['A'], 320000],
        ['Standard Four', 'STD4', 7, EducationLevel::PRIMARY, ['A'], 340000],
        ['Standard Five', 'STD5', 8, EducationLevel::PRIMARY, ['A'], 350000],
        ['Standard Six', 'STD6', 9, EducationLevel::PRIMARY, ['A'], 360000],
        ['Standard Seven', 'STD7', 10, EducationLevel::PRIMARY, ['A', 'B'], 380000],
    ];

    /** name, code, level it is taught at */
    private const SUBJECTS = [
        ['Kiswahili', 'KIS', EducationLevel::PRIMARY],
        ['English', 'ENG', EducationLevel::PRIMARY],
        ['Hisabati', 'HIS', EducationLevel::PRIMARY],
        ['Sayansi na Teknolojia', 'SAY', EducationLevel::PRIMARY],
        ['Maarifa ya Jamii', 'MAJ', EducationLevel::PRIMARY],
        ['Uraia na Maadili', 'URA', EducationLevel::PRIMARY],
        ['Kusoma', 'KUS', EducationLevel::PRE_PRIMARY],
        ['Kuandika', 'KUA', EducationLevel::PRE_PRIMARY],
        ['Kuhesabu', 'KUH', EducationLevel::PRE_PRIMARY],
        ['Mazingira na Afya', 'MZA', EducationLevel::PRE_PRIMARY],
    ];

    public function run(): void
    {
        if (SchoolClass::exists()) {
            $this->command?->warn('Primary demo data already present — skipped.');

            return;
        }
        mt_srand(2027);
        $school = app(Tenancy::class)->school();
        $school->update(['motto' => 'Elimu Bora kwa Kila Mtoto', 'address' => 'P.O. Box 1250, Mbezi Beach, Dar es Salaam', 'region' => 'Dar es Salaam', 'registration_no' => 'EM.10432', 'phone' => '+255 754 000 210', 'email' => 'primary@mzenzi.test']);

        // ---------- Head teacher (login) and teachers ----------
        $roles = Role::where('tenant_id', $school->tenant_id)->pluck('id', 'slug');
        $head = new User(['name' => 'Joyce Mapunda', 'email' => 'primary@mzenzi.test', 'password' => 'password', 'role_id' => $roles['school-admin'], 'school_id' => $school->id, 'status' => 'active']);
        $head->tenant_id = $school->tenant_id;
        $head->email_verified_at = now();
        $head->save();
        auth()->setUser($head);

        $teachers = collect([['Joyce', 'Mapunda', 'female', 'Head Teacher', $head->id, 'primary@mzenzi.test'], ['Peter', 'Urassa', 'male', 'Deputy Head Teacher'], ['Mary', 'Shirima', 'female', 'Teacher'],
            ['John', 'Kapinga', 'male', 'Teacher'], ['Anna', 'Makame', 'female', 'Teacher'], ['Elisha', 'Mfinanga', 'male', 'Teacher'], ['Grace', 'Lema', 'female', 'Teacher'],
            ['Omari', 'Kombo', 'male', 'Teacher'], ['Rose', 'Ngowi', 'female', 'Nursery Teacher'], ['Fatuma', 'Bakari', 'female', 'Nursery Teacher'], ['Hassani', 'Chacha', 'male', 'Teacher']])
            ->map(fn ($t, $i) => Employee::create([
                'employee_no' => sprintf('MZPS-%03d', $i + 1), 'user_id' => $t[4] ?? null, 'first_name' => $t[0], 'last_name' => $t[1], 'gender' => $t[2],
                'date_of_birth' => now()->subYears(mt_rand(26, 52))->toDateString(), 'phone' => '+2557'.mt_rand(10000000, 99999999),
                'email' => $t[5] ?? strtolower("{$t[0]}.{$t[1]}.mzps@mzenzi.test"), 'designation' => $t[3], 'category' => 'teaching',
                'employment_type' => 'permanent', 'hire_date' => now()->subYears(mt_rand(1, 10))->toDateString(), 'basic_salary' => mt_rand(8, 13) * 100000,
                'qualification' => $this->pick(['Certificate in Education (Grade IIIA)', 'Diploma in Education', 'B.Ed (Primary)']), 'status' => 'active',
            ]));
        $nurseryTeachers = $teachers->filter(fn ($t) => $t->designation === 'Nursery Teacher')->values();
        $primaryTeachers = $teachers->reject(fn ($t) => $t->designation === 'Nursery Teacher')->values();

        // ---------- Subjects, classes, streams, allocations ----------
        $subjects = collect(self::SUBJECTS)->map(fn ($s) => Subject::create(['name' => $s[0], 'code' => $s[1], 'type' => 'core']));
        $subjectLevel = collect(self::SUBJECTS)->mapWithKeys(fn ($s) => [$s[1] => $s[2]]);

        $classes = collect(self::CLASSES)->map(function ($c, $ci) use ($subjects, $subjectLevel, $nurseryTeachers, $primaryTeachers) {
            [$name, $code, $level, $educationLevel, $streams] = $c;
            $class = SchoolClass::create(['name' => $name, 'code' => $code, 'level' => $level, 'education_level' => $educationLevel, 'capacity' => 45 * count($streams)]);
            $pool = $educationLevel === EducationLevel::PRE_PRIMARY ? $nurseryTeachers : $primaryTeachers;
            foreach ($streams as $si => $stream) {
                $class->streams()->create(['name' => $stream, 'capacity' => 45, 'class_teacher_id' => $pool[($ci + $si) % $pool->count()]->id]);
            }
            foreach ($subjects as $si => $subject) {
                if ($subjectLevel[$subject->code] !== $educationLevel) {
                    continue;
                }
                ClassSubject::create(['school_class_id' => $class->id, 'subject_id' => $subject->id, 'employee_id' => $pool[($si + $ci) % $pool->count()]->id,
                    'periods_per_week' => in_array($subject->code, ['KIS', 'ENG', 'HIS', 'KUS', 'KUH'], true) ? 7 : 5]);
            }

            return $class->load('streams');
        });

        // ---------- Pupils, guardians, enrolments ----------
        $year = AcademicYear::current();
        $admNo = 1;
        foreach ($classes as $class) {
            foreach ($class->streams as $stream) {
                for ($i = 0, $count = mt_rand(14, 20); $i < $count; $i++) {
                    $gender = mt_rand(0, 1) ? 'male' : 'female';
                    $surname = $this->pick(self::SURNAMES);
                    $student = new Student([
                        'first_name' => $this->pick($gender === 'male' ? self::MALE : self::FEMALE), 'middle_name' => $this->pick(self::MALE), 'last_name' => $surname,
                        'gender' => $gender, 'date_of_birth' => now()->subYears(2 + $class->level)->subDays(mt_rand(0, 360))->toDateString(),
                        'school_class_id' => $class->id, 'stream_id' => $stream->id, 'residence_type' => 'day',
                        'admission_date' => now()->startOfYear()->subYears(max(0, $class->level - 1))->addDays(7)->toDateString(),
                        'address' => $this->pick(['Mbezi Beach', 'Tegeta', 'Goba', 'Bunju', 'Kunduchi', 'Salasala']).', Dar es Salaam', 'status' => 'active',
                    ]);
                    $student->admission_no = sprintf('MZPS/%d/%04d', (int) now()->format('Y') - max(0, $class->level - 1), $admNo++);
                    $student->save();

                    $guardian = Guardian::create(['first_name' => $this->pick(mt_rand(0, 1) ? self::MALE : self::FEMALE), 'last_name' => $surname,
                        'phone' => '+2557'.mt_rand(10000000, 99999999), 'occupation' => $this->pick(['Business', 'Teacher', 'Nurse', 'Farmer', 'Civil Servant', 'Driver']), 'address' => $student->address]);
                    $student->guardians()->attach($guardian->id, ['relationship' => $this->pick(['Father', 'Mother', 'Guardian']), 'is_primary' => true]);
                    Enrolment::create(['student_id' => $student->id, 'academic_year_id' => $year->id, 'school_class_id' => $class->id, 'stream_id' => $stream->id, 'status' => 'active', 'start_date' => $year->start_date]);
                }
            }
        }

        $this->exams($year, $classes, $head);
        $this->fees($year, $classes);
        auth()->forgetUser();

        $this->command?->info(sprintf('Primary demo: %d classes, %d pupils, %d invoices.', $classes->count(), Student::count(), Invoice::count()));
    }

    /** Published PSLE-style exams: Term I midterm (Std I–VI), Mock PSLE out of 50 (Std VII), nursery assessment. */
    private function exams(AcademicYear $year, $classes, User $head): void
    {
        $terms = Term::where('academic_year_id', $year->id)->orderBy('start_date')->get();
        $termOne = $terms->first();
        $byLevel = $classes->groupBy('education_level');
        $std7 = $classes->firstWhere('code', 'STD7');
        $start = CarbonImmutable::parse($termOne?->start_date ?? $year->start_date);

        $plan = [
            ['Term I Midterm', 'midterm', 100, $byLevel[EducationLevel::PRIMARY]->reject(fn ($c) => $c->code === 'STD7'), $start->addWeeks(8)],
            ['Mock PSLE', 'mock', 50, collect([$std7]), $start->addWeeks(14)],
            ['Nursery Term I Assessment', 'end_of_term', 100, $byLevel[EducationLevel::PRE_PRIMARY], $start->addWeeks(16)],
        ];

        $results = app(ResultsService::class);
        $ability = [];
        foreach ($plan as [$name, $type, $max, $examClasses, $date]) {
            $exam = Exam::create([
                'academic_year_id' => $year->id, 'term_id' => $termOne?->id, 'name' => $name, 'type' => $type,
                'start_date' => $date->toDateString(), 'end_date' => $date->addDays(4)->toDateString(), 'max_score' => $max, 'weight' => 100,
                'status' => 'published', 'published_at' => $date->addDays(12)->setTime(10, 0), 'published_by' => $head->id,
            ]);
            $exam->classes()->sync($examClasses->pluck('id')->all());

            $rows = [];
            foreach ($examClasses as $class) {
                $subjectIds = ClassSubject::where('school_class_id', $class->id)->pluck('subject_id');
                foreach (Student::where('school_class_id', $class->id)->pluck('id') as $studentId) {
                    $ability[$studentId] ??= mt_rand(28, 92);
                    foreach ($subjectIds as $subjectId) {
                        $absent = mt_rand(1, 200) === 1;
                        $pct = max(4, min(99, $ability[$studentId] + mt_rand(-14, 12)));
                        $score = $absent ? null : (int) round($pct * $max / 100);
                        $grade = $absent ? null : $results->grade($results->percentage($exam, $score), $class->education_level);
                        $rows[] = [
                            'tenant_id' => $class->tenant_id, 'school_id' => $class->school_id, 'exam_id' => $exam->id, 'student_id' => $studentId, 'subject_id' => $subjectId,
                            'school_class_id' => $class->id, 'score' => $score, 'is_absent' => $absent, 'grade' => $grade['grade'] ?? null, 'points' => $grade['points'] ?? null,
                            'remarks' => $absent ? 'Sick on exam day' : null, 'entered_by' => $head->id, 'created_at' => $date->addDays(5), 'updated_at' => now(),
                        ];
                    }
                }
            }
            foreach (array_chunk($rows, 1000) as $chunk) {
                DB::table('exam_marks')->insert($chunk);
            }
        }
    }

    /** Term I & II fee structures, invoices through BillingService, receipts through PaymentService, installments. */
    private function fees(AcademicYear $year, $classes): void
    {
        $terms = Term::where('academic_year_id', $year->id)->orderBy('start_date')->get();
        $cats = FeeCategory::pluck('id', 'code');
        $tuition = collect(self::CLASSES)->mapWithKeys(fn ($c) => [$c[1] => $c[5]]);

        foreach ($terms as $term) {
            foreach ($classes as $class) {
                foreach ([['TUI', $tuition[$class->code]], ['MEL', 120000], ['EXM', $class->code === 'STD7' ? 40000 : 20000]] as [$code, $amount]) {
                    if (isset($cats[$code])) {
                        FeeStructure::create(['academic_year_id' => $year->id, 'term_id' => $term->id, 'school_class_id' => $class->id, 'fee_category_id' => $cats[$code],
                            'residence_type' => 'all', 'amount' => $amount, 'due_date' => CarbonImmutable::parse($term->start_date)->addDays(30)->toDateString()]);
                    }
                }
            }
        }

        // Installment settings: two halves of the year's fees.
        foreach ([['1st installment', 50, $year->start_date], ['2nd installment', 50, $terms->last()?->start_date ?? $year->start_date]] as $i => [$name, $percent, $due]) {
            FeeInstallment::create(['academic_year_id' => $year->id, 'sequence' => $i + 1, 'name' => $name, 'percent' => $percent, 'due_date' => CarbonImmutable::parse($due)->addDays(30)->toDateString()]);
        }

        $billing = app(BillingService::class);
        $payments = app(PaymentService::class);
        $classIds = $classes->pluck('id')->all();
        $today = CarbonImmutable::today();

        foreach ($terms as $ti => $term) {
            $termStart = CarbonImmutable::parse($term->start_date);
            if ($termStart->gt($today)) {
                continue;
            }
            $billing->generate($term, $classIds, $termStart->toDateString(), null, "{$term->name} fees");

            foreach (Invoice::with('student')->where('term_id', $term->id)->get() as $invoice) {
                $balance = (int) round((float) $invoice->fresh()->balance);
                $roll = mt_rand(1, 100);
                // Term I: most paid in full; current term: a mix of full, part and nothing yet.
                $target = $ti === 0
                    ? ($roll <= 88 ? $balance : ($roll <= 96 ? (int) (round($balance * mt_rand(40, 80) / 100 / 5000) * 5000) : 0))
                    : ($roll <= 40 ? $balance : ($roll <= 80 ? (int) (round($balance * mt_rand(30, 70) / 100 / 5000) * 5000) : 0));
                $paid = 0;
                $last = min($today, CarbonImmutable::parse($term->end_date));
                while ($paid < $target) {
                    $amount = min($target - $paid, mt_rand(1, 3) === 1 ? $target - $paid : (int) (ceil(($target - $paid) / 2 / 5000) * 5000));
                    $method = $this->pick(['mobile_money', 'mobile_money', 'bank', 'cash']);
                    $date = $termStart->addDays(mt_rand(0, max(1, (int) $termStart->diffInDays($last))));
                    $payments->receive([
                        'student_id' => $invoice->student_id, 'amount' => (string) $amount, 'method' => $method,
                        'reference' => $method === 'cash' ? null : strtoupper(substr($method, 0, 2)).$date->format('ymd').mt_rand(100000, 999999),
                        'payer_name' => $invoice->student?->guardians()->first()?->full_name, 'payment_date' => $date->toDateString(),
                    ], audit: false);
                    $paid += $amount;
                }
            }
        }
    }

    /** @param  array<int, mixed>  $items */
    private function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }
}
