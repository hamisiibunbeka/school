<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\FeeCategory;
use App\Models\Invoice;
use App\Models\InvoiceLayout;
use App\Models\Student;
use App\Models\Term;
use App\Services\Fees\BillingService;
use App\Services\Fees\InvoiceDocument;
use App\Services\Fees\PaymentInstructions;
use App\Support\Lookups;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InvoiceController extends Controller
{
    private const FILTERS = ['search', 'status', 'class', 'term', 'overdue'];

    public function __construct(protected BillingService $billing) {}

    public function index(Request $request): Response
    {
        $filters = $request->only(self::FILTERS);

        $invoices = $this->filtered($filters)
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,stream_id,photo_path', 'student.schoolClass:id,name', 'student.stream:id,name', 'term:id,name'])
            ->latest('issue_date')->latest('id')
            ->paginate($this->perPage())->withQueryString()
            ->through(fn (Invoice $i) => $this->row($i));

        $totals = $this->filtered($filters)->whereNotIn('status', ['cancelled', 'draft'])
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(total),0) as billed, COALESCE(SUM(paid),0) as paid, COALESCE(SUM(balance),0) as outstanding, COALESCE(SUM(discount),0) as discount')
            ->first();
        $overdue = $this->filtered($filters)->open()->whereDate('due_date', '<', now()->toDateString())->count();

        $current = Term::current();

        return Inertia::render('fees/invoices/index', [
            'invoices' => $invoices,
            'filters' => array_merge(array_fill_keys(self::FILTERS, ''), $filters),
            'stats' => [
                'count' => (int) $totals->n,
                'billed' => (string) $totals->billed,
                'paid' => (string) $totals->paid,
                'outstanding' => (string) $totals->outstanding,
                'discount' => (string) $totals->discount,
                'overdue' => $overdue,
                'rate' => (float) $totals->billed > 0 ? round(((float) $totals->paid / (float) $totals->billed) * 100, 1) : null,
            ],
            'classes' => Lookups::classes(),
            'terms' => Lookups::terms(),
            'currentTermId' => $current?->id,
            'statuses' => Lookups::enum(Invoice::STATUSES),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(self::FILTERS);
        $this->audit('exported', null, 'Exported fee invoices', 'fees', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv(escape: '', stream: $out, fields: ['Invoice No', 'Issue Date', 'Due Date', 'Admission No', 'Student', 'Class', 'Term', 'Subtotal', 'Discount', 'Total', 'Paid', 'Balance', 'Status']);
            $this->filtered($filters)->with(['student.schoolClass', 'term'])->orderBy('issue_date')->orderBy('id')
                ->chunk(500, function ($chunk) use ($out) {
                    foreach ($chunk as $i) {
                        fputcsv(escape: '', stream: $out, fields: [$i->invoice_no, $i->issue_date?->toDateString(), $i->due_date?->toDateString(), $i->student?->admission_no, $i->student?->full_name,
                            $i->student?->schoolClass?->name, $i->term?->name, $i->subtotal, $i->discount, $i->total, $i->paid, $i->balance, $i->status]);
                    }
                });
            fclose($out);
        }, 'invoices-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    /** JSON preview of a batch run (counts and totals) before the user confirms. */
    public function preview(Request $request): JsonResponse
    {
        $data = $this->batchRules($request, false);
        $term = Term::findOrFail($data['term_id']);

        return response()->json($this->billing->preview($term, array_map('intval', $data['class_ids'])));
    }

    public function generate(Request $request): RedirectResponse
    {
        $data = $this->batchRules($request, true);
        $term = Term::findOrFail($data['term_id']);

        $result = $this->billing->generate($term, array_map('intval', $data['class_ids']), $data['issue_date'], $data['due_date'] ?? null, $data['notes'] ?? null);

        $this->audit('generated', null, "Batch-generated {$result['count']} invoice(s) for {$term->name} totalling {$result['total']}", 'fees', null, $data);
        $this->toast($result['count'] > 0
            ? "{$result['count']} invoice(s) issued and posted to the ledger."
            : 'No new invoices were needed — every student is already invoiced for this term.', $result['count'] > 0 ? 'success' : 'info');

        return to_route('fees.invoices.index', ['term' => $term->id]);
    }

    public function create(Request $request): Response
    {
        $student = $request->integer('student') ? Student::with('schoolClass:id,name', 'stream:id,name')->find($request->integer('student')) : null;

        return Inertia::render('fees/invoices/create', [
            'student' => $student ? $this->studentCard($student) : null,
            'categories' => FeeCategory::where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($c) => ['value' => $c->id, 'label' => $c->name]),
            'terms' => Lookups::terms(),
            'currentTermId' => Term::current()?->id,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $schoolId)],
            'term_id' => ['nullable', Rule::exists('terms', 'id')->where('school_id', $schoolId)],
            'issue_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
            'notes' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.fee_category_id' => ['nullable', Rule::exists('fee_categories', 'id')->where('school_id', $schoolId)],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.amount' => ['required', 'numeric', 'gt:0', 'max:9999999999'],
            'lines.*.discount' => ['nullable', 'numeric', 'min:0', 'lte:lines.*.amount'],
        ], [], ['lines.*.description' => 'description', 'lines.*.amount' => 'amount', 'lines.*.discount' => 'discount']);

        $student = Student::findOrFail($data['student_id']);
        $term = ! empty($data['term_id']) ? Term::find($data['term_id']) : null;

        $invoice = $this->billing->issue($student, $data['lines'], [
            'academic_year_id' => $term?->academic_year_id,
            'term_id' => $term?->id,
            'issue_date' => $data['issue_date'],
            'due_date' => $data['due_date'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        $this->toast("Invoice {$invoice->invoice_no} issued and posted.");

        return to_route('fees.invoices.show', $invoice);
    }

    public function show(Invoice $invoice): Response
    {
        $invoice->load([
            'student.schoolClass:id,name', 'student.stream:id,name', 'student.guardians',
            'items.feeCategory:id,name', 'term:id,name', 'academicYear:id,name', 'journal:id,journal_no,status',
            'allocations.payment:id,receipt_no,payment_date,method,reference,status', 'creator:id,name',
        ]);
        $guardian = $invoice->student?->guardians->firstWhere('pivot.is_primary', true) ?? $invoice->student?->guardians->first();
        $studentBalance = $invoice->student ? $invoice->student->feeBalance() : '0';
        $layout = InvoiceLayout::first();

        return Inertia::render('fees/invoices/show', [
            'invoice' => [
                'id' => $invoice->id,
                'invoice_no' => $invoice->invoice_no,
                'issue_date' => $invoice->issue_date?->toDateString(),
                'due_date' => $invoice->due_date?->toDateString(),
                'subtotal' => (string) $invoice->subtotal,
                'discount' => (string) $invoice->discount,
                'total' => (string) $invoice->total,
                'paid' => (string) $invoice->paid,
                'balance' => (string) $invoice->balance,
                'status' => $invoice->status,
                'notes' => $invoice->notes,
                'term' => trim(($invoice->term?->name ?? '').' '.($invoice->academicYear?->name ?? '')) ?: null,
                'journal' => $invoice->journal ? ['id' => $invoice->journal->id, 'journal_no' => $invoice->journal->journal_no, 'status' => $invoice->journal->status] : null,
                'created_by' => $invoice->creator?->name,
                'overdue' => in_array($invoice->status, ['unpaid', 'partial'], true) && $invoice->due_date && $invoice->due_date->lt(now()->startOfDay()),
                'items' => $invoice->items->map(fn ($it) => [
                    'id' => $it->id,
                    'description' => $it->description,
                    'category' => $it->feeCategory?->name,
                    'amount' => (string) $it->amount,
                    'discount' => (string) $it->discount,
                    'net' => $it->net,
                ]),
                'payments' => $invoice->allocations->map(fn ($a) => [
                    'id' => $a->id,
                    'payment_id' => $a->payment_id,
                    'receipt_no' => $a->payment?->receipt_no,
                    'payment_date' => $a->payment?->payment_date?->toDateString(),
                    'method' => $a->payment?->method,
                    'reference' => $a->payment?->reference,
                    'amount' => (string) $a->amount,
                ]),
            ],
            'student' => $invoice->student ? $this->studentCard($invoice->student) + [
                'guardian' => $guardian ? ['name' => $guardian->full_name, 'phone' => $guardian->phone, 'email' => $guardian->email] : null,
                'account_balance' => $studentBalance,
            ] : null,
            'instructions' => PaymentInstructions::forCurrentSchool(),
            // The school's own invoice layout, when it has chosen one; otherwise the standard format is used.
            'layout' => $layout?->layout,
            'document' => $layout ? InvoiceDocument::for($invoice, $this->tenancy()->school()) : null,
        ]);
    }

    public function cancel(Request $request, Invoice $invoice): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:200']]);
        $this->billing->cancel($invoice, $data['reason']);
        $this->toast("Invoice {$invoice->invoice_no} cancelled and its journal reversed.");

        return back();
    }

    /** @param  array<string, mixed>  $filters */
    private function filtered(array $filters): Builder
    {
        return Invoice::query()
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('invoice_no', 'like', "%{$s}%")->orWhereHas('student', fn ($st) => $st->search($s))))
            ->when($filters['status'] ?? null, fn ($q, $s) => $s === 'open' ? $q->open() : $q->where('status', $s))
            ->when($filters['class'] ?? null, fn ($q, $c) => $q->whereHas('student', fn ($st) => $st->where('school_class_id', $c)))
            ->when($filters['term'] ?? null, fn ($q, $t) => $q->where('term_id', $t))
            ->when($filters['overdue'] ?? null, fn ($q) => $q->open()->whereDate('due_date', '<', now()->toDateString()));
    }

    /** @return array<string, mixed> */
    private function row(Invoice $i): array
    {
        return [
            'id' => $i->id,
            'invoice_no' => $i->invoice_no,
            'student_id' => $i->student_id,
            'student' => $i->student?->full_name,
            'photo_url' => $i->student?->photo_url,
            'admission_no' => $i->student?->admission_no,
            'class' => trim(($i->student?->schoolClass?->name ?? '').' '.($i->student?->stream?->name ?? '')),
            'term' => $i->term?->name,
            'issue_date' => $i->issue_date?->toDateString(),
            'due_date' => $i->due_date?->toDateString(),
            'total' => (string) $i->total,
            'paid' => (string) $i->paid,
            'balance' => (string) $i->balance,
            'status' => $i->status,
            'overdue' => in_array($i->status, ['unpaid', 'partial'], true) && $i->due_date && $i->due_date->lt(now()->startOfDay()),
        ];
    }

    /** @return array<string, mixed> */
    private function studentCard(Student $s): array
    {
        return [
            'id' => $s->id,
            'full_name' => $s->full_name,
            'admission_no' => $s->admission_no,
            'photo_url' => $s->photo_url,
            'class' => trim(($s->schoolClass?->name ?? '').' '.($s->stream?->name ?? '')),
            'residence_type' => $s->residence_type,
            'status' => $s->status,
        ];
    }

    /** @return array<string, mixed> */
    private function batchRules(Request $request, bool $full): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'term_id' => ['required', Rule::exists('terms', 'id')->where('school_id', $schoolId)],
            'class_ids' => ['required', 'array', 'min:1'],
            'class_ids.*' => [Rule::exists('school_classes', 'id')->where('school_id', $schoolId)],
            ...($full ? [
                'issue_date' => ['required', 'date'],
                'due_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
                'notes' => ['nullable', 'string', 'max:255'],
            ] : []),
        ]);
    }
}
