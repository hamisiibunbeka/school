<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\ClassSubject;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Enrolment;
use App\Models\Guardian;
use App\Models\Plan;
use App\Models\Role;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Student;
use App\Models\Subject;
use App\Models\User;
use App\Services\SchoolProvisioner;
use App\Support\Tenancy;
use Illuminate\Database\Seeder;

/**
 * Demo tenant "Mzenzi Secondary School": classes, subjects, staff with logins
 * for every role, ~200 students with guardians and enrolment history.
 */
class CoreDemoSeeder extends Seeder
{
    public const MALE = ['Juma', 'Hamisi', 'Baraka', 'Emmanuel', 'Daudi', 'Salim', 'Joseph', 'Rashidi', 'Godfrey', 'Elia', 'Abdallah', 'Frank', 'Kelvin', 'Omari', 'Petro', 'Yusuph', 'Brian', 'Ally', 'Imani', 'Musa', 'Zawadi', 'Hassani', 'Kassim', 'Nassoro', 'Shabani'];

    public const FEMALE = ['Asha', 'Neema', 'Rehema', 'Zainabu', 'Halima', 'Grace', 'Mwanaidi', 'Upendo', 'Faraja', 'Saida', 'Esther', 'Agnes', 'Fatuma', 'Happiness', 'Rose', 'Mariamu', 'Witness', 'Glory', 'Amina', 'Joyce', 'Naomi', 'Subira', 'Tumaini', 'Eliza', 'Mwajuma'];

    public const SURNAMES = ['Mwakyusa', 'Kimaro', 'Massawe', 'Mushi', 'Mollel', 'Lyimo', 'Mrema', 'Swai', 'Komba', 'Mbwambo', 'Nyirenda', 'Mwasomola', 'Shirima', 'Temba', 'Kapinga', 'Mfinanga', 'Ngowi', 'Mkapa', 'Kombo', 'Makame', 'Bakari', 'Chacha', 'Magesa', 'Kisanga', 'Lema', 'Urassa', 'Mapunda', 'Haule', 'Ndunguru', 'Mtei'];

    public function run(): void
    {
        $result = app(SchoolProvisioner::class)->provision([
            'school_name' => 'Mzenzi Secondary School',
            'admin_name' => 'Hamisi Mwinyi',
            'email' => 'admin@mzenzi.test',
            'password' => 'password',
            'phone' => '+255 754 000 111',
            'level' => 'secondary',
            'residence_type' => 'mixed',
            'region' => 'Dar es Salaam',
        ], Plan::where('code', 'professional')->first());

        $tenant = $result['tenant'];
        $tenant->update(['status' => 'active', 'subscription_ends_at' => now()->addYear()]);
        $tenant->subscriptions()->create([
            'plan_id' => $tenant->plan_id, 'starts_at' => now()->startOfYear(), 'ends_at' => now()->addYear(),
            'amount' => 1500000, 'status' => 'active', 'reference' => 'SUB-DEMO-001', 'paid_at' => now()->startOfYear(),
        ]);

        /** @var School $school */
        $school = $result['school'];
        $school->update([
            'code' => 'MZSS',
            'registration_no' => 'S.4521',
            'motto' => 'Elimu ni Ufunguo wa Maisha',
            'address' => 'P.O. Box 1234, Kinondoni, Dar es Salaam',
            'region' => 'Dar es Salaam',
        ]);

        // A second campus to demonstrate multi-school tenants
        $branch = new School(['name' => 'Mzenzi Primary School', 'code' => 'MZPS', 'level' => 'primary', 'residence_type' => 'day', 'currency' => 'TZS', 'timezone' => 'Africa/Dar_es_Salaam']);
        $branch->tenant_id = $tenant->id;
        $branch->save();
        app(Tenancy::class)->runAs($branch, fn () => app(SchoolProvisioner::class)->seedSchoolDefaults());

        app(Tenancy::class)->runAs($school, fn () => $this->seedSchool($tenant->id, $school));
    }

