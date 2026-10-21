<?php

namespace App\Imports;

use App\Models\AcademicYear;
use App\Models\Enrolment;
use App\Models\Guardian;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Services\DocumentNumber;
use App\Support\EducationLevel;
use Illuminate\Support\Str;

class StudentImporter extends Importer
{
    private array $classes = [];

    private array $streams = [];

    private array $admissionNos = [];

    private array $nameDob = [];

    /** @var array<string, ?AcademicYear> current year per education level */
    private array $years = [];

    public static function key(): string
    {
        return 'students';
    }

    public function title(): string
    {
        return 'Students';
    }

    public function permission(): string
    {
        return 'students.manage';
    }

    public function notes(): ?string
    {
        return 'Each student is placed in the class/stream given and enrolled in the current academic year. A guardian with the same phone number is reused (siblings share guardians).';
    }

    public function columns(): array
    {
        return [
            ['key' => 'admission_no', 'label' => 'Admission No', 'example' => 'MZSS/2026/0501', 'help' => 'Leave blank to auto-number.', 'aliases' => ['adm no', 'admission number']],
            ['key' => 'first_name', 'label' => 'First Name', 'required' => true, 'example' => 'Asha'],
            ['key' => 'middle_name', 'label' => 'Middle Name', 'example' => 'Juma'],
            ['key' => 'last_name', 'label' => 'Last Name', 'required' => true, 'example' => 'Mushi', 'aliases' => ['surname']],
            ['key' => 'gender', 'label' => 'Gender', 'required' => true, 'example' => 'female', 'options' => ['male', 'female'], 'help' => 'male / female (M / F accepted)', 'aliases' => ['sex']],
            ['key' => 'date_of_birth', 'label' => 'Date of Birth', 'example' => '14/03/2012', 'help' => 'dd/mm/yyyy', 'aliases' => ['dob', 'birth date']],
            ['key' => 'class', 'label' => 'Class', 'required' => true, 'example' => 'Form One', 'help' => 'Class name or code exactly as set up in Academics.'],
            ['key' => 'stream', 'label' => 'Stream', 'example' => 'A', 'help' => 'Optional stream name within the class.'],
            ['key' => 'residence_type', 'label' => 'Residence', 'example' => 'day', 'options' => ['day', 'boarding'], 'help' => 'day / boarding (default day)', 'aliases' => ['residence type', 'boarder']],
            ['key' => 'admission_date', 'label' => 'Admission Date', 'example' => '08/01/2026', 'help' => 'dd/mm/yyyy (default today)'],
            ['key' => 'nationality', 'label' => 'Nationality', 'example' => 'Tanzanian'],
            ['key' => 'religion', 'label' => 'Religion', 'example' => 'Christian'],
            ['key' => 'birth_cert_no', 'label' => 'Birth Certificate No', 'example' => '1234567890'],
            ['key' => 'address', 'label' => 'Address', 'example' => 'Sinza, Dar es Salaam'],
            ['key' => 'previous_school', 'label' => 'Previous School', 'example' => 'Mlimani Primary'],
            ['key' => 'blood_group', 'label' => 'Blood Group', 'example' => 'O+'],
            ['key' => 'allergies', 'label' => 'Allergies', 'example' => ''],
            ['key' => 'guardian_first_name', 'label' => 'Guardian First Name', 'example' => 'Mariamu'],
            ['key' => 'guardian_last_name', 'label' => 'Guardian Last Name', 'example' => 'Mushi'],
            ['key' => 'guardian_phone', 'label' => 'Guardian Phone', 'example' => '+255754000111', 'help' => 'Required when guardian name is given.'],
            ['key' => 'guardian_relationship', 'label' => 'Guardian Relationship', 'example' => 'Mother', 'options' => ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor']],
            ['key' => 'guardian_email', 'label' => 'Guardian Email', 'example' => ''],
        ];
    }

    protected function prepare(): void
    {
        $classes = SchoolClass::with('streams')->get();
        $this->classes = $this->lookup($classes);
        foreach ($classes as $class) {
            foreach ($class->streams as $stream) {
                $this->streams[$class->id][Str::lower($stream->name)] = $stream->id;
            }
        }
        $this->admissionNos = Student::withTrashed()->pluck('id', 'admission_no')->mapWithKeys(fn ($id, $no) => [Str::lower($no) => $id])->all();
        $this->nameDob = Student::query()->get(['first_name', 'last_name', 'date_of_birth'])
            ->mapWithKeys(fn ($s) => [Str::lower("{$s->first_name}|{$s->last_name}|{$s->date_of_birth?->toDateString()}") => true])->all();
        foreach (EducationLevel::CALENDARS as $calendar) {
            $this->years[$calendar] = AcademicYear::current($calendar);
        }
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['first_name', 'last_name', 'gender', 'class'], $errors);

        $gender = $this->enum($row['gender'] ?? '', ['male', 'female'], 'Gender', $errors, null, ['m' => 'male', 'f' => 'female', 'boy' => 'male', 'girl' => 'female', 'me' => 'male', 'ke' => 'female']);
        $dob = $this->date($row['date_of_birth'] ?? '', 'Date of birth', $errors, true);
        $admissionDate = $this->date($row['admission_date'] ?? '', 'Admission date', $errors);
        $residence = $this->enum($row['residence_type'] ?? '', ['day', 'boarding'], 'Residence', $errors, 'day', ['boarder' => 'boarding', 'yes' => 'boarding', 'no' => 'day', 'day scholar' => 'day']);

        $classId = null;
        if (filled($row['class'] ?? '')) {
            $classId = $this->classes[Str::lower($row['class'])] ?? null;
            if (! $classId) {
                $errors[] = "Class \"{$row['class']}\" does not exist — create it in Academics → Classes first.";
            }
        }
        $streamId = null;
        if ($classId && filled($row['stream'] ?? '')) {
            $streamId = $this->streams[$classId][Str::lower($row['stream'])] ?? null;
            if (! $streamId) {
                $errors[] = "Stream \"{$row['stream']}\" does not exist in {$row['class']}.";
            }
        }

        $guardianGiven = filled($row['guardian_first_name'] ?? '') || filled($row['guardian_phone'] ?? '');
        if ($guardianGiven) {
            if (blank($row['guardian_phone'] ?? '')) {
                $errors[] = 'Guardian phone is required when a guardian is given.';
            }
            if (blank($row['guardian_first_name'] ?? '')) {
                $errors[] = 'Guardian first name is required when a guardian is given.';
            }
            if (filled($row['guardian_email'] ?? '') && ! filter_var($row['guardian_email'], FILTER_VALIDATE_EMAIL)) {
                $errors[] = 'Guardian email is not valid.';
            }
        }

        $duplicate = null;
        $adm = trim($row['admission_no'] ?? '');
        if ($adm !== '' && isset($this->admissionNos[Str::lower($adm)])) {
            $duplicate = "Admission no. {$adm} already exists.";
        } elseif ($adm !== '' && $this->seenBefore('adm', $adm)) {
            $duplicate = "Admission no. {$adm} appears more than once in this file.";
        } elseif ($dob && isset($this->nameDob[Str::lower("{$row['first_name']}|{$row['last_name']}|{$dob}")])) {
            $duplicate = 'A student with the same name and date of birth already exists.';
        } elseif ($dob && $this->seenBefore('namedob', "{$row['first_name']}|{$row['last_name']}|{$dob}")) {
            $duplicate = 'Same name and date of birth appears more than once in this file.';
        }

        return [$errors, [
            'admission_no' => $adm ?: null,
            'first_name' => Str::title($row['first_name'] ?? ''),
            'middle_name' => ($row['middle_name'] ?? '') !== '' ? Str::title($row['middle_name']) : null,
            'last_name' => Str::title($row['last_name'] ?? ''),
            'gender' => $gender,
            'date_of_birth' => $dob,
            'school_class_id' => $classId,
            'stream_id' => $streamId,
            'residence_type' => $residence,
            'admission_date' => $admissionDate ?? now()->toDateString(),
            'nationality' => ($row['nationality'] ?? '') ?: 'Tanzanian',
            'religion' => ($row['religion'] ?? '') ?: null,
            'birth_cert_no' => ($row['birth_cert_no'] ?? '') ?: null,
            'address' => ($row['address'] ?? '') ?: null,
            'previous_school' => ($row['previous_school'] ?? '') ?: null,
            'blood_group' => ($row['blood_group'] ?? '') ?: null,
            'allergies' => ($row['allergies'] ?? '') ?: null,
            'guardian' => $guardianGiven ? [
                'first_name' => Str::title($row['guardian_first_name'] ?? ''),
                'last_name' => Str::title(($row['guardian_last_name'] ?? '') ?: ($row['last_name'] ?? '')),
                'phone' => $row['guardian_phone'] ?? '',
                'email' => ($row['guardian_email'] ?? '') ?: null,
                'relationship' => ($row['guardian_relationship'] ?? '') ?: 'Guardian',
            ] : null,
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        $guardian = $data['guardian'];
        unset($data['guardian'], $data['__duplicate']);

        $student = new Student(collect($data)->except('admission_no')->all());
        $student->admission_no = $data['admission_no'] ?: DocumentNumber::next('admission');
        $student->status = 'active';
        $student->save();

        if ($guardian) {
            $g = Guardian::firstOrCreate(['phone' => $guardian['phone']], collect($guardian)->except('relationship')->all());
            $student->guardians()->syncWithoutDetaching([$g->id => ['relationship' => $guardian['relationship'], 'is_primary' => true]]);
        }

        $year = $this->years[EducationLevel::calendarForClass($student->school_class_id)] ?? null;
        if ($year) {
            Enrolment::create([
                'student_id' => $student->id, 'academic_year_id' => $year->id, 'school_class_id' => $student->school_class_id,
                'stream_id' => $student->stream_id, 'status' => 'active', 'start_date' => $student->admission_date,
            ]);
        }
    }
}
