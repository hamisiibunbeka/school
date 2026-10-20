<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Jobs\SendQueuedMessages;
use App\Models\AdmissionApplication;
use App\Models\FeePaymentAgreement;
use App\Models\MessageLog;
use App\Services\Fees\AdmissionClearanceService;
use App\Services\Messaging\GsmText;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Finance desk for admission fee clearance: applicants awaiting payment of the first installment,
 * verification, deferrals (payment agreements) authorized by a head, and agreement follow-up.
 */
class AdmissionClearanceController extends Controller
{
    public function __construct(protected AdmissionClearanceService $clearance) {}

    public function index(Request $request): Response
    {
        $tab = $request->input('tab') === 'agreements' ? 'agreements' : 'pending';
        $search = trim((string) $request->input('search', ''));
        $agreementStatus = $request->input('status', 'open');

        $this->clearance->refreshAgreements();

        $pending = AdmissionApplication::with(['student', 'schoolClass:id,name', 'admissionInvoice:id,invoice_no,total,balance,status'])
            ->where('status', 'awaiting_fees')
            ->when($search, fn ($q) => $q->search($search))
            ->orderBy('decided_at')
            ->get()
            ->map(fn (AdmissionApplication $a) => [
                'id' => $a->id,
                'application_no' => $a->application_no,
                'full_name' => $a->full_name,
                'admission_no' => $a->student?->admission_no,
                'student_id' => $a->student_id,
                'class' => $a->schoolClass?->name,
                'residence_type' => $a->residence_type,
                'guardian_name' => $a->guardian_name,
                'guardian_phone' => $a->guardian_phone,
                'admitted_at' => $a->decided_at?->toDateString(),
                'invoice' => $a->admissionInvoice ? ['id' => $a->admissionInvoice->id, 'invoice_no' => $a->admissionInvoice->invoice_no] : null,
                ...$this->clearance->status($a),
            ]);

        $today = today()->toDateString();
        $agreements = FeePaymentAgreement::with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id', 'student.schoolClass:id,name', 'authorizer:id,name', 'application:id,application_no'])
            ->when($search, fn ($q) => $q->whereHas('student', fn ($s) => $s->search($search)))
            ->when($agreementStatus === 'open', fn ($q) => $q->where('status', 'active'))
            ->when($agreementStatus === 'overdue', fn ($q) => $q->where('status', 'active')->whereDate('due_date', '<', $today))
            ->when(in_array($agreementStatus, ['honoured', 'defaulted', 'cancelled'], true), fn ($q) => $q->where('status', $agreementStatus))
            ->orderByRaw("status = 'active' DESC")->orderBy('due_date')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (FeePaymentAgreement $g) => $this->agreementRow($g));

        $active = FeePaymentAgreement::active()->with('student')->get();
        $overdue = $active->filter(fn ($g) => $g->is_overdue);
        $outstanding = fn ($list) => $list->reduce(fn ($sum, $g) => bcadd($sum, bcsub((string) $g->amount, $this->clearance->progress($g), 2), 2), '0.00');