    private function seedSchool(int $tenantId, School $school): void
    {
        mt_srand(2026);
        $roles = Role::where('tenant_id', $tenantId)->pluck('id', 'slug');
        $dept = Department::pluck('id', 'name');

        // ---------- Classes & streams ----------
        $classes = collect(['Form One', 'Form Two', 'Form Three', 'Form Four'])->map(function ($name, $i) {
            $class = SchoolClass::create(['name' => $name, 'code' => 'F'.($i + 1), 'level' => $i + 1, 'capacity' => 90]);
            foreach (['A', 'B'] as $stream) {
                Stream::create(['school_class_id' => $class->id, 'name' => $stream, 'capacity' => 45]);
            }

            return $class->load('streams');
        });

        // ---------- Subjects ----------
        $subjects = collect([
            ['Mathematics', 'MATH', 'Mathematics', 'core'],
            ['English Language', 'ENG', 'Languages', 'core'],
            ['Kiswahili', 'KISW', 'Languages', 'core'],
            ['Biology', 'BIO', 'Sciences', 'core'],
            ['Chemistry', 'CHEM', 'Sciences', 'core'],
            ['Physics', 'PHY', 'Sciences', 'core'],
            ['Geography', 'GEO', 'Humanities', 'core'],
            ['History', 'HIST', 'Humanities', 'core'],
            ['Civics', 'CIV', 'Humanities', 'core'],
            ['Commerce', 'COMM', 'Humanities', 'elective'],
            ['Computer Studies', 'ICT', 'Sciences', 'elective'],
        ])->map(fn ($s) => Subject::create(['name' => $s[0], 'code' => $s[1], 'department_id' => $dept[$s[2]] ?? null, 'type' => $s[3]]));

        // ---------- Staff (with logins for each role) ----------
        $staffUsers = [
            ['principal', 'Dr. Agnes', 'Kimaro', 'female', 'Head of School', 'teaching', 'Administration', 3200000, 'principal@mzenzi.test'],
            ['bursar', 'Emmanuel', 'Mushi', 'male', 'Bursar', 'non_teaching', 'Administration', 1800000, 'bursar@mzenzi.test'],
            ['teacher', 'Grace', 'Mollel', 'female', 'Mathematics Teacher', 'teaching', 'Mathematics', 1250000, 'teacher@mzenzi.test'],
            ['admissions-officer', 'Rehema', 'Swai', 'female', 'Admissions Officer', 'non_teaching', 'Administration', 950000, 'admissions@mzenzi.test'],
            ['hr-officer', 'Joseph', 'Mrema', 'male', 'HR Officer', 'non_teaching', 'Administration', 1300000, 'hr@mzenzi.test'],
            ['storekeeper', 'Salim', 'Bakari', 'male', 'Storekeeper', 'non_teaching', 'Support Services', 800000, 'store@mzenzi.test'],
            ['librarian', 'Upendo', 'Lyimo', 'female', 'Librarian', 'non_teaching', 'Support Services', 850000, 'library@mzenzi.test'],
            ['boarding-master', 'Godfrey', 'Komba', 'male', 'Boarding Master', 'non_teaching', 'Support Services', 900000, 'boarding@mzenzi.test'],
            ['transport-officer', 'Musa', 'Chacha', 'male', 'Transport Officer', 'non_teaching', 'Support Services', 850000, 'transport@mzenzi.test'],
            ['auditor', 'Faraja', 'Ngowi', 'female', 'Internal Auditor', 'non_teaching', 'Administration', 1500000, 'auditor@mzenzi.test'],
        ];

        $n = 1;
        foreach ($staffUsers as [$role, $first, $last, $gender, $designation, $category, $department, $salary, $email]) {
            $user = $this->makeUser($tenantId, $school->id, "$first $last", $email, $roles[$role]);
            $this->makeEmployee($n++, $first, $last, $gender, $designation, $category, $dept[$department] ?? null, $salary, $user->id, $email);
        }

        // Link the school admin to an employee record too
        $admin = User::where('email', 'admin@mzenzi.test')->first();
        $this->makeEmployee($n++, 'Hamisi', 'Mwinyi', 'male', 'School Administrator', 'non_teaching', $dept['Administration'] ?? null, 2500000, $admin->id, $admin->email);

        // Additional teachers (no login)
        $teacherNames = [['Baraka', 'Massawe', 'male'], ['Neema', 'Temba', 'female'], ['Daudi', 'Kapinga', 'male'], ['Halima', 'Makame', 'female'], ['Elia', 'Mfinanga', 'male'],
            ['Esther', 'Shirima', 'female'], ['Omari', 'Kombo', 'male'], ['Saida', 'Haule', 'female'], ['Petro', 'Urassa', 'male'], ['Joyce', 'Mapunda', 'female'], ['Kelvin', 'Lema', 'male']];
        foreach ($teacherNames as $i => [$first, $last, $gender]) {
            $this->makeEmployee($n++, $first, $last, $gender, 'Teacher', 'teaching', $subjects[$i % $subjects->count()]->department_id, mt_rand(9, 14) * 100000, null);
        }
        // Support staff
        foreach ([['Juma', 'Ndunguru', 'Driver'], ['Ally', 'Mtei', 'Driver'], ['Mwajuma', 'Kisanga', 'Cook'], ['Shabani', 'Magesa', 'Security Guard'], ['Rose', 'Mbwambo', 'Matron']] as [$first, $last, $designation]) {
            $this->makeEmployee($n++, $first, $last, in_array($first, ['Mwajuma', 'Rose']) ? 'female' : 'male', $designation, 'non_teaching', $dept['Support Services'] ?? null, mt_rand(4, 6) * 100000, null);
        }

        // Class teachers + subject allocation
        $teachers = Employee::where('category', 'teaching')->get();
        foreach ($classes as $ci => $class) {
            foreach ($class->streams as $si => $stream) {
                $stream->update(['class_teacher_id' => $teachers[($ci * 2 + $si) % $teachers->count()]->id]);
            }
            foreach ($subjects as $si => $subject) {
                if ($subject->type === 'elective' && $class->level < 3) {
                    continue;
                }
                ClassSubject::create([
                    'school_class_id' => $class->id,
                    'subject_id' => $subject->id,
                    'employee_id' => $subject->code === 'MATH' && $class->level <= 2 ? Employee::where('email', 'teacher@mzenzi.test')->value('id') : $teachers[($si + $ci) % $teachers->count()]->id,
                    'periods_per_week' => in_array($subject->code, ['MATH', 'ENG', 'KISW']) ? 6 : 4,
                ]);
            }
        }

        // ---------- Students & guardians ----------
        $year = AcademicYear::current();
        $admNo = 1;
        foreach ($classes as $class) {
            foreach ($class->streams as $stream) {
                $count = mt_rand(23, 28);
                for ($i = 0; $i < $count; $i++) {
                    $gender = mt_rand(0, 1) ? 'male' : 'female';
                    $first = $this->pick($gender === 'male' ? self::MALE : self::FEMALE);
                    $middle = $this->pick(self::MALE);
                    $surname = $this->pick(self::SURNAMES);
                    $age = 13 + $class->level + mt_rand(0, 1);

                    $student = new Student([
                        'first_name' => $first,
                        'middle_name' => $middle,
                        'last_name' => $surname,
                        'gender' => $gender,
                        'date_of_birth' => now()->subYears($age)->subDays(mt_rand(0, 360))->toDateString(),
                        'school_class_id' => $class->id,
                        'stream_id' => $stream->id,
                        'residence_type' => mt_rand(1, 100) <= 40 ? 'boarding' : 'day',
                        'admission_date' => now()->startOfYear()->subYears($class->level - 1)->addDays(7)->toDateString(),
                        'address' => $this->pick(['Kinondoni', 'Mbezi Beach', 'Sinza', 'Tegeta', 'Kimara', 'Ubungo', 'Mikocheni', 'Goba', 'Bunju']).', Dar es Salaam',
                        'blood_group' => $this->pick(['O+', 'A+', 'B+', 'AB+', 'O-', null]),
                        'allergies' => mt_rand(1, 12) === 1 ? $this->pick(['Peanuts', 'Penicillin', 'Dust', 'Seafood']) : null,
                        'status' => 'active',
                    ]);
                    $student->admission_no = sprintf('MZSS/%d/%04d', (int) now()->format('Y') - $class->level + 1, $admNo++);
                    $student->save();

                    $guardian = Guardian::create([
                        'first_name' => $this->pick(mt_rand(0, 1) ? self::MALE : self::FEMALE),
                        'last_name' => $surname,
                        'phone' => '+2557'.mt_rand(10000000, 99999999),
                        'occupation' => $this->pick(['Business', 'Teacher', 'Nurse', 'Farmer', 'Engineer', 'Civil Servant', 'Driver', 'Accountant']),
                        'address' => $student->address,
                    ]);
                    $student->guardians()->attach($guardian->id, ['relationship' => $this->pick(['Father', 'Mother', 'Guardian']), 'is_primary' => true]);

                    Enrolment::create([
                        'student_id' => $student->id, 'academic_year_id' => $year->id, 'school_class_id' => $class->id,
                        'stream_id' => $stream->id, 'status' => 'active', 'start_date' => $year->start_date,
                    ]);
                }
            }
        }

        // ---------- Portal users: one parent and one student ----------
        $demoStudent = Student::where('school_class_id', $classes[2]->id)->orderBy('id')->first();
        $parentGuardian = $demoStudent->guardians()->first();
        $parentGuardian->update(['first_name' => 'Mariamu', 'email' => 'parent@mzenzi.test']);
        // Give the parent a second child to show multi-ward view
        $sibling = Student::where('school_class_id', $classes[0]->id)->orderBy('id')->first();
        $sibling->update(['last_name' => $demoStudent->last_name]);
        $sibling->guardians()->syncWithoutDetaching([$parentGuardian->id => ['relationship' => 'Mother', 'is_primary' => true]]);

        $parentUser = $this->makeUser($tenantId, $school->id, "Mariamu {$parentGuardian->last_name}", 'parent@mzenzi.test', $roles['parent']);
        $parentGuardian->update(['user_id' => $parentUser->id]);

        $studentUser = $this->makeUser($tenantId, $school->id, $demoStudent->full_name, 'student@mzenzi.test', $roles['student']);
        $demoStudent->update(['user_id' => $studentUser->id]);
    }

