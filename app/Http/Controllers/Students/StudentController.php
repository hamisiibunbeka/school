<?php

namespace App\Http\Controllers\Students;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\BedAllocation;
use App\Models\Employee;
use App\Models\Enrolment;
use App\Models\Guardian;
use App\Models\Sponsor;
use App\Models\Student;
use App\Models\StudentDocument;
use App\Services\DocumentNumber;
use App\Services\Duties\DutyService;
use App\Services\Students\SponsorshipService;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StudentController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'class', 'stream', 'status', 'gender', 'residence', 'admitted_from', 'admitted_to']);

        $students = $this->filteredQuery($filters)
            ->with(['schoolClass:id,name', 'stream:id,name'])
            ->orderBy('first_name')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Student $s) => [
                'id' => $s->id,
                'admission_no' => $s->admission_no,
                'full_name' => $s->full_name,
                'photo_url' => $s->photo_url,
                'gender' => $s->gender,
                'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
                'residence_type' => $s->residence_type,
                'status' => $s->status,
                'date_of_birth' => $s->date_of_birth?->toDateString(),
                'admission_date' => $s->admission_date?->toDateString(),
            ]);

        $base = Student::query();

        return Inertia::render('students/index', [
            'students' => $students,
            'filters' => array_merge(['search' => '', 'class' => '', 'stream' => '', 'status' => '', 'gender' => '', 'residence' => '', 'admitted_from' => '', 'admitted_to' => ''], $filters),
            'classes' => Lookups::classes(),
            'statuses' => Lookups::enum(Student::STATUSES),
            'stats' => [
                'active' => (clone $base)->where('status', 'active')->count(),
                'male' => (clone $base)->where('status', 'active')->where('gender', 'male')->count(),
                'female' => (clone $base)->where('status', 'active')->where('gender', 'female')->count(),
                'boarding' => (clone $base)->where('status', 'active')->where('residence_type', 'boarding')->count(),
            ],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(['search', 'class', 'stream', 'status', 'gender', 'residence', 'admitted_from', 'admitted_to']);
        $this->audit('exported', null, 'Exported student list', 'students', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Admission No', 'First Name', 'Middle Name', 'Last Name', 'Gender', 'Date of Birth', 'Class', 'Stream', 'Residence', 'Status', 'Primary Guardian', 'Guardian Phone']);
            $this->filteredQuery($filters)->with(['schoolClass', 'stream', 'guardians'])->orderBy('first_name')
                ->chunk(500, function ($chunk) use ($out) {
                    foreach ($chunk as $s) {
                        $g = $s->guardians->firstWhere('pivot.is_primary', true) ?? $s->guardians->first();
                        fputcsv($out, [$s->admission_no, $s->first_name, $s->middle_name, $s->last_name, $s->gender, $s->date_of_birth?->toDateString(),
                            $s->schoolClass?->name, $s->stream?->name, $s->residence_type, $s->status, $g?->full_name, $g?->phone]);
                    }
                });
            fclose($out);
        }, 'students-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function create(): Response
    {
        return Inertia::render('students/form', [
            'student' => null,
            'classes' => Lookups::classes(),
            'sponsors' => SponsorshipService::options(),
            'sponsorTypes' => Lookups::enum(Sponsor::TYPES),
            'suggestedAdmissionNo' => null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $student = DB::transaction(function () use ($data, $request) {
            $student = new Student(collect($data)->except(['guardians', 'photo', 'sponsorship'])->all());
            $student->admission_no = ($data['admission_no'] ?? null) ?: DocumentNumber::next('admission');
            $student->admission_date ??= now()->toDateString();
            if ($request->hasFile('photo')) {
                $student->photo_path = $request->file('photo')->store('students/photos', 'public');
            }
            $student->save();

            $this->syncGuardians($student, $data['guardians'] ?? []);

            if (! empty($data['sponsorship']['enabled'])) {
                app(SponsorshipService::class)->create($student, $data['sponsorship']);
            }

            if ($year = AcademicYear::currentFor($student->school_class_id)) {
                Enrolment::create([
                    'student_id' => $student->id,
                    'academic_year_id' => $year->id,
                    'school_class_id' => $student->school_class_id,
                    'stream_id' => $student->stream_id,
                    'status' => 'active',
                    'start_date' => $student->admission_date,
                ]);
            }

            return $student;
        });

        $this->audit('created', $student, "Admitted student {$student->full_name} ({$student->admission_no})", 'students');
        $this->toast("{$student->full_name} has been enrolled.");

        return to_route('students.show', $student);
    }

    public function show(Student $student): Response
    {
        $student->load(['schoolClass:id,name', 'stream:id,name,class_teacher_id', 'guardians', 'sponsorships.sponsor', 'documents.uploader:id,name', 'enrolments.academicYear:id,name', 'enrolments.schoolClass:id,name', 'enrolments.stream:id,name']);

        $schoolId = $this->tenancy()->schoolId();

        $attendance = DB::table('attendance_records')->where('school_id', $schoolId)->where('student_id', $student->id)
            ->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        $invoices = DB::table('invoices')->where('school_id', $schoolId)->where('student_id', $student->id)
            ->whereNot('status', 'cancelled')->orderByDesc('issue_date')
            ->get(['id', 'invoice_no', 'issue_date', 'due_date', 'total', 'paid', 'balance', 'status']);

        $payments = DB::table('payments')->where('school_id', $schoolId)->where('student_id', $student->id)
            ->orderByDesc('payment_date')->get(['id', 'receipt_no', 'payment_date', 'amount', 'method', 'reference', 'status']);

        $results = DB::table('exam_marks')
            ->join('exams', 'exams.id', '=', 'exam_marks.exam_id')
            ->join('subjects', 'subjects.id', '=', 'exam_marks.subject_id')
            ->where('exam_marks.school_id', $schoolId)->where('exam_marks.student_id', $student->id)
            ->where('exams.status', 'published')
            ->orderByDesc('exams.start_date')
            ->get(['exams.id as exam_id', 'exams.name as exam', 'subjects.name as subject', 'exam_marks.score', 'exam_marks.grade', 'exam_marks.is_absent'])
            ->groupBy('exam_id')->map(fn ($rows) => [
                'exam' => $rows->first()->exam,
                'exam_id' => $rows->first()->exam_id,
                'average' => round((float) $rows->whereNotNull('score')->avg('score'), 1),
                'subjects' => $rows->values(),
            ])->values();

        $discipline = $student->disciplineCases()->latest('incident_date')->get();

        // Who looks after the student: the stream's class teacher and, for boarders, the dormitory patron / matron.
        $person = fn (?Employee $e, string $role) => $e ? ['id' => $e->id, 'name' => $e->full_name, 'phone' => $e->phone, 'role' => $role] : null;
        $student->loadMissing('stream.classTeacher:id,first_name,last_name,phone');
        $bed = BedAllocation::active()->where('student_id', $student->id)->with('room.dormitory.caretakers.employee:id,first_name,last_name,phone')->latest('start_date')->first();
        $care = [
            'teachers' => array_values(array_filter([$person($student->stream?->classTeacher, 'Class teacher')])),
            'dormitory' => $bed ? [
                'name' => $bed->room?->dormitory?->name,
                'room' => $bed->room?->name,
                'bed' => $bed->bed_no,
                'caretakers' => $bed->room?->dormitory?->caretakers->map(fn ($c) => $person($c->employee, ucfirst($c->role)))->filter()->values() ?? [],
            ] : null,
        ];

        return Inertia::render('students/show', [
            'student' => [
                ...$student->toArray(),
                'date_of_birth' => $student->date_of_birth?->toDateString(),
                'admission_date' => $student->admission_date?->toDateString(),
                'age' => $student->date_of_birth?->age,
                'class' => trim(($student->schoolClass?->name ?? '').' '.($student->stream?->name ?? '')),
            ],
            'attendance' => [
                'present' => (int) ($attendance['present'] ?? 0),
                'absent' => (int) ($attendance['absent'] ?? 0),
                'late' => (int) ($attendance['late'] ?? 0),
                'excused' => (int) ($attendance['excused'] ?? 0),
            ],
            'finance' => [
                'invoices' => $invoices,
                'payments' => $payments,
                'billed' => (string) $invoices->sum('total'),
                'paid' => (string) $payments->where('status', 'posted')->sum('amount'),
                'balance' => (string) $invoices->sum('balance'),
            ],
            'results' => $results,
            'discipline' => $discipline,
            'care' => $care,
            'duties' => app(DutyService::class)->forPerson($student),
            'statuses' => Lookups::enum(Student::STATUSES),
            'sponsors' => SponsorshipService::options(),
            'sponsorTypes' => Lookups::enum(Sponsor::TYPES),
        ]);
    }

    public function edit(Student $student): Response
    {
        $student->load(['guardians', 'activeSponsorship.sponsor']);
        $sp = $student->activeSponsorship;

        return Inertia::render('students/form', [
            'student' => [
                ...$student->toArray(),
                'date_of_birth' => $student->date_of_birth?->toDateString(),
                'admission_date' => $student->admission_date?->toDateString(),
                'sponsorship' => $sp ? [
                    'id' => $sp->id,
                    'attachment_name' => $sp->attachment_name,
                    'sponsor_id' => $sp->sponsor_id,
                    'coverage' => $sp->coverage,
                    'percentage' => $sp->percentage,
                    'covers' => $sp->covers,
                    'reference' => $sp->reference,
                    'start_date' => $sp->start_date?->toDateString(),
                    'end_date' => $sp->end_date?->toDateString(),
                ] : null,
            ],
            'classes' => Lookups::classes(),
            'sponsors' => SponsorshipService::options(),
            'sponsorTypes' => Lookups::enum(Sponsor::TYPES),
        ]);
    }

    public function update(Request $request, Student $student): RedirectResponse
    {
        $data = $this->validated($request, $student);
        $old = $student->only(['school_class_id', 'stream_id', 'status', 'residence_type']);

        DB::transaction(function () use ($student, $data, $request) {
            $student->fill(collect($data)->except(['guardians', 'photo', 'admission_no', 'sponsorship'])->all());
            if (! empty($data['admission_no'])) {
                $student->admission_no = $data['admission_no'];
            }
            if ($request->hasFile('photo')) {
                $student->photo_path = $request->file('photo')->store('students/photos', 'public');
            }
            $student->save();

            if (array_key_exists('guardians', $data)) {
                $this->syncGuardians($student, $data['guardians'] ?? []);
            }

            if (array_key_exists('sponsorship', $data)) {
                app(SponsorshipService::class)->sync($student, $data['sponsorship'] ?? []);
            }
        });

        $this->audit('updated', $student, "Updated student {$student->full_name}", 'students', $old, $student->only(array_keys($old)));
        $this->toast('Student record updated.');

        return to_route('students.show', $student);
    }

    /** Archive instead of hard delete when the student has financial or academic history. */
    public function destroy(Student $student): RedirectResponse
    {
        $hasHistory = $student->invoices()->exists() || $student->payments()->exists() || $student->examMarks()->exists();

        if ($hasHistory) {
            $student->update(['status' => 'archived']);
            $this->audit('archived', $student, "Archived student {$student->full_name}", 'students');
            $this->toast('Student has financial/academic history, so the record was archived instead of deleted.', 'warning');
        } else {
            $student->delete();
            $this->audit('deleted', $student, "Deleted student {$student->full_name}", 'students');
            $this->toast('Student deleted.');
        }

        return to_route('students.index');
    }

    /** Lifecycle transitions: transfer, withdraw, graduate, suspend, reactivate (SRS 4.3/4.4). */
    public function changeStatus(Request $request, Student $student): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Student::STATUSES)],
            'reason' => ['required', 'string', 'max:500'],
            'effective_date' => ['nullable', 'date'],
        ]);

        $old = $student->status;

        DB::transaction(function () use ($student, $data) {
            $student->update(['status' => $data['status']]);

            if (in_array($data['status'], ['transferred', 'graduated', 'withdrawn'], true)) {
                $student->enrolments()->where('status', 'active')->update([
                    'status' => $data['status'],
                    'end_date' => $data['effective_date'] ?? now()->toDateString(),
                    'remarks' => $data['reason'],
                ]);
            }
        });

        $this->audit('status_changed', $student, "Status {$old} → {$data['status']}: {$data['reason']}", 'students', ['status' => $old], ['status' => $data['status']]);
        $this->toast('Student status updated to '.str_replace('_', ' ', $data['status']).'.');

        return back();
    }

    public function uploadDocument(Request $request, Student $student): RedirectResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'file' => ['required', 'file', 'max:5120', 'mimes:pdf,jpg,jpeg,png,doc,docx'],
        ]);

        $file = $request->file('file');
        $student->documents()->create([
            'title' => $data['title'],
            'file_path' => $file->store("students/{$student->id}/documents"),
            'mime_type' => $file->getClientMimeType(),
            'size' => $file->getSize(),
            'uploaded_by' => $request->user()->id,
        ]);

        $this->toast('Document uploaded.');

        return back();
    }

    /** Open a student document: PDFs and images inline, other types as a download. */
    public function viewDocument(Student $student, StudentDocument $document): StreamedResponse
    {
        abort_unless($document->student_id === $student->id && Storage::exists($document->file_path), 404);

        $ext = pathinfo($document->file_path, PATHINFO_EXTENSION);
        $name = Str::slug($document->title) ?: 'document';
        $inline = str_starts_with((string) $document->mime_type, 'image/') || $document->mime_type === 'application/pdf';

        return Storage::response($document->file_path, $ext ? "{$name}.{$ext}" : $name, [], $inline ? 'inline' : 'attachment');
    }

    public function deleteDocument(Student $student, StudentDocument $document): RedirectResponse
    {
        abort_unless($document->student_id === $student->id, 404);
        Storage::delete($document->file_path);
        $document->delete();
        $this->toast('Document removed.');

        return back();
    }

    public function attachGuardian(Request $request, Student $student): RedirectResponse
    {
        $data = $request->validate([
            'guardian_id' => ['nullable', Rule::exists('guardians', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'first_name' => ['required_without:guardian_id', 'nullable', 'string', 'max:100'],
            'last_name' => ['required_without:guardian_id', 'nullable', 'string', 'max:100'],
            'phone' => ['required_without:guardian_id', 'nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email'],
            'relationship' => ['required', 'string', 'max:50'],
            'is_primary' => ['boolean'],
        ]);

        $guardian = $data['guardian_id']
            ? Guardian::findOrFail($data['guardian_id'])
            : Guardian::create(collect($data)->only(['first_name', 'last_name', 'phone', 'email'])->all());

        if ($data['is_primary'] ?? false) {
            $student->guardians()->updateExistingPivot($student->guardians()->pluck('guardians.id'), ['is_primary' => false]);
        }

        $student->guardians()->syncWithoutDetaching([
            $guardian->id => ['relationship' => $data['relationship'], 'is_primary' => $data['is_primary'] ?? false],
        ]);

        $this->toast("{$guardian->full_name} linked as {$data['relationship']}.");

        return back();
    }

    public function detachGuardian(Student $student, Guardian $guardian): RedirectResponse
    {
        $student->guardians()->detach($guardian->id);
        $this->toast('Guardian unlinked.');

        return back();
    }

    public function idCard(Student $student): Response
    {
        $student->load(['schoolClass:id,name', 'stream:id,name', 'guardians']);

        return Inertia::render('students/id-card', [
            'student' => [
                ...$student->toArray(),
                'class' => trim(($student->schoolClass?->name ?? '').' '.($student->stream?->name ?? '')),
                'date_of_birth' => $student->date_of_birth?->toDateString(),
                'guardian_phone' => $student->guardians->first()?->phone,
            ],
            'validUntil' => AcademicYear::currentFor($student->school_class_id)?->end_date?->toDateString(),
        ]);
    }

    /** @param  array<string, mixed>  $filters */
    private function filteredQuery(array $filters)
    {
        return Student::query()
            ->search($filters['search'] ?? null)
            ->when($filters['class'] ?? null, fn ($q, $v) => $q->where('school_class_id', $v))
            ->when($filters['stream'] ?? null, fn ($q, $v) => $q->where('stream_id', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v), fn ($q) => $q->where('status', '!=', 'archived'))
            // Admitted students appear only once finance has cleared their admission fees.
            ->where('status', '!=', Student::PENDING_CLEARANCE)
            ->when($filters['gender'] ?? null, fn ($q, $v) => $q->where('gender', $v))
            ->when($filters['residence'] ?? null, fn ($q, $v) => $q->where('residence_type', $v))
            ->when($filters['admitted_from'] ?? null, fn ($q, $v) => $q->whereDate('admission_date', '>=', $v))
            ->when($filters['admitted_to'] ?? null, fn ($q, $v) => $q->whereDate('admission_date', '<=', $v));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Student $student = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        $validator = validator($request->all(), [
            'admission_no' => ['nullable', 'string', 'max:30', Rule::unique('students')->where('school_id', $schoolId)->ignore($student?->id)],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'gender' => ['required', Rule::in(['male', 'female'])],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'nationality' => ['nullable', 'string', 'max:60'],
            'religion' => ['nullable', 'string', 'max:60'],
            'birth_cert_no' => ['nullable', 'string', 'max:60'],
            'address' => ['nullable', 'string', 'max:255'],
            'school_class_id' => ['required', Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            'stream_id' => ['nullable', Rule::exists('streams', 'id')->where('school_id', $schoolId)->where('school_class_id', $request->input('school_class_id'))],
            'residence_type' => ['required', Rule::in(['day', 'boarding'])],
            'admission_date' => ['nullable', 'date'],
            'previous_school' => ['nullable', 'string', 'max:150'],
            'medical_notes' => ['nullable', 'string', 'max:1000'],
            'allergies' => ['nullable', 'string', 'max:255'],
            'blood_group' => ['nullable', 'string', 'max:5'],
            'photo' => ['nullable', 'image', 'max:2048'],
            'guardians' => ['sometimes', 'array', 'max:4'],
            'guardians.*.id' => ['nullable', Rule::exists('guardians', 'id')->where('school_id', $schoolId)],
            'guardians.*.first_name' => ['required', 'string', 'max:100'],
            'guardians.*.last_name' => ['required', 'string', 'max:100'],
            'guardians.*.phone' => ['required', 'string', 'max:20'],
            'guardians.*.email' => ['nullable', 'email', 'max:150'],
            'guardians.*.occupation' => ['nullable', 'string', 'max:100'],
            'guardians.*.relationship' => ['required', 'string', 'max:50'],
            'guardians.*.is_primary' => ['boolean'],
            'sponsorship' => ['sometimes', 'array'],
            'sponsorship.enabled' => ['boolean'],
            ...SponsorshipService::rules('sponsorship', optional: true),
        ], SponsorshipService::messages('sponsorship'), [
            'school_class_id' => 'class',
            'stream_id' => 'stream',
            'guardians.*.first_name' => 'guardian first name',
            'guardians.*.last_name' => 'guardian last name',
            'guardians.*.phone' => 'guardian phone',
            'sponsorship.sponsor.name' => 'sponsor name',
            'sponsorship.percentage' => 'percentage covered',
        ]);

        $validator->after(function ($v) use ($request) {
            $sponsorship = (array) $request->input('sponsorship', []);
            if (filter_var($sponsorship['enabled'] ?? false, FILTER_VALIDATE_BOOLEAN) && SponsorshipService::missingSponsor($sponsorship)) {
                $v->errors()->add('sponsorship.sponsor.name', 'Choose an existing sponsor or enter the new sponsor\'s name.');
            }
        });

        return $validator->validate();
    }

    /**
     * Create or update inline guardians and link them. Re-uses an existing guardian
     * with the same phone number to avoid duplicates (siblings share parents).
     *
     * @param  array<int, array<string, mixed>>  $guardians
     */
    private function syncGuardians(Student $student, array $guardians): void
    {
        $sync = [];

        foreach ($guardians as $i => $g) {
            $attributes = collect($g)->only(['first_name', 'last_name', 'phone', 'email', 'occupation'])->all();

            $guardian = ! empty($g['id'])
                ? tap(Guardian::findOrFail($g['id']))->update($attributes)
                : Guardian::firstOrCreate(['phone' => $g['phone']], $attributes);

            $sync[$guardian->id] = [
                'relationship' => $g['relationship'],
                'is_primary' => (bool) ($g['is_primary'] ?? $i === 0),
            ];
        }

        $student->guardians()->sync($sync);
    }
}
