<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Guardian;
use App\Models\Student;
use App\Models\Term;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Parent & student self-service portal (SRS 4.5).
 *
 * Parents only ever see wards linked to their guardian record; students only
 * see themselves. Everything is additionally filtered by the current school.
 */
class PortalController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $this->authorizePortal($request->user());

        $guardian = $this->guardianFor($user);
        $self = $this->studentFor($user);

        if ($guardian) {
            $wards = $guardian->students()->with(['schoolClass:id,name', 'stream:id,name'])->whereNotIn('status', ['archived'])->orderBy('first_name')->get();
            $classIds = $wards->pluck('school_class_id')->filter()->unique()->values()->all();

            return Inertia::render('portal/index', [
                'mode' => 'parent',
                'guardian' => ['id' => $guardian->id, 'full_name' => $guardian->full_name, 'phone' => $guardian->phone, 'email' => $guardian->email],
                'wards' => $wards->map(fn (Student $s) => $this->wardSummary($s))->values(),
                'announcements' => $this->announcements('parents', $classIds),
                'events' => $this->events(['all', 'parents']),
                'term' => Term::current()?->only(['id', 'name', 'start_date', 'end_date']),
                'paymentInstructions' => $this->paymentInstructions(),
            ]);
        }

        if ($self) {
            return Inertia::render('portal/index', [
                'mode' => 'student',
                'detail' => $this->detail($self, 'students'),
                'term' => Term::current()?->only(['id', 'name', 'start_date', 'end_date']),
            ]);
        }

        return Inertia::render('portal/index', ['mode' => 'none', 'term' => null]);
    }

    public function child(Request $request, Student $student): Response
    {
        $user = $this->authorizePortal($request->user());
        $guardian = $this->guardianFor($user);

        // Never expose a ward unless the guardian relationship exists (SRS 4.5).
        abort_unless($guardian && $guardian->students()->whereKey($student->id)->exists(), 404);

        return Inertia::render('portal/child', [
            'detail' => $this->detail($student, 'parents'),
            'siblings' => $guardian->students()->where('students.id', '!=', $student->id)->get(['students.id', 'first_name', 'last_name'])
                ->map(fn ($s) => ['id' => $s->id, 'name' => trim("{$s->first_name} {$s->last_name}")]),
            'term' => Term::current()?->only(['id', 'name', 'start_date', 'end_date']),
        ]);
    }

    private function authorizePortal(User $user): User
    {
        abort_unless($user->hasPermission('portal.parent') || $user->hasPermission('portal.student'), 403);

        return $user;
    }

    private function guardianFor(User $user): ?Guardian
    {
        if (! $user->hasPermission('portal.parent')) {
            return null;
        }
        $guardian = $user->guardian;

        return $guardian && $guardian->school_id === $this->tenancy()->schoolId() ? $guardian : null;
    }

    private function studentFor(User $user): ?Student
    {
        if (! $user->hasPermission('portal.student')) {
            return null;
        }
        $student = $user->student;

        return $student && $student->school_id === $this->tenancy()->schoolId() ? $student : null;
    }

    /** @return array<string, mixed> */
    private function wardSummary(Student $s): array
    {
        $attendance = $this->attendanceCounts($s);
        $latest = $this->results($s)->first();

        return [
            'id' => $s->id,
            'full_name' => $s->full_name,
            'first_name' => $s->first_name,
            'admission_no' => $s->admission_no,
            'photo_url' => $s->photo_url,
            'gender' => $s->gender,
            'status' => $s->status,
            'residence_type' => $s->residence_type,
            'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
            'attendance_rate' => $attendance['rate'],
            'attendance_days' => $attendance['total'],
            'balance' => $this->balance($s),
            'latest_exam' => $latest ? ['exam' => $latest['exam'], 'average' => $latest['average']] : null,
            'homework_due' => $this->homeworkQuery($s)->whereDate('assignments.due_date', '>=', now()->toDateString())->count(),
        ];
    }

    /** Everything a parent (or the student) may see about one learner. */
    private function detail(Student $s, string $audience): array
    {
        $s->loadMissing(['schoolClass:id,name', 'stream:id,name']);
        $schoolId = $this->tenancy()->schoolId();

        $invoices = DB::table('invoices')->where('invoices.school_id', $schoolId)->where('student_id', $s->id)
            ->whereNotIn('status', ['cancelled', 'draft'])->orderByDesc('issue_date')
            ->get(['id', 'invoice_no', 'issue_date', 'due_date', 'total', 'paid', 'balance', 'status']);

        $payments = DB::table('payments')->where('payments.school_id', $schoolId)->where('student_id', $s->id)
            ->where('status', 'posted')->orderByDesc('payment_date')
            ->get(['id', 'receipt_no', 'payment_date', 'amount', 'method', 'reference']);

        $term = Term::current();
        $records = DB::table('attendance_records')->where('attendance_records.school_id', $schoolId)->where('student_id', $s->id)
            ->when($term, fn ($q) => $q->whereBetween('date', [$term->start_date->toDateString(), $term->end_date->toDateString()]))
            ->orderBy('date')->get(['date', 'status', 'remarks']);

        $slots = DB::table('timetable_slots')
            ->join('subjects', 'subjects.id', '=', 'timetable_slots.subject_id')
            ->leftJoin('employees', 'employees.id', '=', 'timetable_slots.employee_id')
            ->where('timetable_slots.school_id', $schoolId)
            ->where('timetable_slots.school_class_id', $s->school_class_id)
            ->where(fn ($q) => $q->whereNull('timetable_slots.stream_id')->orWhere('timetable_slots.stream_id', $s->stream_id))
            ->orderBy('day_of_week')->orderBy('start_time')
            ->get(['timetable_slots.id', 'day_of_week', 'start_time', 'end_time', 'room', 'subjects.name as subject', 'subjects.code as subject_code', DB::raw("CONCAT(employees.first_name, ' ', employees.last_name) as teacher")]);

        $homework = $this->homeworkQuery($s)
            ->join('subjects', 'subjects.id', '=', 'assignments.subject_id')
            ->leftJoin('employees', 'employees.id', '=', 'assignments.employee_id')
            ->orderByDesc('assignments.due_date')->limit(25)
            ->get(['assignments.id', 'assignments.title', 'assignments.instructions', 'assignments.due_date', 'assignments.max_score', 'assignments.status', 'subjects.name as subject', DB::raw("CONCAT(employees.first_name, ' ', employees.last_name) as teacher")]);

        $attendance = $this->attendanceCounts($s);

        return [
            'student' => [
                'id' => $s->id,
                'full_name' => $s->full_name,
                'first_name' => $s->first_name,
                'admission_no' => $s->admission_no,
                'photo_url' => $s->photo_url,
                'gender' => $s->gender,
                'status' => $s->status,
                'residence_type' => $s->residence_type,
                'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
            ],
            'finance' => [
                'invoices' => $invoices,
                'payments' => $payments,
                'billed' => $invoices->reduce(fn ($c, $i) => bcadd($c, (string) $i->total, 2), '0'),
                'paid' => $payments->reduce(fn ($c, $p) => bcadd($c, (string) $p->amount, 2), '0'),
                'balance' => $invoices->reduce(fn ($c, $i) => bcadd($c, (string) $i->balance, 2), '0'),
                'instructions' => $this->paymentInstructions(),
            ],
            'attendance' => [...$attendance, 'records' => $records],
            'results' => $this->results($s),
            'timetable' => $slots,
            'homework' => $homework,
            'events' => $this->events(['all', $audience]),
            'announcements' => $this->announcements($audience, array_filter([$s->school_class_id])),
        ];
    }

    /** @return array{present: int, absent: int, late: int, excused: int, total: int, rate: float|null} */
    private function attendanceCounts(Student $s): array
    {
        $term = Term::current();
        $counts = DB::table('attendance_records')->where('attendance_records.school_id', $this->tenancy()->schoolId())->where('student_id', $s->id)
            ->when($term, fn ($q) => $q->whereBetween('date', [$term->start_date->toDateString(), $term->end_date->toDateString()]))
            ->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        $total = (int) $counts->sum();
        $attended = (int) ($counts['present'] ?? 0) + (int) ($counts['late'] ?? 0);

        return [
            'present' => (int) ($counts['present'] ?? 0),
            'absent' => (int) ($counts['absent'] ?? 0),
            'late' => (int) ($counts['late'] ?? 0),
            'excused' => (int) ($counts['excused'] ?? 0),
            'total' => $total,
            'rate' => $total ? round($attended / $total * 100, 1) : null,
        ];
    }

    private function balance(Student $s): string
    {
        return (string) DB::table('invoices')->where('invoices.school_id', $this->tenancy()->schoolId())->where('student_id', $s->id)
            ->whereNotIn('status', ['cancelled', 'draft'])->sum('balance');
    }

    /** Published results only, newest exam first. */
    private function results(Student $s): Collection
    {
        return DB::table('exam_marks')
            ->join('exams', 'exams.id', '=', 'exam_marks.exam_id')
            ->join('subjects', 'subjects.id', '=', 'exam_marks.subject_id')
            ->where('exam_marks.school_id', $this->tenancy()->schoolId())
            ->where('exams.school_id', $this->tenancy()->schoolId())
            ->where('exam_marks.student_id', $s->id)
            ->where('exams.status', 'published')
            ->orderByDesc('exams.published_at')->orderByDesc('exams.start_date')->orderBy('subjects.name')
            ->get(['exams.id as exam_id', 'exams.name as exam', 'exams.type', 'exams.published_at', 'exams.max_score', 'subjects.name as subject', 'exam_marks.score', 'exam_marks.grade', 'exam_marks.points', 'exam_marks.is_absent', 'exam_marks.remarks'])
            ->groupBy('exam_id')
            ->map(fn ($rows) => [
                'exam_id' => $rows->first()->exam_id,
                'exam' => $rows->first()->exam,
                'type' => $rows->first()->type,
                'published_at' => $rows->first()->published_at,
                'average' => round((float) $rows->whereNotNull('score')->avg('score'), 1),
                'subjects' => $rows->map(fn ($r) => [
                    'subject' => $r->subject, 'score' => $r->score, 'grade' => $r->grade, 'points' => $r->points, 'is_absent' => (bool) $r->is_absent, 'remarks' => $r->remarks,
                ])->values(),
            ])->values();
    }

    private function homeworkQuery(Student $s)
    {
        return DB::table('assignments')
            ->where('assignments.school_id', $this->tenancy()->schoolId())
            ->where('assignments.school_class_id', $s->school_class_id)
            ->where(fn ($q) => $q->whereNull('assignments.stream_id')->orWhere('assignments.stream_id', $s->stream_id))
            ->whereIn('assignments.status', ['published', 'closed']);
    }

    /** @param  array<int, string>  $audiences */
    private function events(array $audiences): Collection
    {
        return DB::table('events')->where('events.school_id', $this->tenancy()->schoolId())
            ->whereIn('audience', $audiences)
            ->where(fn ($q) => $q->where('starts_at', '>=', now()->startOfDay())->orWhere('ends_at', '>=', now()))
            ->orderBy('starts_at')->limit(8)
            ->get(['id', 'title', 'description', 'type', 'starts_at', 'ends_at', 'all_day', 'location']);
    }

    /** @param  array<int, int>  $classIds */
    private function announcements(string $audience, array $classIds): Collection
    {
        return Announcement::live()->forAudience($audience, $classIds)
            ->with('schoolClass:id,name')
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END")
            ->orderByRaw('COALESCE(publish_at, created_at) DESC')
            ->limit(8)->get()
            ->map(fn (Announcement $a) => [
                'id' => $a->id, 'title' => $a->title, 'body' => $a->body, 'priority' => $a->priority,
                'audience' => $a->audience, 'class' => $a->schoolClass?->name,
                'publish_at' => ($a->publish_at ?? $a->created_at)?->toIso8601String(),
            ]);
    }

    /** @return array<string, string|null> */
    private function paymentInstructions(): array
    {
        $school = $this->tenancy()->school();

        return [
            'text' => $school?->setting('payment_instructions'),
            'bank_name' => $school?->setting('bank_name'),
            'bank_account_name' => $school?->setting('bank_account_name'),
            'bank_account_no' => $school?->setting('bank_account_no'),
            'mobile_money_provider' => $school?->setting('mobile_money_provider'),
            'mobile_money_paybill' => $school?->setting('mobile_money_paybill'),
            'mobile_money_account' => $school?->setting('mobile_money_account'),
        ];
    }
}