    private function makeUser(int $tenantId, int $schoolId, string $name, string $email, int $roleId): User
    {
        $user = new User(['name' => $name, 'email' => $email, 'password' => 'password', 'role_id' => $roleId, 'school_id' => $schoolId, 'status' => 'active']);
        $user->tenant_id = $tenantId;
        $user->email_verified_at = now();
        $user->save();

        return $user;
    }

    private function makeEmployee(int $n, string $first, string $last, string $gender, string $designation, string $category, ?int $departmentId, int $salary, ?int $userId, ?string $email = null): Employee
    {
        return Employee::create([
            'employee_no' => sprintf('EMP-%04d', $n),
            'user_id' => $userId,
            'first_name' => $first,
            'last_name' => $last,
            'gender' => $gender,
            'date_of_birth' => now()->subYears(mt_rand(26, 55))->subDays(mt_rand(0, 360))->toDateString(),
            'phone' => '+2557'.mt_rand(10000000, 99999999),
            'email' => $email ?? strtolower("$first.$last@mzenzi.test"),
            'designation' => $designation,
            'category' => $category,
            'department_id' => $departmentId,
            'employment_type' => mt_rand(1, 5) === 1 ? 'contract' : 'permanent',
            'hire_date' => now()->subYears(mt_rand(1, 12))->subDays(mt_rand(0, 300))->toDateString(),
            'contract_end_date' => mt_rand(1, 6) === 1 ? now()->addDays(mt_rand(10, 300))->toDateString() : null,
            'basic_salary' => $salary,
            'bank_name' => $this->pick(['CRDB Bank', 'NMB Bank', 'NBC Bank']),
            'bank_account' => (string) mt_rand(1000000000, 1999999999),
            'nssf_no' => 'NSSF'.mt_rand(100000, 999999),
            'tin' => mt_rand(100, 999).'-'.mt_rand(100, 999).'-'.mt_rand(100, 999),
            'qualification' => $category === 'teaching' ? $this->pick(['Diploma in Education', 'B.Ed', 'B.Sc Ed', 'M.Ed']) : $this->pick(['Certificate', 'Diploma', 'Bachelor Degree']),
            'status' => 'active',
        ]);
    }

    /** @param  array<int, mixed>  $items */
    private function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }
}
