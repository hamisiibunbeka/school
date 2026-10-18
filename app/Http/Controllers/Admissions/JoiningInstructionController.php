<?php

namespace App\Http\Controllers\Admissions;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\Combination;
use App\Support\EducationLevel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Form Five joining instructions (maelekezo ya kujiunga): one template per
 * school, printed per selected student with their name and combination,
 * the items for their combination, and the acceptance and medical forms.
 */
class JoiningInstructionController extends Controller
{
    public const SETTING = 'joining_instructions';

    public const DEFAULTS = [
        'authority' => "OFISI YA RAIS\nTAWALA ZA MIKOA NA SERIKALI ZA MITAA (TAMISEMI)",
        'council' => '',
        'reference' => '',
        'reporting_date' => null,
        'subject' => 'YAH: KUCHAGULIWA KUJIUNGA NA MASOMO YA KIDATO CHA TANO, {school_name}, MWAKA {year}',
        'intro' => "Uongozi wa {school_name} unafurahi kukufahamisha kuwa umechaguliwa kujiunga na kidato cha tano katika shule hii.\n\nUmepangiwa tahasusi ya {combination} ({combination_name}). Hongera sana kwa kupata nafasi hii adhimu. Unatakiwa kuripoti shuleni tarehe {reporting_date}.",
        'directions' => '',
        'documents' => "Fomu ya kukubali nafasi (Fomu Na. 01) iliyojazwa kikamilifu\nFomu ya kupima afya (Fomu Na. 02) yenye muhuri wa Mganga Mkuu wa Mkoa/Wilaya au Kituo cha Afya\nNakala ya cheti cha kuzaliwa\nNakala ya matokeo ya kidato cha nne",
        'requirements' => '',
        'combination_items' => [],
        'contributions' => [],
        'bank_name' => '',
        'account_name' => '',
        'account_no' => '',
        'branch' => '',
        'contacts' => '',
        'books' => '',
        'rules' => '',
        'motto' => '',
        'head_name' => '',
        'head_title' => 'MKUU WA SHULE',
        'include_acceptance_form' => true,
        'include_medical_form' => true,
    ];

