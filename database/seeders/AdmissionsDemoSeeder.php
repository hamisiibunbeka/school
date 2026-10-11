<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\AuditLog;
use App\Models\Enrolment;
use App\Models\Guardian;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\User;
use App\Services\DocumentNumber;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * ~35 admission applications across every workflow status: next year's
 * Form One intake plus a couple of mid-year transfers already enrolled.
 *
 * Runs inside the demo school's tenancy context (see DatabaseSeeder).
 */
class AdmissionsDemoSeeder extends Seeder
{
    private const MALE = ['Baraka', 'Juma', 'Emmanuel', 'Hassani', 'Godfrey', 'Amani', 'Brian', 'Daudi', 'Rajabu', 'Elia', 'Frank', 'Kelvin', 'Salum', 'Ibrahim', 'Joseph', 'Abdallah', 'Erick', 'Nassoro', 'Yusuph', 'Felix'];

    private const FEMALE = ['Neema', 'Rehema', 'Zawadi', 'Upendo', 'Mwanaidi', 'Faraja', 'Halima', 'Grace', 'Agnes', 'Saida', 'Imani', 'Joyce', 'Witness', 'Aisha', 'Esther', 'Happiness', 'Rose', 'Mariamu', 'Tumaini', 'Anna'];

    private const SURNAMES = ['Mushi', 'Kimaro', 'Massawe', 'Mwakyusa', 'Mollel', 'Shirima', 'Lyimo', 'Mrema', 'Mwinyi', 'Kombo', 'Haule', 'Ngowi', 'Swai', 'Temba', 'Urassa', 'Kapinga', 'Mapunda', 'Mbwambo', 'Chacha', 'Makame', 'Lema', 'Komba', 'Magesa', 'Ndunguru', 'Nyirenda', 'Mfinanga', 'Kisanga', 'Mtei', 'Bakari', 'Sanga'];

    private const SCHOOLS = ['Mlimani Primary School', 'Kijitonyama Primary School', 'Mbezi Beach Primary School', 'Uhuru Primary School', 'Bunge Primary School', 'Olympio Primary School', 'Msasani Primary School', 'Mapambano Primary School', 'Arusha School', 'Moshi Primary School', 'Sinza Primary School', 'Tegeta English Medium School'];

    private const ADDRESSES = ['Sinza, Ubungo, Dar es Salaam', 'Mbezi Beach, Kinondoni, Dar es Salaam', 'Tegeta, Kinondoni, Dar es Salaam', 'Kimara, Ubungo, Dar es Salaam', 'Njiro, Arusha', 'Kilimahewa, Mwanza', 'Kisasa, Dodoma', 'Moshi Mjini, Kilimanjaro', 'Mikocheni, Dar es Salaam', 'Goba, Ubungo, Dar es Salaam', 'Bunju, Kinondoni, Dar es Salaam'];

    private const MEDICAL = ['Asthmatic — carries an inhaler.', 'Allergic to penicillin.', 'Wears spectacles; should sit near the front.', 'Mild sickle-cell trait; avoid strenuous exercise in heat.', 'Peanut allergy.'];

    private const DECISION_NOTES = [
        'accepted' => ['Strong PSLE results and good interview performance.', 'Met admission criteria; assessment score above cut-off.', 'Good overall assessment; place offered.'],
        'waitlisted' => ['Meets criteria but Form One places are currently full; waitlisted.', 'Borderline assessment score; waitlisted pending acceptances.'],
        'rejected' => ['Assessment score below the admission cut-off of 45%.', 'Applicant did not attend the scheduled interview.', 'Incomplete documents after two reminders.'],
        'withdrawn' => ['Parent informed the office that the learner has joined another school.'],
    ];

