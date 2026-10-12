<?php

namespace App\Imports;

use App\Models\Guardian;
use App\Models\Student;
use Illuminate\Support\Str;

class GuardianImporter extends Importer
{
    private array $phones = [];

    private array $students = [];

    public static function key(): string
    {
        return 'guardians';
    }

    public function title(): string
    {
        return 'Parents & Guardians';
    }

    public function permission(): string
    {
        return 'students.manage';
    }

    public function notes(): ?string
    {
        return 'Give a student admission number to link the guardian to that student. Guardians are matched by phone number.';
    }

    public function columns(): array
    {
        return [
            ['key' => 'first_name', 'label' => 'First Name', 'required' => true, 'example' => 'Hamisi'],
            ['key' => 'last_name', 'label' => 'Last Name', 'required' => true, 'example' => 'Mrema'],
            ['key' => 'phone', 'label' => 'Phone', 'required' => true, 'example' => '+255754123456'],
            ['key' => 'gender', 'label' => 'Gender', 'example' => 'male', 'options' => ['male', 'female']],
            ['key' => 'alt_phone', 'label' => 'Alternative Phone', 'example' => ''],
            ['key' => 'email', 'label' => 'Email', 'example' => 'hamisi@example.com'],
            ['key' => 'occupation', 'label' => 'Occupation', 'example' => 'Business'],
            ['key' => 'national_id', 'label' => 'National ID (NIDA)', 'example' => ''],
            ['key' => 'address', 'label' => 'Address', 'example' => 'Tegeta'],
            ['key' => 'student_admission_no', 'label' => 'Student Admission No', 'example' => 'MZSS/2026/0001', 'help' => 'Optional — links this guardian to the student.', 'aliases' => ['admission no', 'student']],
            ['key' => 'relationship', 'label' => 'Relationship', 'example' => 'Father', 'options' => ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor']],
        ];
    }

    protected function prepare(): void
    {
        $this->phones = Guardian::pluck('id', 'phone')->mapWithKeys(fn ($id, $p) => [preg_replace('/\D/', '', $p) => $id])->all();
        $this->students = Student::pluck('id', 'admission_no')->mapWithKeys(fn ($id, $no) => [Str::lower($no) => $id])->all();
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['first_name', 'last_name', 'phone'], $errors);
        if (filled($row['email'] ?? '') && ! filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Email is not valid.';
        }
        $studentId = null;
        if (filled($row['student_admission_no'] ?? '')) {
            $studentId = $this->students[Str::lower($row['student_admission_no'])] ?? null;
            if (! $studentId) {
                $errors[] = "No student with admission no. \"{$row['student_admission_no']}\".";
            }
        }

        $digits = preg_replace('/\D/', '', $row['phone'] ?? '');
        $duplicate = isset($this->phones[$digits]) ? 'A guardian with this phone already exists'.($studentId ? ' — the student will be linked to them.' : '.') : ($this->seenBefore('phone', $digits) ? 'Same phone appears more than once in this file.' : null);

        return [$errors, [
            'first_name' => Str::title($row['first_name'] ?? ''),
            'last_name' => Str::title($row['last_name'] ?? ''),
            'phone' => $row['phone'] ?? '',
            'gender' => $this->enum($row['gender'] ?? '', ['male', 'female'], 'Gender', $errors, null, ['m' => 'male', 'f' => 'female']),
            'alt_phone' => ($row['alt_phone'] ?? '') ?: null,
            'email' => ($row['email'] ?? '') ? Str::lower($row['email']) : null,
            'occupation' => ($row['occupation'] ?? '') ?: null,
            'national_id' => ($row['national_id'] ?? '') ?: null,
            'address' => ($row['address'] ?? '') ?: null,
            'student_id' => $studentId,
            'relationship' => ($row['relationship'] ?? '') ?: 'Guardian',
            'existing_id' => $this->phones[$digits] ?? null,
        ], $duplicate];
    }

    /** Existing guardians (same phone) can be linked to the student instead of skipped. */
    public function canUpdateDuplicates(): bool
    {
        return true;
    }

    protected function persist(array $data): void
    {
        $guardian = $data['existing_id'] ? Guardian::find($data['existing_id']) : null;
        $guardian ??= Guardian::create(collect($data)->except(['student_id', 'relationship', 'existing_id', '__duplicate'])->all());

        if ($data['student_id']) {
            $guardian->students()->syncWithoutDetaching([$data['student_id'] => ['relationship' => $data['relationship']]]);
        }
    }
}
