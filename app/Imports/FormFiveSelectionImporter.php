<?php

namespace App\Imports;

use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\Combination;
use App\Models\SchoolClass;
use App\Services\DocumentNumber;
use App\Support\EducationLevel;
use Illuminate\Support\Str;

/**
 * Form Five selection list (TAMISEMI): every row becomes an ACCEPTED
 * admission application for the school's first A-Level class, with the
 * combination the student was selected for. Students are enrolled from
 * Admissions when they report.
 */
class FormFiveSelectionImporter extends Importer
{
    private array $combinations = [];

    private array $existing = [];

    private ?SchoolClass $formFive = null;

    private ?AcademicYear $year = null;

    public static function key(): string
    {
        return 'form-five-selection';
    }

    public function title(): string
    {
        return 'Form Five Selection (TAMISEMI)';
    }

    public function permission(): string
    {
        return 'admissions.manage';
    }

    public function notes(): ?string
    {
        return 'Paste the students selected to your school from the TAMISEMI Form Five selection list. Each row is recorded as an accepted Form Five application with its combination; '
            .'you then print joining instructions and enrol students as they report. Combinations must exist under Academics → Combinations.';
    }

    public function columns(): array
    {
        return [
            ['key' => 'first_name', 'label' => 'First Name', 'required' => true, 'example' => 'Neema', 'aliases' => ['first name', 'jina la kwanza']],
            ['key' => 'middle_name', 'label' => 'Middle Name', 'example' => 'Joseph'],
            ['key' => 'last_name', 'label' => 'Last Name', 'required' => true, 'example' => 'Mushi', 'aliases' => ['surname', 'jina la mwisho']],
            ['key' => 'gender', 'label' => 'Sex', 'required' => true, 'example' => 'F', 'aliases' => ['gender', 'jinsia'], 'options' => ['M', 'F']],
            ['key' => 'combination', 'label' => 'Combination', 'required' => true, 'example' => 'PCB', 'aliases' => ['tahasusi', 'combination code', 'mchepuo']],
            ['key' => 'csee_index_no', 'label' => 'CSEE Index No', 'example' => 'S0101/0001/2025', 'aliases' => ['index no', 'index number', 'namba ya mtihani']],
            ['key' => 'csee_division', 'label' => 'Division', 'example' => 'I', 'aliases' => ['div', 'daraja']],
            ['key' => 'csee_points', 'label' => 'Points', 'example' => '12', 'aliases' => ['pts', 'alama']],
            ['key' => 'previous_school', 'label' => 'Previous School', 'example' => 'Azania Secondary School', 'aliases' => ['school from', 'shule aliyotoka', 'o-level school']],
            ['key' => 'residence', 'label' => 'Residence (Day/Boarding)', 'example' => 'Boarding', 'options' => ['Day', 'Boarding']],
            ['key' => 'guardian_name', 'label' => 'Parent/Guardian Name', 'example' => 'Joseph Mushi', 'aliases' => ['parent', 'mzazi']],
            ['key' => 'guardian_phone', 'label' => 'Parent/Guardian Phone', 'example' => '0754000111', 'aliases' => ['parent phone', 'simu']],
        ];
    }

    protected function prepare(): void
    {
        $this->combinations = Combination::all()->mapWithKeys(fn ($c) => [Str::lower($c->code) => $c->id])->all();
        $this->formFive = SchoolClass::where('education_level', EducationLevel::A_LEVEL)->orderBy('level')->first();
        // Intake goes to the next A-Level year if one is set up, otherwise the current one.
        $current = AcademicYear::current(EducationLevel::A_LEVEL);
        $this->year = AcademicYear::where('education_level', EducationLevel::A_LEVEL)
            ->when($current, fn ($q) => $q->where('start_date', '>', $current->start_date))
            ->orderBy('start_date')->first() ?? $current;
        $this->existing = AdmissionApplication::whereNotNull('csee_index_no')->pluck('id', 'csee_index_no')
            ->mapWithKeys(fn ($id, $no) => [Str::upper($no) => $id])->all();
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['first_name', 'last_name', 'gender', 'combination'], $errors);

        if (! $this->formFive) {
            $errors[] = 'No A-Level class exists. Create Form Five under Academics → Classes and set its level to A-Level.';
        }
        $code = trim((string) ($row['combination'] ?? ''));
        $combinationId = $code !== '' ? ($this->combinations[Str::lower($code)] ?? null) : null;
        if ($code !== '' && ! $combinationId) {
            $errors[] = "Combination \"{$code}\" is not set up. Add it under Academics → Combinations.";
        }

        $gender = $this->enum($row['gender'] ?? '', ['male', 'female'], 'Sex', $errors, null, ['m' => 'male', 'f' => 'female', 'me' => 'male', 'ke' => 'female']);
        $residence = $this->enum($row['residence'] ?? '', ['day', 'boarding'], 'Residence', $errors, 'boarding');
        $points = $this->number($row['csee_points'] ?? '', 'Points', $errors, 0);
        $division = Str::upper(trim((string) ($row['csee_division'] ?? '')));
        if ($division !== '' && ! in_array($division, ['I', 'II', 'III', 'IV', '0'], true)) {
            $errors[] = "Division \"{$division}\" should be I, II, III, IV or 0.";
        }
        $index = Str::upper(trim((string) ($row['csee_index_no'] ?? ''))) ?: null;

        $duplicate = $index && isset($this->existing[$index]) ? "Index number {$index} is already in admissions."
            : ($index && $this->seenBefore('index', $index) ? 'Listed twice in this file.' : null);

        return [$errors, [
            'first_name' => trim((string) ($row['first_name'] ?? '')),
            'middle_name' => trim((string) ($row['middle_name'] ?? '')) ?: null,
            'last_name' => trim((string) ($row['last_name'] ?? '')),
            'gender' => $gender,
            'combination_id' => $combinationId,
            'csee_index_no' => $index,
            'csee_division' => $division ?: null,
            'csee_points' => $points !== null ? (int) $points : null,
            'previous_school' => trim((string) ($row['previous_school'] ?? '')) ?: null,
            'residence_type' => $residence,
            'guardian_name' => trim((string) ($row['guardian_name'] ?? '')) ?: 'Not provided',
            'guardian_phone' => trim((string) ($row['guardian_phone'] ?? '')),
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        unset($data['__duplicate']);
        $application = new AdmissionApplication($data + [
            'school_class_id' => $this->formFive?->id,
            'academic_year_id' => $this->year?->id,
            'status' => 'accepted',
            'source' => 'tamisemi',
            'decision_notes' => 'Selected by TAMISEMI (Form Five selection)',
        ]);
        $application->application_no = DocumentNumber::next('application');
        $application->save();
    }
}