    public function run(): void
    {
        mt_srand(7311);

        $current = AcademicYear::current();
        $nextName = (string) ((int) now()->format('Y') + 1);
        $next = AcademicYear::firstOrCreate(['name' => $nextName], [
            'start_date' => "{$nextName}-01-11",
            'end_date' => "{$nextName}-12-03",
            'is_current' => false,
        ]);
        $next->terms()->firstOrCreate(['name' => 'Term I'], ['start_date' => "{$nextName}-01-11", 'end_date' => "{$nextName}-06-04", 'is_current' => false]);
        $next->terms()->firstOrCreate(['name' => 'Term II'], ['start_date' => "{$nextName}-07-05", 'end_date' => "{$nextName}-12-03", 'is_current' => false]);

        $formOne = SchoolClass::with('streams')->orderBy('level')->first();
        $formTwo = SchoolClass::with('streams')->where('level', 2)->first() ?? $formOne;
        $officer = User::where('email', 'admissions@mzenzi.test')->value('id') ?? User::where('email', 'admin@mzenzi.test')->value('id');
        $principal = User::where('email', 'principal@mzenzi.test')->value('id') ?? $officer;

        $plan = [
            'submitted' => 8,
            'under_review' => 6,
            'interview' => 6,
            'accepted' => 6,
            'waitlisted' => 3,
            'rejected' => 3,
            'withdrawn' => 1,
            'enrolled' => 2,
        ];

        $today = CarbonImmutable::now();

        foreach ($plan as $status => $count) {
            for ($i = 0; $i < $count; $i++) {
                $gender = mt_rand(0, 1) ? 'male' : 'female';
                $first = $this->pick($gender === 'male' ? self::MALE : self::FEMALE);
                $surname = $this->pick(self::SURNAMES);
                $guardianMale = mt_rand(0, 1) === 1;
                $enrolledTransfer = $status === 'enrolled';

                // Next-year Form One intake applied Aug–Oct; transfers applied mid-year.
                $appliedAt = $enrolledTransfer
                    ? $today->subDays(mt_rand(80, 110))->setTime(mt_rand(8, 15), mt_rand(0, 59))
                    : $today->subDays(match ($status) {
                        'submitted' => mt_rand(0, 12),
                        'under_review' => mt_rand(10, 25),
                        default => mt_rand(25, 65),
                    })->setTime(mt_rand(8, 15), mt_rand(0, 59));

                $application = new AdmissionApplication([
                    'academic_year_id' => $enrolledTransfer ? $current?->id : $next->id,
                    'school_class_id' => $enrolledTransfer ? $formTwo?->id : $formOne?->id,
                    'first_name' => $first,
                    'middle_name' => $this->pick(self::MALE),
                    'last_name' => $surname,
                    'gender' => $gender,
                    'date_of_birth' => $today->subYears($enrolledTransfer ? 14 : 13)->subDays(mt_rand(0, 360))->toDateString(),
                    'residence_type' => mt_rand(1, 100) <= 45 ? 'boarding' : 'day',
                    'previous_school' => $enrolledTransfer ? $this->pick(['Azania Secondary School', 'Jangwani Secondary School', 'Moshi Secondary School']) : $this->pick(self::SCHOOLS),
                    'guardian_name' => $this->pick($guardianMale ? self::MALE : self::FEMALE).' '.$surname,
                    'guardian_relationship' => $guardianMale ? 'Father' : $this->pick(['Mother', 'Mother', 'Guardian']),
                    'guardian_phone' => '+2557'.mt_rand(10000000, 99999999),
                    'guardian_email' => mt_rand(0, 2) ? strtolower($first.'.'.$surname).mt_rand(1, 99).'@gmail.com' : null,
                    'address' => $this->pick(self::ADDRESSES),
                    'medical_notes' => mt_rand(1, 6) === 1 ? $this->pick(self::MEDICAL) : null,
                    'notes' => mt_rand(0, 1) ? $this->pick(['Birth certificate and PSLE slip received.', 'Application fee TZS 20,000 paid.', 'Sibling currently in Form Three.', 'Documents pending: medical form.']) : null,
                ]);
                $application->application_no = DocumentNumber::next('application');
                $application->status = 'submitted';
                $application->created_at = $appliedAt;
                $application->updated_at = $appliedAt;
                $application->save();

                $this->log($application, $officer, 'submitted', "Application {$application->application_no} submitted for {$application->full_name}", $appliedAt);

                // Walk the workflow up to the target status.
                $path = match ($status) {
                    'submitted' => [],
                    'under_review' => ['under_review'],
                    'interview' => ['under_review', 'interview'],
                    'accepted', 'waitlisted' => ['under_review', 'interview', $status],
                    'rejected' => mt_rand(0, 1) ? ['under_review', 'interview', 'rejected'] : ['under_review', 'rejected'],
                    'withdrawn' => ['under_review', 'withdrawn'],
                    'enrolled' => ['under_review', 'interview', 'accepted'],
                };

                $at = $appliedAt;
                $from = 'submitted';
                foreach ($path as $step) {
                    $at = $at->addDays(mt_rand(2, 6))->setTime(mt_rand(8, 16), mt_rand(0, 59));
                    if ($at->greaterThan($today)) {
                        $at = $today->subHours(mt_rand(1, 20));
                    }
                    $by = in_array($step, ['accepted', 'rejected', 'waitlisted'], true) ? $principal : $officer;
                    $notes = self::DECISION_NOTES[$step] ?? null;

                    $application->status = $step;
                    if ($step === 'interview') {
                        $application->interview_date = $status === 'interview'
                            ? $today->addDays(mt_rand(1, 14))->toDateString()
                            : $at->addDays(mt_rand(1, 4))->toDateString();
                    }
                    if (in_array($step, ['accepted', 'waitlisted', 'rejected'], true) && $application->interview_date) {
                        $application->assessment_score = match ($step) {
                            'accepted' => mt_rand(62, 92),
                            'waitlisted' => mt_rand(48, 60),
                            default => mt_rand(22, 44),
                        };
                    }
                    if ($notes) {
                        $application->decision_notes = $this->pick($notes);
                    }
                    $application->decided_by = $by;
                    $application->decided_at = $at;
                    $application->updated_at = $at;
                    $application->save();

                    $this->log($application, $by, 'status_changed', "Application {$application->application_no}: {$from} → {$step}".($notes ? " — {$application->decision_notes}" : ''), $at, ['status' => $from], ['status' => $step]);
                    $from = $step;
                }

                if ($enrolledTransfer && $formTwo) {
                    $this->enrol($application, $formTwo, $current, $officer, $at->addDays(3));
                }
            }
        }
    }