        return Inertia::render('fees/clearance', [
            'tab' => $tab,
            'filters' => ['search' => $search, 'status' => $agreementStatus],
            'pending' => $pending,
            'agreements' => $agreements,
            'stats' => [
                'pending' => $pending->count(),
                'ready' => $pending->where('ready', true)->count(),
                'active' => $active->count(),
                'active_outstanding' => $outstanding($active),
                'overdue' => $overdue->count(),
                'overdue_outstanding' => $outstanding($overdue),
            ],
        ]);
    }

    /** Finance confirms the first installment is paid: the student is enrolled and joins the directory. */
    public function verify(Request $request, AdmissionApplication $application): RedirectResponse
    {
        $student = $this->clearance->verify($application, $request->user());
        $this->toast("{$student->full_name} cleared and enrolled.");

        return back();
    }

    /** A head authorizes the parent's request to pay later; the student proceeds while the agreement is followed up. */
    public function defer(Request $request, AdmissionApplication $application): RedirectResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'due_date' => ['required', 'date', 'after_or_equal:today'],
            'reason' => ['required', 'string', 'max:2000'],
            'terms' => ['nullable', 'string', 'max:2000'],
            'requested_by' => ['nullable', 'string', 'max:150'],
        ], ['reason.required' => "Record the parent's reason for the delay."], ['due_date' => 'agreed date']);

        $agreement = $this->clearance->defer($application, $data, $request->user());
        $this->toast("Payment agreement authorized — {$application->full_name} is enrolled. Follow-up is due by {$agreement->due_date->format('d M Y')}.");

        return back();
    }

    /** Move the agreed date (a new arrangement with the parent). */
    public function extend(Request $request, FeePaymentAgreement $agreement): RedirectResponse
    {
        $data = $request->validate([
            'due_date' => ['required', 'date', 'after:today'],
            'amount' => ['nullable', 'numeric', 'min:1'],
            'note' => ['required', 'string', 'max:255'],
        ], [], ['due_date' => 'new agreed date']);
        $this->assertActive($agreement);

        $old = ['due_date' => $agreement->due_date->toDateString(), 'amount' => (string) $agreement->amount];
        $agreement->forceFill([
            'due_date' => $data['due_date'],
            'amount' => $data['amount'] ?? $agreement->amount,
            'due_soon_notified_on' => null,
            'overdue_notified_on' => null,
        ])->save();

        $this->audit('extended', $agreement, "Payment agreement for {$agreement->student?->full_name} moved to {$agreement->due_date->format('d M Y')} — {$data['note']}", 'fees',
            $old, ['due_date' => $agreement->due_date->toDateString(), 'amount' => (string) $agreement->amount, 'note' => $data['note']]);
        $this->clearance->refreshAgreements($agreement->student);
        $this->toast('Payment agreement updated.');

        return back();
    }

    /** Close an agreement as defaulted (parent did not pay as agreed) or cancelled. */
    public function close(Request $request, FeePaymentAgreement $agreement): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['defaulted', 'cancelled'])],
            'note' => ['required', 'string', 'max:255'],
        ]);
        $this->assertActive($agreement);

        $agreement->forceFill(['status' => $data['status'], 'settled_at' => now(), 'closing_note' => $data['note']])->save();
        $this->audit($data['status'], $agreement, "Payment agreement for {$agreement->student?->full_name} marked {$data['status']} — {$data['note']}", 'fees');
        $this->toast("Agreement marked {$data['status']}.");

        return back();
    }

    /** Queue an SMS to the primary guardian about the agreed payment. */
    public function remind(Request $request, FeePaymentAgreement $agreement): RedirectResponse
    {
        $this->assertActive($agreement);
        $student = $agreement->student()->with('guardians')->firstOrFail();
        $guardian = $student->guardians->sortByDesc(fn ($g) => (int) $g->pivot->is_primary)->first();
        if (! $guardian?->phone) {
            throw ValidationException::withMessages(['agreement' => 'The student has no guardian phone number on record.']);
        }

        $school = $this->tenancy()->school();
        $left = bcsub((string) $agreement->amount, $this->clearance->progress($agreement), 2);
        $verb = $agreement->is_overdue ? 'was due on' : 'is due by';
        $message = sprintf(
            'Dear %s, as agreed with the school, the fee payment of %s %s for %s (%s) %s %s. Please pay using the admission number as reference. Thank you. - %s',
            $guardian->first_name, $school?->currency ?? 'TZS', number_format((float) $left), $student->first_name, $student->admission_no, $verb, $agreement->due_date->format('d M Y'), $school?->name ?? 'School Bursar',
        );

        MessageLog::create([
            'channel' => 'sms',
            'recipient' => $guardian->phone,
            'recipient_name' => $guardian->full_name,
            'subject' => "Payment agreement reminder: {$student->admission_no}",
            'message' => $message,
            'status' => 'queued',
            'credits' => GsmText::segments($message),
            'sent_by' => $request->user()->id,
        ]);
        SendQueuedMessages::dispatch($this->tenancy()->schoolId());

        $this->audit('reminded', $agreement, "Queued payment agreement reminder SMS to {$guardian->full_name} for {$student->full_name}", 'fees');
        $this->toast("Reminder SMS queued to {$guardian->full_name}.");

        return back();
    }

    private function assertActive(FeePaymentAgreement $agreement): void
    {
        if ($agreement->status !== 'active') {
            throw ValidationException::withMessages(['agreement' => 'This agreement is already closed.']);
        }
    }

    /** @return array<string, mixed> */
    private function agreementRow(FeePaymentAgreement $g): array
    {
        $paid = $g->student ? $this->clearance->progress($g) : '0.00';
        $left = bcsub((string) $g->amount, $paid, 2);

        return [
            'id' => $g->id,
            'student_id' => $g->student_id,
            'full_name' => $g->student?->full_name,
            'admission_no' => $g->student?->admission_no,
            'class' => $g->student?->schoolClass?->name,
            'application' => $g->application ? ['id' => $g->application->id, 'application_no' => $g->application->application_no] : null,
            'amount' => (string) $g->amount,
            'paid' => $paid,
            'outstanding' => bccomp($left, '0', 2) > 0 ? $left : '0.00',
            'due_date' => $g->due_date->toDateString(),
            'days' => (int) today()->diffInDays($g->due_date, false),
            'reason' => $g->reason,
            'terms' => $g->terms,
            'requested_by' => $g->requested_by,
            'status' => $g->is_overdue ? 'overdue' : $g->status,
            'authorizer' => $g->authorizer?->name,
            'created_at' => $g->created_at?->toDateString(),
            'settled_at' => $g->settled_at?->toDateString(),
            'closing_note' => $g->closing_note,
        ];
    }
}
