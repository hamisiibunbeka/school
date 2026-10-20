<?php

namespace App\Http\Controllers\Admissions;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\AuditLog;
use App\Models\Combination;
use App\Models\Guardian;
use App\Models\Student;
use App\Services\DocumentNumber;
use App\Services\Fees\AdmissionClearanceService;
use App\Support\EducationLevel;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Admission applications and the SRS 13 admissions workflow (SRS 4.3). */
class AdmissionController extends Controller
{
    private const FILTER_KEYS = ['search', 'status', 'class', 'year', 'gender', 'source'];

    public function index(Request $request): Response
    {
        $filters = array_merge(array_fill_keys(self::FILTER_KEYS, ''), $request->only(self::FILTER_KEYS));

        $applications = $this->filtered($filters)
            ->with(['schoolClass:id,name', 'academicYear:id,name'])
            ->latest()
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (AdmissionApplication $a) => [
                'id' => $a->id,
                'application_no' => $a->application_no,
                'full_name' => $a->full_name,
                'gender' => $a->gender,
                'date_of_birth' => $a->date_of_birth?->toDateString(),
                'class' => $a->schoolClass?->name,
                'year' => $a->academicYear?->name,
                'residence_type' => $a->residence_type,
                'guardian_name' => $a->guardian_name,
                'guardian_phone' => $a->guardian_phone,
                'interview_date' => $a->interview_date?->toDateString(),
                'assessment_score' => $a->assessment_score,
                'status' => $a->status,
                'source' => $a->source ?? 'office',
                'documents_count' => count($a->documents ?? []),
                'student_id' => $a->student_id,
                'created_at' => $a->created_at?->toDateString(),
            ]);

