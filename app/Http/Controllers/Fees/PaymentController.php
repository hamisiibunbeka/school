<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Student;
use App\Services\Fees\AmountInWords;
use App\Services\Fees\FeeAccounts;
use App\Services\Fees\PaymentService;
use App\Support\Lookups;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class PaymentController extends Controller
{
    private const FILTERS = ['search', 'method', 'status', 'from', 'to'];

    public function __construct(protected PaymentService $payments) {}

    public function index(Request $request): Response
    {
        $filters = $request->only(self::FILTERS);
        $schoolId = $this->tenancy()->schoolId();

        $payments = $this->filtered($filters)
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,photo_path', 'student.schoolClass:id,name', 'depositAccount:id,code,name', 'receiver:id,name'])
            ->latest('payment_date')->latest('id')
            ->paginate($this->perPage())->withQueryString()
            ->through(fn (Payment $p) => [
                'id' => $p->id,
                'receipt_no' => $p->receipt_no,
                'payment_date' => $p->payment_date?->toDateString(),
                'student_id' => $p->student_id,
                'student' => $p->student?->full_name,
                'photo_url' => $p->student?->photo_url,
                'admission_no' => $p->student?->admission_no,
                'class' => $p->student?->schoolClass?->name,
                'amount' => (string) $p->amount,
                'unallocated' => (string) $p->unallocated,
                'method' => $p->method,
                'reference' => $p->reference,
                'payer_name' => $p->payer_name,
                'account' => $p->depositAccount ? "{$p->depositAccount->code} · {$p->depositAccount->name}" : null,
                'received_by' => $p->receiver?->name,
                'status' => $p->status,
            ]);

        $posted = fn () => $this->filtered($filters)->where('status', 'posted');
        $totals = $posted()->selectRaw('COUNT(*) as n, COALESCE(SUM(amount),0) as total, COALESCE(SUM(unallocated),0) as credit')->first();

        $byMethod = $posted()->selectRaw('method, COUNT(*) as n, COALESCE(SUM(amount),0) as total')->groupBy('method')->get()
            ->map(fn ($r) => ['method' => $r->method, 'count' => (int) $r->n, 'total' => (string) $r->total])->values();

        // Monthly collections for the last 12 months (independent of the filters, posted receipts only).
        $start = now()->startOfMonth()->subMonths(11);
        $monthlyRaw = DB::table('payments')->where('school_id', $schoolId)->where('status', 'posted')
            ->whereDate('payment_date', '>=', $start->toDateString())
            ->selectRaw("DATE_FORMAT(payment_date, '%Y-%m') as ym, SUM(amount) as total")
            ->groupBy('ym')->pluck('total', 'ym');
        $monthly = [];
        for ($i = 0; $i < 12; $i++) {
            $m = $start->addMonths($i);
            $monthly[] = ['month' => $m->format('M y'), 'total' => (float) ($monthlyRaw[$m->format('Y-m')] ?? 0)];
        }

        $base = DB::table('payments')->where('school_id', $schoolId)->where('status', 'posted');

        return Inertia::render('fees/payments/index', [
            'payments' => $payments,
            'filters' => array_merge(array_fill_keys(self::FILTERS, ''), $filters),
            'stats' => [
                'count' => (int) $totals->n,
                'total' => (string) $totals->total,
                'credit' => (string) $totals->credit,
                'today' => (string) (clone $base)->whereDate('payment_date', now()->toDateString())->sum('amount'),
                'month' => (string) (clone $base)->whereBetween('payment_date', [now()->startOfMonth()->toDateString(), now()->toDateString()])->sum('amount'),
                'voided' => DB::table('payments')->where('school_id', $schoolId)->where('status', 'void')->count(),
            ],
            'byMethod' => $byMethod,
            'monthly' => $monthly,
            'methods' => Lookups::enum(Payment::METHODS),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(self::FILTERS);
        $this->audit('exported', null, 'Exported fee receipts', 'fees', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv(escape: '', stream: $out, fields: ['Receipt No', 'Date', 'Admission No', 'Student', 'Class', 'Method', 'Reference', 'Payer', 'Deposit Account', 'Amount', 'Unallocated', 'Status', 'Void Reason']);
            $this->filtered($filters)->with(['student.schoolClass', 'depositAccount'])->orderBy('payment_date')->orderBy('id')
                ->chunk(500, function ($chunk) use ($out) {
                    foreach ($chunk as $p) {
                        fputcsv(escape: '', stream: $out, fields: [$p->receipt_no, $p->payment_date?->toDateString(), $p->student?->admission_no, $p->student?->full_name, $p->student?->schoolClass?->name,
                            $p->method, $p->reference, $p->payer_name, $p->depositAccount ? "{$p->depositAccount->code} {$p->depositAccount->name}" : '', $p->amount, $p->unallocated, $p->status, $p->void_reason]);
                    }
                });
            fclose($out);
        }, 'receipts-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    /** Live student search (JSON) used by the collect-payment and invoice screens. */
    public function searchStudents(Request $request): JsonResponse
    {
        $term = trim($request->string('q')->toString());
        if (mb_strlen($term) < 2) {
            return response()->json([]);
        }

        $students = Student::search($term)->with(['schoolClass:id,name', 'stream:id,name'])
            ->whereNotIn('status', ['archived'])
            ->orderBy('first_name')->limit(12)->get();

        $balances = Invoice::whereIn('student_id', $students->pluck('id'))->billable()
            ->groupBy('student_id')->selectRaw('student_id, SUM(balance) as balance')->pluck('balance', 'student_id');

        return response()->json($students->map(fn (Student $s) => [
            'id' => $s->id,
            'full_name' => $s->full_name,
            'admission_no' => $s->admission_no,
            'photo_url' => $s->photo_url,
            'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
            'status' => $s->status,
            'balance' => (string) ($balances[$s->id] ?? '0'),
        ])->values());
    }

    public function create(Request $request, FeeAccounts $accounts): Response
    {
        $student = $request->integer('student') ? Student::with(['schoolClass:id,name', 'stream:id,name', 'guardians'])->find($request->integer('student')) : null;

        $defaults = [];
        foreach (Payment::METHODS as $method) {
            try {
                $defaults[$method] = $accounts->depositFor($method);
            } catch (Throwable) {
                $defaults[$method] = null;
            }
        }

        $context = null;
        if ($student) {
            $open = Invoice::where('student_id', $student->id)->open()
                ->orderByRaw('COALESCE(due_date, issue_date)')->orderBy('issue_date')->orderBy('id')
                ->with('term:id,name')->get();
            $guardian = $student->guardians->firstWhere('pivot.is_primary', true) ?? $student->guardians->first();
            $credit = Payment::posted()->where('student_id', $student->id)->sum('unallocated');

            $context = [
                'id' => $student->id,
                'full_name' => $student->full_name,
                'admission_no' => $student->admission_no,
                'photo_url' => $student->photo_url,
                'class' => trim(($student->schoolClass?->name ?? '').' '.($student->stream?->name ?? '')),
                'residence_type' => $student->residence_type,
                'status' => $student->status,
                'guardian' => $guardian ? ['name' => $guardian->full_name, 'phone' => $guardian->phone] : null,
                'balance' => (string) $open->sum('balance'),
                'credit' => (string) $credit,
                'invoices' => $open->map(fn (Invoice $i) => [
                    'id' => $i->id,
                    'invoice_no' => $i->invoice_no,
                    'term' => $i->term?->name,
                    'issue_date' => $i->issue_date?->toDateString(),
                    'due_date' => $i->due_date?->toDateString(),
                    'total' => (string) $i->total,
                    'paid' => (string) $i->paid,
                    'balance' => (string) $i->balance,
                    'status' => $i->status,
                ])->values(),
                'recent' => Payment::where('student_id', $student->id)->latest('payment_date')->latest('id')->limit(5)
                    ->get(['id', 'receipt_no', 'payment_date', 'amount', 'method', 'status'])
                    ->map(fn ($p) => ['id' => $p->id, 'receipt_no' => $p->receipt_no, 'payment_date' => $p->payment_date?->toDateString(), 'amount' => (string) $p->amount, 'method' => $p->method, 'status' => $p->status]),
            ];
        }

        return Inertia::render('fees/payments/create', [
            'student' => $context,
            'methods' => Lookups::enum(Payment::METHODS),
            'accounts' => Lookups::cashAccounts(),
            'defaultAccounts' => $defaults,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $schoolId)],
            'amount' => ['required', 'numeric', 'gt:0', 'max:9999999999'],
            'method' => ['required', Rule::in(Payment::METHODS)],
            'reference' => [
                Rule::requiredIf(fn () => $request->input('method') !== 'cash'),
                'nullable', 'string', 'max:100',
                Rule::unique('payments', 'reference')->where('school_id', $schoolId)->where('method', $request->input('method')),
            ],
            'payer_name' => ['nullable', 'string', 'max:120'],
            'deposit_account_id' => ['nullable', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->whereIn('sub_type', ['cash', 'bank', 'mobile_money'])],
            'payment_date' => ['required', 'date', 'before_or_equal:today'],
            'notes' => ['nullable', 'string', 'max:255'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.invoice_id' => ['required', Rule::exists('invoices', 'id')->where('school_id', $schoolId)],
            'allocations.*.amount' => ['nullable', 'numeric', 'min:0'],
        ], [
            'reference.unique' => 'Reference ":input" has already been recorded for this payment method — duplicate payments are not allowed.',
            'reference.required' => 'A transaction reference is required for non-cash payments.',
        ]);

        // Manual allocations must not exceed the amount received.
        $allocated = array_reduce($data['allocations'] ?? [], fn ($c, $a) => bcadd($c, (string) ($a['amount'] ?? 0), 2), '0');
        if (bccomp($allocated, bcadd((string) $data['amount'], '0', 2), 2) > 0) {
            return back()->withErrors(['allocations' => 'The amounts allocated exceed the amount received.']);
        }

        $payment = $this->payments->receive($data);
        $this->toast("Receipt {$payment->receipt_no} saved and posted to the ledger.");

        return to_route('fees.payments.show', $payment);
    }

    public function show(Payment $payment): Response
    {
        $payment->load([
            'student.schoolClass:id,name', 'student.stream:id,name', 'depositAccount:id,code,name', 'receiver:id,name',
            'journal:id,journal_no,status', 'allocations.invoice:id,invoice_no,issue_date,total,paid,balance,status,term_id', 'allocations.invoice.term:id,name',
        ]);
        $currency = $this->tenancy()->school()?->currency ?? 'TZS';

        // Account balance as at this receipt (invoices issued up to the date minus receipts up to and including this one).
        $billed = Invoice::where('student_id', $payment->student_id)->billable()->whereDate('issue_date', '<=', $payment->payment_date)->sum('total');
        $paid = Payment::posted()->where('student_id', $payment->student_id)
            ->where(fn ($q) => $q->whereDate('payment_date', '<', $payment->payment_date)
                ->orWhere(fn ($w) => $w->whereDate('payment_date', $payment->payment_date)->where('id', '<=', $payment->id)))
            ->sum('amount');

        return Inertia::render('fees/payments/show', [
            'payment' => [
                'id' => $payment->id,
                'receipt_no' => $payment->receipt_no,
                'payment_date' => $payment->payment_date?->toDateString(),
                'amount' => (string) $payment->amount,
                'amount_words' => AmountInWords::convert((string) $payment->amount, $currency),
                'unallocated' => (string) $payment->unallocated,
                'method' => $payment->method,
                'reference' => $payment->reference,
                'payer_name' => $payment->payer_name,
                'notes' => $payment->notes,
                'status' => $payment->status,
                'void_reason' => $payment->void_reason,
                'account' => $payment->depositAccount ? "{$payment->depositAccount->code} · {$payment->depositAccount->name}" : null,
                'received_by' => $payment->receiver?->name,
                'created_at' => $payment->created_at?->toDateTimeString(),
                'journal' => $payment->journal ? ['id' => $payment->journal->id, 'journal_no' => $payment->journal->journal_no, 'status' => $payment->journal->status] : null,
                'allocations' => $payment->allocations->map(fn ($a) => [
                    'id' => $a->id,
                    'invoice_id' => $a->invoice_id,
                    'invoice_no' => $a->invoice?->invoice_no,
                    'term' => $a->invoice?->term?->name,
                    'invoice_total' => (string) $a->invoice?->total,
                    'amount' => (string) $a->amount,
                    'invoice_balance' => (string) $a->invoice?->balance,
                ]),
                'balance_after' => bcsub((string) $billed, (string) $paid, 2),
            ],
            'student' => $payment->student ? [
                'id' => $payment->student->id,
                'full_name' => $payment->student->full_name,
                'admission_no' => $payment->student->admission_no,
                'class' => trim(($payment->student->schoolClass?->name ?? '').' '.($payment->student->stream?->name ?? '')),
                'current_balance' => $payment->student->feeBalance(),
            ] : null,
        ]);
    }

    public function void(Request $request, Payment $payment): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:200']]);
        $this->payments->void($payment, $data['reason']);
        $this->toast("Receipt {$payment->receipt_no} voided; the journal was reversed and invoice balances restored.");

        return back();
    }

    /** @param  array<string, mixed>  $filters */
    private function filtered(array $filters): Builder
    {
        return Payment::query()
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('receipt_no', 'like', "%{$s}%")
                ->orWhere('reference', 'like', "%{$s}%")->orWhere('payer_name', 'like', "%{$s}%")
                ->orWhereHas('student', fn ($st) => $st->search($s))))
            ->when($filters['method'] ?? null, fn ($q, $m) => $q->where('method', $m))
            ->when($filters['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($filters['from'] ?? null, fn ($q, $d) => $q->whereDate('payment_date', '>=', $d))
            ->when($filters['to'] ?? null, fn ($q, $d) => $q->whereDate('payment_date', '<=', $d));
    }
}