    /** Mirror AdmissionController::enrol for the seeded transfer students. */
    private function enrol(AdmissionApplication $application, SchoolClass $class, ?AcademicYear $year, ?int $by, CarbonImmutable $at): void
    {
        $stream = $class->streams->get(mt_rand(0, max(0, $class->streams->count() - 1)));

        $student = new Student([
            'first_name' => $application->first_name,
            'middle_name' => $application->middle_name,
            'last_name' => $application->last_name,
            'gender' => $application->gender,
            'date_of_birth' => $application->date_of_birth,
            'address' => $application->address,
            'school_class_id' => $class->id,
            'stream_id' => $stream?->id,
            'residence_type' => $application->residence_type,
            'admission_date' => $at->toDateString(),
            'previous_school' => $application->previous_school,
            'medical_notes' => $application->medical_notes,
            'status' => 'active',
        ]);
        $student->admission_no = DocumentNumber::next('admission');
        $student->save();

        [$gFirst, $gLast] = explode(' ', $application->guardian_name, 2) + [1 => '-'];
        $guardian = Guardian::firstOrCreate(['phone' => $application->guardian_phone], [
            'first_name' => $gFirst,
            'last_name' => $gLast,
            'email' => $application->guardian_email,
            'address' => $application->address,
        ]);
        $student->guardians()->syncWithoutDetaching([$guardian->id => ['relationship' => $application->guardian_relationship, 'is_primary' => true]]);

        if ($year) {
            Enrolment::create([
                'student_id' => $student->id,
                'academic_year_id' => $year->id,
                'school_class_id' => $class->id,
                'stream_id' => $stream?->id,
                'status' => 'active',
                'start_date' => $at->toDateString(),
                'remarks' => "Admitted via application {$application->application_no}",
            ]);
        }

        $application->status = 'enrolled';
        $application->student_id = $student->id;
        $application->decided_by = $by;
        $application->decided_at = $at;
        $application->updated_at = $at;
        $application->save();

        $this->log($application, $by, 'enrolled', "Application {$application->application_no} enrolled as student {$student->admission_no}", $at, ['status' => 'accepted'], ['status' => 'enrolled', 'student_id' => $student->id]);
    }

    /**
     * @param  array<string, mixed>|null  $old
     * @param  array<string, mixed>|null  $new
     */
    private function log(AdmissionApplication $application, ?int $userId, string $action, string $description, CarbonImmutable $at, ?array $old = null, ?array $new = null): void
    {
        $log = new AuditLog([
            'user_id' => $userId,
            'action' => $action,
            'module' => 'admissions',
            'auditable_type' => $application->getMorphClass(),
            'auditable_id' => $application->id,
            'description' => mb_substr($description, 0, 250),
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Seeder',
        ]);
        $log->created_at = $at;
        $log->save();
    }

    /** @param  array<int, mixed>  $items */
    private function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }
}