        // Pipeline counts respect every filter except status.
        $counts = $this->filtered([...$filters, 'status' => ''])->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('admissions/index', [
            'applications' => $applications,
            'filters' => $filters,
            'counts' => collect(AdmissionApplication::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($counts[$s] ?? 0)]),
            'classes' => Lookups::classes(),
            'years' => Lookups::academicYears(),
            'statuses' => Lookups::enum(AdmissionApplication::STATUSES),
            'sourceCounts' => [
                'online' => AdmissionApplication::where('source', 'online')->count(),
                'online_new' => AdmissionApplication::where('source', 'online')->where('status', 'submitted')->count(),
            ],
            'siteUrl' => url('/sites/'.$this->tenancy()->school()->slug.'/admissions'),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(self::FILTER_KEYS);
        $this->audit('exported', null, 'Exported admission applications', 'admissions', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Application No', 'Applicant', 'Gender', 'Date of Birth', 'Class', 'Year', 'Residence', 'Previous School', 'Guardian', 'Phone', 'Interview', 'Score', 'Status', 'Source', 'Applied']);
            $this->filtered($filters)->with(['schoolClass', 'academicYear'])->latest()->chunk(500, function ($chunk) use ($out) {
                foreach ($chunk as $a) {
                    fputcsv($out, [$a->application_no, $a->full_name, $a->gender, $a->date_of_birth?->toDateString(), $a->schoolClass?->name, $a->academicYear?->name,
                        $a->residence_type, $a->previous_school, $a->guardian_name, $a->guardian_phone, $a->interview_date?->toDateString(), $a->assessment_score, $a->status, $a->source ?? 'office', $a->created_at?->toDateString()]);
                }
            });
            fclose($out);
        }, 'admissions-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function create(): Response
    {
        return Inertia::render('admissions/form', [
            'application' => null,
            'classes' => Lookups::classes(),
            'years' => Lookups::academicYears(),
            'defaultYearId' => $this->defaultIntakeYear()?->id,
            'combinations' => $this->combinationOptions(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $application = DB::transaction(function () use ($data) {
            $application = new AdmissionApplication($data);
            $application->application_no = DocumentNumber::next('application');
            $application->status = 'submitted';
            $application->save();

            return $application;
        });

        $this->audit('submitted', $application, "Application {$application->application_no} submitted for {$application->full_name}", 'admissions');
        $this->toast("Application {$application->application_no} recorded.");

        return to_route('admissions.show', $application);
    }

    public function show(AdmissionApplication $application, AdmissionClearanceService $clearance): Response
    {
        $application->load(['schoolClass:id,name', 'combination:id,code,name', 'academicYear:id,name', 'decider:id,name', 'student', 'admissionInvoice:id,invoice_no,total,balance,status', 'feeClearer:id,name', 'agreement.authorizer:id,name']);

        $history = AuditLog::with('user:id,name')
            ->where('auditable_type', $application->getMorphClass())
            ->where('auditable_id', $application->id)
            ->latest('created_at')->latest('id')->get()
            ->map(fn (AuditLog $l) => [
                'id' => $l->id,
                'action' => $l->action,
                'description' => $l->description,
                'user' => $l->user?->name,
                'created_at' => $l->created_at?->toDateTimeString(),
                'new_values' => $l->new_values,
            ]);

        return Inertia::render('admissions/show', [
            'application' => [
                ...$application->toArray(),
                'date_of_birth' => $application->date_of_birth?->toDateString(),
                'interview_date' => $application->interview_date?->toDateString(),
                'decided_at' => $application->decided_at?->toDateTimeString(),
                'created_at' => $application->created_at?->toDateTimeString(),
                'age' => $application->date_of_birth?->age,
                'class' => $application->schoolClass?->name,
                'combination' => $application->combination?->code,
                'combination_name' => $application->combination?->name,
                'year' => $application->academicYear?->name,
                'decider' => $application->decider?->name,
                'documents' => collect($application->documents ?? [])->map(fn ($d, $i) => ['index' => $i, 'title' => $d['title'] ?? 'Document', 'size' => $d['size'] ?? null, 'mime' => $d['mime'] ?? null])->values(),
                'student' => $application->student ? ['id' => $application->student->id, 'name' => $application->student->full_name, 'admission_no' => $application->student->admission_no] : null,
            ],
            'history' => $history,
            'clearance' => $application->student_id ? $this->clearanceSummary($application, $clearance) : null,
            'transitions' => AdmissionApplication::TRANSITIONS[$application->status] ?? [],
            'decisions' => AdmissionApplication::DECISIONS,
            'duplicates' => $application->status === 'accepted' ? $this->possibleDuplicates($application) : [],
            'classes' => Lookups::classes(),
            'currentYear' => AcademicYear::current()?->name,
        ]);
    }

    /** Securely stream a document uploaded with an online application (private storage). */
    public function document(AdmissionApplication $application, int $index): StreamedResponse
    {
        $doc = ($application->documents ?? [])[$index] ?? null;
        abort_unless($doc && Storage::disk('local')->exists($doc['path']), 404);
        $this->audit('viewed_document', $application, "Viewed document '{$doc['title']}' of application {$application->application_no}", 'admissions');

        return Storage::disk('local')->download($doc['path'], $doc['title']);
    }

    public function edit(AdmissionApplication $application): Response|RedirectResponse
    {
        if (in_array($application->status, ['awaiting_fees', 'enrolled', 'withdrawn', 'rejected'], true)) {
            $this->toast('Closed applications cannot be edited.', 'error');

            return to_route('admissions.show', $application);
        }

        return Inertia::render('admissions/form', [
            'application' => [
                ...$application->toArray(),
                'date_of_birth' => $application->date_of_birth?->toDateString(),
            ],
            'classes' => Lookups::classes(),
            'years' => Lookups::academicYears(),
            'defaultYearId' => $application->academic_year_id,
            'combinations' => $this->combinationOptions(),
        ]);
    }

    public function update(Request $request, AdmissionApplication $application): RedirectResponse
    {
        abort_if(in_array($application->status, ['awaiting_fees', 'enrolled', 'withdrawn', 'rejected'], true), 403, 'Closed applications cannot be edited.');

        $data = $this->validated($request);
        $old = $application->only(array_keys($data));
        $application->update($data);

        $changed = array_keys($application->getChanges());
        $this->audit('updated', $application, "Updated application {$application->application_no}", 'admissions',
            array_intersect_key($old, array_flip($changed)), $application->only(array_diff($changed, ['updated_at'])));
        $this->toast('Application updated.');

        return to_route('admissions.show', $application);
    }

    public function destroy(AdmissionApplication $application): RedirectResponse
    {
        if ($application->student_id) {
            $this->toast('Admitted applications are part of the student record and cannot be deleted.', 'error');

            return back();
        }

        $application->delete();
        $this->audit('deleted', $application, "Deleted application {$application->application_no} ({$application->full_name})", 'admissions');
        $this->toast('Application deleted.');

        return to_route('admissions.index');
    }

    /** Move an application along the workflow: review, interview, decisions, withdrawal. */
    public function transition(Request $request, AdmissionApplication $application, AdmissionClearanceService $clearance): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(AdmissionApplication::STATUSES)],
            'decision_notes' => [Rule::requiredIf(in_array($request->input('status'), AdmissionApplication::DECISIONS, true)), 'nullable', 'string', 'max:2000'],
            'interview_date' => [Rule::requiredIf($request->input('status') === 'interview'), 'nullable', 'date'],
            'assessment_score' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ], ['decision_notes.required' => 'Decision notes are required for this decision.']);

        if (! $application->canTransitionTo($data['status'])) {
            throw ValidationException::withMessages(['status' => 'An application that is '.str_replace('_', ' ', $application->status).' cannot move to '.str_replace('_', ' ', $data['status']).'.']);
        }

        $old = $application->only(['status', 'interview_date', 'assessment_score', 'decision_notes']);

        $application->status = $data['status'];
        if (array_key_exists('interview_date', $data) && $data['interview_date']) {
            $application->interview_date = $data['interview_date'];
        }
        if (isset($data['assessment_score']) && $data['assessment_score'] !== '') {
            $application->assessment_score = $data['assessment_score'];
        }
        if (! empty($data['decision_notes'])) {
            $application->decision_notes = $data['decision_notes'];
        }
        $application->decided_by = $request->user()->id;
        $application->decided_at = now();

        DB::transaction(function () use ($application, $old, $data, $clearance) {
            if ($old['status'] === 'awaiting_fees') {
                $clearance->abandon($application, $data['decision_notes'] ?? 'withdrawn');
            }
            $application->save();
        });

        $label = str_replace('_', ' ', $data['status']);
        $this->audit('status_changed', $application, "Application {$application->application_no}: {$old['status']} → {$data['status']}".(! empty($data['decision_notes']) ? " — {$data['decision_notes']}" : ''), 'admissions',
            ['status' => $old['status']], array_filter(['status' => $data['status'], 'interview_date' => $data['interview_date'] ?? null, 'assessment_score' => $data['assessment_score'] ?? null, 'decision_notes' => $data['decision_notes'] ?? null], fn ($v) => $v !== null && $v !== ''));
        $this->toast("Application marked as {$label}.");

        return back();
    }

