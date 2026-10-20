<?php

namespace App\Services\Fees;

use App\Models\AcademicYear;
use App\Models\AdmissionApplication;
use App\Models\Enrolment;
use App\Models\FeeDiscount;
use App\Models\FeeInstallment;
use App\Models\FeePaymentAgreement;
use App\Models\FeeStructure;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Student;
use App\Models\Term;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Services\AuditLogger;
use App\Support\EducationLevel;
use App\Support\Tenancy;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Admission fee clearance — the step between "accepted" and "enrolled".
 *
 * Enrolling an accepted applicant creates the student as `pending_clearance` (hidden from the directory and
 * class lists) and bills the current term's fees. The student becomes active only when either
 *  - finance verifies the first installment is paid (installment settings × the year's fees for the class), or
 *  - a head holding `fees.defer` authorizes a payment agreement: the parent's excuse, the amount and agreed date.
 * Agreements are honoured automatically once receipts reach the promised amount, and are followed up daily
 * (due soon / overdue notices to finance and the authorizer).
 */
class AdmissionClearanceService
{
    /** Days before the agreed date that finance is reminded. */
    public const DUE_SOON_DAYS = 3;

    /** Overdue agreements are re-notified at most once per this many days. */
    public const OVERDUE_RENOTIFY_DAYS = 7;

    public function __construct(protected BillingService $billing) {}

    /** Bill a newly admitted (pending) student for the current term of their class; null when no structure applies. */
    public function bill(Student $student, string $issueDate): ?Invoice
    {
        $level = EducationLevel::forClass($student->school_class_id);
        $term = Term::current($level);
        if (! $term || Invoice::where('student_id', $student->id)->where('term_id', $term->id)->billable()->exists()) {
            return null;
        }

        $structures = FeeStructure::with('feeCategory:id,name')->where('term_id', $term->id)->where('school_class_id', $student->school_class_id)->get();
        $lines = $this->billing->linesFor($student, $structures, FeeDiscount::active()->where('student_id', $student->id)->get());
        if (! $lines) {
            return null;
        }

        $dueDates = array_filter(array_column($lines, 'due_date'));
        $firstInstallment = FeeInstallment::where('academic_year_id', $term->academic_year_id)->orderBy('sequence')->first();

        return $this->billing->issue($student, $lines, [
            'academic_year_id' => $term->academic_year_id,
            'term_id' => $term->id,
            'issue_date' => $issueDate,
            'due_date' => $firstInstallment?->due_date?->toDateString() ?? ($dueDates ? min($dueDates) : null),
            'notes' => 'Admission fees',
        ], audit: false);
    }

    /** Net fees for the student's class and residence across every term of the year (after discounts). */
    public function annualFees(Student $student, AcademicYear $year): string
    {
        $structures = FeeStructure::with('feeCategory:id,name')->where('academic_year_id', $year->id)->where('school_class_id', $student->school_class_id)->get();
        $lines = $this->billing->linesFor($student, $structures, FeeDiscount::active()->where('student_id', $student->id)->get());

        return array_reduce($lines, fn ($sum, $l) => bcadd($sum, bcsub($l['amount'], $l['discount'], 2), 2), '0.00');
    }

    /** Total of the student's posted receipts. */
    public function paid(Student $student): string
    {
        return bcadd((string) Payment::posted()->where('student_id', $student->id)->sum('amount'), '0', 2);
    }

    /**
     * What a pending student must pay before finance can clear them, and the year's installment schedule.
     *
     * @return array{required:string, paid:string, outstanding:string, ready:bool, annual:?string, basis:string, year:?string,
     *               schedule: array<int, array{name:string, percent:string, due_date:string, amount:string, cumulative:string, met:bool}>}
     */
    public function status(AdmissionApplication $application): array
    {
        $student = $application->student;
        $year = $student ? AcademicYear::currentFor($student->school_class_id) : null;
        $installments = $year ? FeeInstallment::where('academic_year_id', $year->id)->orderBy('sequence')->get() : collect();
        $paid = $student ? $this->paid($student) : '0.00';
        $annual = null;
        $schedule = [];

        if ($student && $year && $installments->isNotEmpty()) {
            $annual = $this->annualFees($student, $year);
            $cumulative = '0.00';
            foreach ($installments as $i) {
                $amount = $this->percentOf($annual, (string) $i->percent);
                $cumulative = bcadd($cumulative, $amount, 2);
                $schedule[] = ['name' => $i->name, 'percent' => (string) $i->percent, 'due_date' => $i->due_date->toDateString(), 'amount' => $amount, 'cumulative' => $cumulative, 'met' => bccomp($paid, $cumulative, 2) >= 0];
            }
            $first = $installments->first();
            $required = $schedule[0]['amount'];
            $basis = "{$first->name} — ".rtrim(rtrim((string) $first->percent, '0'), '.')."% of the {$year->name} fees";
        } else {
            $invoice = $application->admissionInvoice;
            $required = $invoice && $invoice->status !== 'cancelled' ? bcadd((string) $invoice->total, '0', 2) : '0.00';
            $basis = $invoice ? 'Full admission invoice (no installment settings for '.($year?->name ?? 'the year').')' : 'No fees billed — nothing to pay';
        }

        $outstanding = bccomp($paid, $required, 2) >= 0 ? '0.00' : bcsub($required, $paid, 2);

        return [
            'required' => $required,
            'paid' => $paid,
            'outstanding' => $outstanding,
            'ready' => bccomp($outstanding, '0', 2) === 0,
            'annual' => $annual,
            'basis' => $basis,
            'year' => $year?->name,
            'schedule' => $schedule,
        ];
    }

    /** Finance verification: the first installment is paid, so the student is enrolled. */
    public function verify(AdmissionApplication $application, User $by): Student
    {
        $this->assertAwaiting($application);
        $status = $this->status($application);
        if (! $status['ready']) {
            throw ValidationException::withMessages(['clearance' => 'The required amount has not been paid yet — '.number_format((float) $status['outstanding']).' is outstanding.']);
        }

        return DB::transaction(function () use ($application, $by, $status) {
            $student = $this->complete($application, $by, 'paid');
            AuditLogger::log('fee_cleared', $application, "Fees verified for {$student->full_name}: paid ".number_format((float) $status['paid']).' of '.number_format((float) $status['required']).' required — enrolled', module: 'admissions');

            return $student;
        });
    }

    /**
     * A head authorizes the parent's request to pay later. The student is enrolled now; the agreement is followed up.
     *
     * @param  array{amount:string|int|float, due_date:string, reason:string, terms?:?string, requested_by?:?string}  $data
     */
    public function defer(AdmissionApplication $application, array $data, User $by): FeePaymentAgreement
    {
        $this->assertAwaiting($application);
        $amount = bcadd((string) $data['amount'], '0', 2);
        if (bccomp($amount, '0', 2) <= 0) {
            throw ValidationException::withMessages(['amount' => 'The agreed amount must be greater than zero.']);
        }

        return DB::transaction(function () use ($application, $data, $amount, $by) {
            $student = $application->student;
            $agreement = FeePaymentAgreement::create([
                'student_id' => $student->id,
                'admission_application_id' => $application->id,
                'amount' => $amount,
                'paid_baseline' => $this->paid($student),
                'due_date' => $data['due_date'],
                'requested_by' => $data['requested_by'] ?? $application->guardian_name,
                'reason' => $data['reason'],
                'terms' => $data['terms'] ?? null,
                'status' => 'active',
                'authorized_by' => $by->id,
            ]);

            $this->complete($application, $by, 'deferred');

            $due = $agreement->due_date->format('d M Y');
            AuditLogger::log('fee_deferred', $application, "Payment agreement authorized for {$student->full_name}: ".number_format((float) $amount)." by {$due} — {$data['reason']}", module: 'admissions');
            AuditLogger::log('created', $agreement, "Authorized payment agreement for {$student->full_name} ({$student->admission_no}): ".number_format((float) $amount)." by {$due}", module: 'fees');

            $this->notifyFinance(
                'Payment agreement authorized',
                "{$by->name} let {$student->full_name} ({$student->admission_no}) proceed — ".number_format((float) $amount)." due by {$due}.",
                'info',
                except: $by->id,
            );

            return $agreement;
        });
    }

    /** Withdrawing an applicant who is awaiting fees: close the pending student and cancel the unpaid admission invoice. */
    public function abandon(AdmissionApplication $application, string $reason): void
    {
        $student = $application->student;
        if (! $student || $student->status !== Student::PENDING_CLEARANCE) {
            return;
        }

        $student->forceFill(['status' => 'withdrawn'])->save();
        $invoice = $application->admissionInvoice;
        if ($invoice && $invoice->status !== 'cancelled' && bccomp((string) $invoice->paid, '0', 2) === 0 && ! $invoice->allocations()->exists()) {
            $this->billing->cancel($invoice, "Applicant withdrawn before fee clearance — {$reason}");
        }
    }

    /** Settle active agreements whose receipts have reached the promised amount. Returns how many were honoured. */
    public function refreshAgreements(?Student $student = null): int
    {
        $honoured = 0;
        $agreements = FeePaymentAgreement::active()->with('student')->when($student, fn ($q) => $q->where('student_id', $student->id))->get();

        foreach ($agreements as $agreement) {
            if (! $agreement->student || bccomp($this->progress($agreement), (string) $agreement->amount, 2) < 0) {
                continue;
            }
            $agreement->forceFill(['status' => 'honoured', 'settled_at' => now()])->save();
            AuditLogger::log('honoured', $agreement, "Payment agreement for {$agreement->student->full_name} honoured", module: 'fees');
            $this->notifyUsers(array_filter([$agreement->authorized_by]), 'Payment agreement honoured', "{$agreement->student->full_name} ({$agreement->student->admission_no}) has paid the agreed amount.", '/fees/clearance?tab=agreements', 'success');
            $honoured++;
        }

        return $honoured;
    }

    /** Amount the student has paid since the agreement was made. */
    public function progress(FeePaymentAgreement $agreement): string
    {
        $paid = bcsub($this->paid($agreement->student), (string) $agreement->paid_baseline, 2);

        return bccomp($paid, '0', 2) > 0 ? $paid : '0.00';
    }

    /**
     * Daily follow-up for the current school: honour settled agreements, then notify finance and the authorizer
     * about agreements falling due soon and those past their agreed date.
     *
     * @return array{honoured:int, due_soon:int, overdue:int}
     */
    public function followUp(): array
    {
        $result = ['honoured' => $this->refreshAgreements(), 'due_soon' => 0, 'overdue' => 0];
        $today = today();

        $active = FeePaymentAgreement::active()->with('student:id,first_name,middle_name,last_name,admission_no')->get();
        foreach ($active as $agreement) {
            $student = $agreement->student;
            if (! $student) {
                continue;
            }
            $left = bcsub((string) $agreement->amount, $this->progress($agreement), 2);
            $label = "{$student->full_name} ({$student->admission_no})";
            $due = $agreement->due_date->format('d M Y');

            if ($agreement->due_date->lt($today)) {
                if ($agreement->overdue_notified_on && $agreement->overdue_notified_on->gt($today->subDays(self::OVERDUE_RENOTIFY_DAYS))) {
                    continue;
                }
                $days = (int) $agreement->due_date->diffInDays($today);
                $this->notifyFinance('Payment agreement overdue', "{$label}: ".number_format((float) $left)." still unpaid, {$days} day(s) past the agreed date ({$due}).", 'danger', also: array_filter([$agreement->authorized_by]));
                $agreement->forceFill(['overdue_notified_on' => $today])->save();
                $result['overdue']++;
            } elseif ($agreement->due_date->lte($today->addDays(self::DUE_SOON_DAYS)) && ! $agreement->due_soon_notified_on) {
                $this->notifyFinance('Payment agreement due soon', "{$label}: ".number_format((float) $left)." is due by {$due}.", 'warning', also: array_filter([$agreement->authorized_by]));
                $agreement->forceFill(['due_soon_notified_on' => $today])->save();
                $result['due_soon']++;
            }
        }

        return $result;
    }

    /** Activate the pending student, open their enrolment and mark the application enrolled. */
    protected function complete(AdmissionApplication $application, User $by, string $clearance): Student
    {
        $student = Student::whereKey($application->student_id)->lockForUpdate()->firstOrFail();
        $student->forceFill(['status' => 'active'])->save();

        $year = AcademicYear::currentFor($student->school_class_id);
        if ($year && ! Enrolment::where('student_id', $student->id)->where('academic_year_id', $year->id)->exists()) {
            Enrolment::create([
                'student_id' => $student->id,
                'academic_year_id' => $year->id,
                'school_class_id' => $student->school_class_id,
                'stream_id' => $student->stream_id,
                'status' => 'active',
                'start_date' => $student->admission_date?->toDateString() ?? today()->toDateString(),
                'remarks' => "Admitted via application {$application->application_no}",
            ]);
        }

        $application->forceFill([
            'status' => 'enrolled',
            'fee_clearance' => $clearance,
            'fee_cleared_at' => now(),
            'fee_cleared_by' => $by->id,
        ])->save();

        return $student;
    }

    protected function assertAwaiting(AdmissionApplication $application): void
    {
        if ($application->status !== 'awaiting_fees' || ! $application->student) {
            throw ValidationException::withMessages(['clearance' => 'This applicant is not awaiting fee clearance.']);
        }
    }

    /** Round half-up percentage of a money amount. */
    protected function percentOf(string $amount, string $percent): string
    {
        $raw = bcdiv(bcmul($amount, $percent, 6), '100', 6);

        return bcadd($raw, '0.005', 2);
    }

    /**
     * In-app notice to this school's finance team (fees.manage holders) plus any extra users.
     *
     * @param  array<int, int>  $also
     */
    protected function notifyFinance(string $title, string $message, string $type, array $also = [], ?int $except = null): void
    {
        $ids = $this->financeUsers()->pluck('id')->merge($also)->unique()->reject(fn ($id) => $id === $except)->values()->all();
        $this->notifyUsers($ids, $title, $message, '/fees/clearance?tab=agreements', $type);
    }

    /** @param  array<int, int>  $ids */
    protected function notifyUsers(array $ids, string $title, string $message, string $url, string $type): void
    {
        if (! $ids) {
            return;
        }
        Notification::send(User::whereIn('id', $ids)->where('status', 'active')->get(), new SchoolNotification($title, $message, $url, $type));
    }

    /** @return Collection<int, User> */
    protected function financeUsers(): Collection
    {
        $tenancy = app(Tenancy::class);

        return User::with('role')->where('tenant_id', $tenancy->tenantId())->where('status', 'active')
            ->where(fn ($q) => $q->where('school_id', $tenancy->schoolId())->orWhereNull('school_id'))
            ->get()->filter(fn (User $u) => ! $u->is_super_admin && $u->role?->allows('fees.manage'))->values();
    }
}