    public function edit(): Response
    {
        $year = $this->intakeYear();

        return Inertia::render('admissions/joining-instructions', [
            'template' => $this->template(),
            'combinations' => Combination::active()->orderBy('code')->get(['id', 'code', 'name'])
                ->map(fn ($c) => ['value' => $c->id, 'code' => $c->code, 'label' => "{$c->code} — {$c->name}"]),
            'years' => AcademicYear::where('education_level', EducationLevel::A_LEVEL)->orderByDesc('start_date')->get(['id', 'name'])
                ->map(fn ($y) => ['value' => $y->id, 'label' => $y->name]),
            'defaultYear' => $year?->id,
            // Selected (accepted) Form Five students per combination for the intake year.
            'selected' => AdmissionApplication::whereNotNull('combination_id')->where('status', 'accepted')
                ->when($year, fn ($q) => $q->where('academic_year_id', $year->id))
                ->selectRaw('combination_id, COUNT(*) as total')->groupBy('combination_id')->pluck('total', 'combination_id'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'authority' => ['nullable', 'string', 'max:500'],
            'council' => ['nullable', 'string', 'max:200'],
            'reference' => ['nullable', 'string', 'max:100'],
            'reporting_date' => ['nullable', 'date'],
            'subject' => ['required', 'string', 'max:300'],
            'intro' => ['required', 'string', 'max:3000'],
            'directions' => ['nullable', 'string', 'max:3000'],
            'documents' => ['nullable', 'string', 'max:3000'],
            'requirements' => ['nullable', 'string', 'max:6000'],
            'combination_items' => ['nullable', 'array'],
            'combination_items.*' => ['nullable', 'string', 'max:1000'],
            'contributions' => ['nullable', 'array', 'max:20'],
            'contributions.*.item' => ['required', 'string', 'max:150'],
            'contributions.*.amount' => ['required', 'numeric', 'min:0'],
            'bank_name' => ['nullable', 'string', 'max:100'],
            'account_name' => ['nullable', 'string', 'max:150'],
            'account_no' => ['nullable', 'string', 'max:50'],
            'branch' => ['nullable', 'string', 'max:100'],
            'contacts' => ['nullable', 'string', 'max:2000'],
            'books' => ['nullable', 'string', 'max:10000'],
            'rules' => ['nullable', 'string', 'max:10000'],
            'motto' => ['nullable', 'string', 'max:200'],
            'head_name' => ['nullable', 'string', 'max:120'],
            'head_title' => ['nullable', 'string', 'max:120'],
            'include_acceptance_form' => ['boolean'],
            'include_medical_form' => ['boolean'],
        ], ['contributions.*.item.required' => 'Each contribution needs a description.']);

        $school = $this->tenancy()->school();
        $settings = $school->settings ?? [];
        $settings[self::SETTING] = array_merge(self::DEFAULTS, $data);
        $school->settings = $settings;
        $school->save();

        $this->audit('settings_changed', $school, 'Updated Form Five joining instructions', 'admissions');
        $this->toast('Joining instructions saved.');

        return back();
    }

    /** Print one student's letter (?application=) or every selected student (?year=&combination=). */
    public function print(Request $request): Response
    {
        $data = $request->validate([
            'application' => ['nullable', 'integer'],
            'year' => ['nullable', 'integer'],
            'combination' => ['nullable', 'integer'],
        ]);

        $applications = AdmissionApplication::with(['combination.items.subject:id,name', 'academicYear:id,name'])
            ->whereNotNull('combination_id')
            ->when($data['application'] ?? null, fn ($q, $id) => $q->whereKey($id), fn ($q) => $q
                ->where('status', 'accepted')
                ->when($data['year'] ?? null, fn ($q, $y) => $q->where('academic_year_id', $y))
                ->when($data['combination'] ?? null, fn ($q, $c) => $q->where('combination_id', $c)))
            ->orderBy('combination_id')->orderBy('first_name')->orderBy('last_name')
            ->get();

        abort_if(($data['application'] ?? null) && $applications->isEmpty(), 404, 'This application has no Form Five combination.');

        $template = $this->template();

        return Inertia::render('admissions/joining-instruction-print', [
            'template' => $template,
            'school' => $this->schoolInfo(),
            'letters' => $applications->map(fn (AdmissionApplication $a) => [
                'id' => $a->id,
                'application_no' => $a->application_no,
                'student_name' => strtoupper($a->full_name),
                'gender' => $a->gender,
                'combination' => $a->combination?->code,
                'combination_name' => $a->combination?->name,
                'combination_items' => $template['combination_items'][$a->combination?->code ?? ''] ?? '',
                'year' => $a->academicYear?->name ?? $this->intakeYear()?->name,
                'csee_index_no' => $a->csee_index_no,
                'previous_school' => $a->previous_school,
            ])->values(),
        ]);
    }

    /** @return array<string, mixed> */
    private function template(): array
    {
        return array_merge(self::DEFAULTS, (array) ($this->tenancy()->school()?->setting(self::SETTING) ?? []));
    }

    /** @return array<string, mixed> */
    private function schoolInfo(): array
    {
        $s = $this->tenancy()->school();

        return [
            'name' => $s?->name,
            'address' => $s?->address,
            'phone' => $s?->phone,
            'email' => $s?->email,
            'logo_url' => $s?->logo_url,
            'website' => $s?->setting('website_url'),
        ];
    }

    private function intakeYear(): ?AcademicYear
    {
        $current = AcademicYear::current(EducationLevel::A_LEVEL);

        return AcademicYear::where('education_level', EducationLevel::A_LEVEL)
            ->when($current, fn ($q) => $q->where('start_date', '>', $current->start_date))
            ->orderBy('start_date')->first() ?? $current;
    }
}