    /** Convert an accepted applicant into a student, guardian link and enrolment without re-entry. */
    public function enrol(Request $request, AdmissionApplication $application, AdmissionClearanceService $clearance): RedirectResponse
    {
        if ($application->status !== 'accepted') {
            throw ValidationException::withMessages(['status' => 'Only accepted applicants can be enrolled.']);
        }

        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'admission_no' => ['nullable', 'string', 'max:30', Rule::unique('students')->where('school_id', $schoolId)],
            'admission_date' => ['required', 'date'],
            'confirm_duplicate' => ['boolean'],
        ], [], ['school_class_id' => 'class', 'stream_id' => 'stream']);

        $duplicates = $this->possibleDuplicates($application);
        if ($duplicates->isNotEmpty() && ! ($data['confirm_duplicate'] ?? false)) {
            throw ValidationException::withMessages(['confirm_duplicate' => 'A student with the same name and date of birth already exists. Confirm this is a different learner to continue.']);
        }

        $student = DB::transaction(function () use ($application, $data, $clearance) {
            $student = new Student([
                'first_name' => $application->first_name,
                'middle_name' => $application->middle_name,
                'last_name' => $application->last_name,
                'gender' => $application->gender,
                'date_of_birth' => $application->date_of_birth,
                'address' => $application->address,
                'school_class_id' => $data['school_class_id'],
                'stream_id' => $data['stream_id'] ?? null,
                'residence_type' => $application->residence_type,
                'admission_date' => $data['admission_date'],
                'previous_school' => $application->previous_school,
                'medical_notes' => $application->medical_notes,
                // Kept out of the directory until finance clears the admission fees (or a deferral is authorized).
                'status' => Student::PENDING_CLEARANCE,
            ]);
            $student->admission_no = ($data['admission_no'] ?? null) ?: DocumentNumber::next('admission');
            $student->save();

            // Re-use an existing guardian with the same phone (siblings share parents).
            [$first, $last] = $this->splitName($application->guardian_name);
            $guardian = Guardian::firstOrCreate(['phone' => $application->guardian_phone], [
                'first_name' => $first,
                'last_name' => $last,
                'email' => $application->guardian_email,
                'address' => $application->address,
            ]);
            $student->guardians()->syncWithoutDetaching([
                $guardian->id => ['relationship' => $application->guardian_relationship ?: 'Parent', 'is_primary' => true],
            ]);

            $invoice = $clearance->bill($student, $data['admission_date']);

            $application->update([
                'status' => 'awaiting_fees',
                'student_id' => $student->id,
                'admission_invoice_id' => $invoice?->id,
                'decided_by' => auth()->id(),
                'decided_at' => now(),
            ]);

            return $student;
        });

        $invoice = $application->admissionInvoice;
        $this->audit('enrolled', $application, "Application {$application->application_no} admitted as {$student->admission_no} — awaiting fee clearance".($invoice ? " (invoice {$invoice->invoice_no}: ".number_format((float) $invoice->total).')' : ''), 'admissions', ['status' => 'accepted'], ['status' => 'awaiting_fees', 'student_id' => $student->id]);
        $this->audit('created', $student, "Admitted student {$student->full_name} ({$student->admission_no}) from application {$application->application_no}, pending fee clearance", 'students');
        $this->toast("{$student->full_name} admitted as {$student->admission_no}. Sent to finance for fee clearance.");

        return to_route('admissions.show', $application);
    }

    /** Printable admission (offer) letter for accepted/enrolled applicants. */
    public function letter(AdmissionApplication $application): Response|RedirectResponse
    {
        if (! in_array($application->status, ['accepted', 'awaiting_fees', 'enrolled'], true)) {
            $this->toast('Admission letters are only available for accepted applicants.', 'error');

            return to_route('admissions.show', $application);
        }

        $application->load(['schoolClass:id,name', 'academicYear', 'decider:id,name', 'student:id,admission_no']);
        $year = $application->academicYear ?? AcademicYear::currentFor($application->school_class_id);

        return Inertia::render('admissions/letter', [
            'application' => [
                'id' => $application->id,
                'application_no' => $application->application_no,
                'full_name' => $application->full_name,
                'first_name' => $application->first_name,
                'gender' => $application->gender,
                'class' => $application->schoolClass?->name,
                'year' => $year?->name,
                'reporting_date' => $year?->start_date?->toDateString(),
                'residence_type' => $application->residence_type,
                'guardian_name' => $application->guardian_name,
                'guardian_phone' => $application->guardian_phone,
                'address' => $application->address,
                'decided_at' => $application->decided_at?->toDateString(),
                'decider' => $application->decider?->name,
                'admission_no' => $application->student?->admission_no,
                'status' => $application->status,
            ],
        ]);
    }

    /** Fee clearance state for the application page (status, invoice, agreement). */
    private function clearanceSummary(AdmissionApplication $application, AdmissionClearanceService $clearance): array
    {
        $invoice = $application->admissionInvoice;
        $agreement = $application->agreement;

        return [
            'state' => $application->status === 'awaiting_fees' ? 'awaiting' : ($application->fee_clearance ?? 'paid'),
            ...($application->status === 'awaiting_fees' ? $clearance->status($application) : []),
            'cleared_at' => $application->fee_cleared_at?->toDateTimeString(),
            'cleared_by' => $application->feeClearer?->name,
            'invoice' => $invoice ? ['id' => $invoice->id, 'invoice_no' => $invoice->invoice_no, 'total' => (string) $invoice->total, 'balance' => (string) $invoice->balance, 'status' => $invoice->status] : null,
            'agreement' => $agreement ? [
                'id' => $agreement->id,
                'amount' => (string) $agreement->amount,
                'paid' => $clearance->progress($agreement->setRelation('student', $application->student)),
                'due_date' => $agreement->due_date->toDateString(),
                'reason' => $agreement->reason,
                'terms' => $agreement->terms,
                'status' => $agreement->is_overdue ? 'overdue' : $agreement->status,
                'authorizer' => $agreement->authorizer?->name,
            ] : null,
        ];
    }

    /** Existing students with the same first + last name and date of birth. */
    private function possibleDuplicates(AdmissionApplication $application): Collection
    {
        return Student::withTrashed()->with('schoolClass:id,name')
            ->where('first_name', $application->first_name)
            ->where('last_name', $application->last_name)
            ->when($application->date_of_birth, fn ($q, $d) => $q->whereDate('date_of_birth', $d), fn ($q) => $q->whereNull('date_of_birth'))
            ->limit(5)->get()
            ->map(fn (Student $s) => ['id' => $s->id, 'name' => $s->full_name, 'admission_no' => $s->admission_no, 'class' => $s->schoolClass?->name, 'status' => $s->status, 'date_of_birth' => $s->date_of_birth?->toDateString()]);
    }

    /** @return array{0:string,1:string} */
    private function splitName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name)) ?: [$name];
        $last = count($parts) > 1 ? array_pop($parts) : '-';

        return [implode(' ', $parts), $last];
    }

    /** Next academic year if one is set up, otherwise the current one. */
    private function defaultIntakeYear(): ?AcademicYear
    {
        $current = AcademicYear::current();

        return AcademicYear::when($current, fn ($q) => $q->where('start_date', '>', $current->start_date))->orderBy('start_date')->first() ?? $current;
    }

    /** @param  array<string, string>  $filters */
    private function filtered(array $filters)
    {
        return AdmissionApplication::query()
            ->search($filters['search'] ?? null)
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['class'] ?? null, fn ($q, $v) => $q->where('school_class_id', $v))
            ->when($filters['year'] ?? null, fn ($q, $v) => $q->where('academic_year_id', $v))
            ->when($filters['gender'] ?? null, fn ($q, $v) => $q->where('gender', $v))
            ->when($filters['source'] ?? null, fn ($q, $v) => $q->where('source', $v));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'academic_year_id' => ['required', Rule::exists('academic_years', 'id')->where('school_id', $schoolId)],
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'gender' => ['required', Rule::in(['male', 'female'])],
            'date_of_birth' => ['required', 'date', 'before:today'],
            'residence_type' => ['required', Rule::in(['day', 'boarding'])],
            'previous_school' => ['nullable', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'guardian_name' => ['required', 'string', 'max:150'],
            'guardian_relationship' => ['required', 'string', 'max:50'],
            'guardian_phone' => ['required', 'string', 'max:20'],
            'guardian_email' => ['nullable', 'email', 'max:150'],
            'medical_notes' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            // Form Five applicants: selected combination and Form Four (CSEE) result.
            'combination_id' => [
                EducationLevel::forClass((int) $request->input('school_class_id')) === EducationLevel::A_LEVEL ? 'required' : 'prohibited',
                'nullable',
                Rule::exists('combinations', 'id')->where('school_id', $schoolId),
            ],
            'csee_index_no' => ['nullable', 'string', 'max:30'],
            'csee_division' => ['nullable', Rule::in(['I', 'II', 'III', 'IV', '0'])],
            'csee_points' => ['nullable', 'integer', 'min:7', 'max:35'],
        ], [
            'combination_id.required' => 'Choose the combination for this Form Five applicant.',
            'combination_id.prohibited' => 'Only A-Level (Form Five) applicants have a combination.',
        ], ['academic_year_id' => 'academic year', 'school_class_id' => 'class', 'combination_id' => 'combination']);
    }

    /** @return array<int, array{value:int, label:string, code:string}> */
    private function combinationOptions(): array
    {
        return Combination::active()->orderBy('code')->get(['id', 'code', 'name'])
            ->map(fn ($c) => ['value' => $c->id, 'label' => "{$c->code} — {$c->name}", 'code' => $c->code])->all();
    }
}
