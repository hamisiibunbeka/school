<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Models\Expense;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Services\Accounting\LedgerService;
use App\Services\DocumentNumber;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Expenses / payment vouchers with maker-checker approval (SRS 4.10, 13). */
class ExpenseController extends AccountingController
{
    public function __construct(protected LedgerService $ledger) {}

    public function index(Request $request): Response
    {
        $filters = array_merge(
            ['search' => '', 'status' => '', 'account' => '', 'method' => '', 'from' => '', 'to' => ''],
            $request->only(['search', 'status', 'account', 'method', 'from', 'to']),
        );

        $expenses = Expense::query()
            ->with(['expenseAccount:id,code,name', 'paymentAccount:id,code,name', 'supplier:id,name', 'creator:id,name', 'approver:id,name'])
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q
                ->where('voucher_no', 'like', "%{$s}%")
                ->orWhere('payee', 'like', "%{$s}%")
                ->orWhere('description', 'like', "%{$s}%")
                ->orWhere('reference', 'like', "%{$s}%")
                ->orWhereHas('supplier', fn ($q) => $q->where('name', 'like', "%{$s}%"))))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['account'], fn ($q, $v) => $q->where('expense_account_id', $v))
            ->when($filters['method'], fn ($q, $v) => $q->where('payment_method', $v))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('date', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('date', '<=', $d))
            ->orderByDesc('date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Expense $e) => $this->row($e, $request));

        $yearStart = $this->fiscalYearStart();
        $monthStart = now()->startOfMonth()->toDateString();

        $byAccount = Expense::query()
            ->join('accounts', 'accounts.id', '=', 'expenses.expense_account_id')
            ->where('expenses.status', 'paid')
            ->whereDate('expenses.date', '>=', $yearStart)
            ->groupBy('accounts.id', 'accounts.name')
            ->selectRaw('accounts.name, SUM(expenses.amount) as total')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'total' => (string) $r->total]);

        return Inertia::render('accounting/expenses/index', [
            'expenses' => $expenses,
            'filters' => $filters,
            'stats' => [
                'pending' => Expense::where('status', 'pending')->count(),
                'pending_amount' => (string) Expense::where('status', 'pending')->sum('amount'),
                'paid_month' => (string) Expense::where('status', 'paid')->whereDate('date', '>=', $monthStart)->sum('amount'),
                'paid_year' => (string) Expense::where('status', 'paid')->whereDate('date', '>=', $yearStart)->sum('amount'),
                'rejected' => Expense::where('status', 'rejected')->count(),
            ],
            'byAccount' => $byAccount,
            'statuses' => Lookups::enum(Expense::STATUSES),
            'methods' => Lookups::enum(Expense::METHODS),
            'expenseAccounts' => Lookups::accounts('expense'),
            'cashAccounts' => Lookups::cashAccounts(),
            'suppliers' => Supplier::where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['value' => $s->id, 'label' => $s->name]),
        ]);
    }

    public function show(Request $request, Expense $expense): Response
    {
        $expense->load(['expenseAccount', 'paymentAccount', 'supplier', 'creator:id,name', 'approver:id,name', 'journal.lines.account:id,code,name']);

        return Inertia::render('accounting/expenses/show', [
            'expense' => [
                ...$this->row($expense, $request),
                'supplier_phone' => $expense->supplier?->phone,
                'supplier_tin' => $expense->supplier?->tin,
                'created_at' => $expense->created_at?->toIso8601String(),
                'rejection_reason' => $expense->status === 'rejected' ? $this->lastReason($expense, 'rejected') : null,
                'void_reason' => $expense->status === 'void' ? $this->lastReason($expense, 'voided') : null,
                'journal' => $expense->journal ? [
                    'id' => $expense->journal->id,
                    'journal_no' => $expense->journal->journal_no,
                    'status' => $expense->journal->status,
                    'lines' => $expense->journal->lines->map(fn ($l) => [
                        'id' => $l->id, 'code' => $l->account?->code, 'account' => $l->account?->name, 'debit' => $l->debit, 'credit' => $l->credit,
                    ])->all(),
                ] : null,
            ],
            'audits' => $this->auditTrail($expense),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $this->assertOpenPeriod($data['date']);

        $expense = Expense::create([
            ...$data,
            'voucher_no' => DocumentNumber::next('expense'),
            'status' => 'pending',
            'created_by' => $request->user()->id,
        ]);

        $this->audit('created', $expense, "Payment voucher {$expense->voucher_no} raised for ".number_format((float) $expense->amount), 'accounting', null, $data);
        $this->notifyApprovers($expense);
        $this->toast("Voucher {$expense->voucher_no} created and awaiting approval.");

        return back();
    }

    public function update(Request $request, Expense $expense): RedirectResponse
    {
        if ($expense->status !== 'pending') {
            $this->toast('Only pending vouchers can be edited.', 'error');

            return back();
        }

        $data = $this->validated($request);
        $this->assertOpenPeriod($data['date']);
        $old = $expense->only(array_keys($data));
        $expense->update($data);

        $this->audit('updated', $expense, "Payment voucher {$expense->voucher_no} updated", 'accounting', $old, $data);
        $this->toast('Voucher updated.');

        return back();
    }

    public function destroy(Expense $expense): RedirectResponse
    {
        if (! in_array($expense->status, ['pending', 'rejected'], true)) {
            $this->toast('Paid vouchers cannot be deleted — void them instead.', 'error');

            return back();
        }

        $no = $expense->voucher_no;
        $expense->delete();
        $this->audit('deleted', null, "Payment voucher {$no} deleted", 'accounting');
        $this->toast("Voucher {$no} deleted.");

        return to_route('accounting.expenses.index');
    }

    /** Approve & pay: posts Dr expense / Cr cash-bank through the ledger. */
    public function approve(Request $request, Expense $expense): RedirectResponse
    {
        if ($expense->status !== 'pending') {
            $this->toast('Only pending vouchers can be approved.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $expense->created_by, 'voucher');

        $expense->loadMissing('supplier');

        DB::transaction(function () use ($expense, $request) {
            $journal = $this->ledger->record([
                'date' => $expense->date->toDateString(),
                'type' => 'expense',
                'reference' => $expense->voucher_no,
                'narration' => "{$expense->voucher_no}: {$expense->description} — {$expense->payeeName()}",
            ], [
                ['account_id' => $expense->expense_account_id, 'debit' => (string) $expense->amount, 'narration' => $expense->description],
                ['account_id' => $expense->payment_account_id, 'credit' => (string) $expense->amount, 'narration' => 'Paid to '.$expense->payeeName()],
            ], $expense);

            // Maker of the journal is the voucher's maker; the approver posts it.
            $journal->forceFill(['created_by' => $expense->created_by, 'approved_by' => $request->user()->id])->save();

            $expense->update(['status' => 'paid', 'approved_by' => $request->user()->id, 'journal_id' => $journal->id]);
        });

        $this->audit('approved', $expense, "Payment voucher {$expense->voucher_no} approved and paid", 'accounting');
        if ($expense->created_by && $expense->created_by !== $request->user()->id) {
            User::find($expense->created_by)?->notify(new SchoolNotification('Voucher approved', "Payment voucher {$expense->voucher_no} was approved and posted.", "/accounting/expenses/{$expense->id}", 'success'));
        }
        $this->toast("Voucher {$expense->voucher_no} approved — payment posted to the ledger.");

        return back();
    }

    public function reject(Request $request, Expense $expense): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        if ($expense->status !== 'pending') {
            $this->toast('Only pending vouchers can be rejected.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $expense->created_by, 'voucher');

        $expense->update(['status' => 'rejected', 'approved_by' => $request->user()->id]);
        $this->audit('rejected', $expense, "Payment voucher {$expense->voucher_no} rejected: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        if ($expense->created_by && $expense->created_by !== $request->user()->id) {
            User::find($expense->created_by)?->notify(new SchoolNotification('Voucher rejected', "Payment voucher {$expense->voucher_no} was rejected: {$data['reason']}", "/accounting/expenses/{$expense->id}", 'warning'));
        }
        $this->toast('Voucher rejected.', 'warning');

        return back();
    }

    /** Void a paid voucher by reversing its journal (never edit in place). */
    public function void(Request $request, Expense $expense): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        if ($expense->status !== 'paid') {
            $this->toast('Only paid vouchers can be voided.', 'error');

            return back();
        }
        $this->assertOpenPeriod(now()->toDateString());

        DB::transaction(function () use ($expense, $data) {
            if ($expense->journal && $expense->journal->isPosted()) {
                $this->ledger->reverse($expense->journal, "Void {$expense->voucher_no}: {$data['reason']}");
            }
            $expense->update(['status' => 'void']);
        });

        $this->audit('voided', $expense, "Payment voucher {$expense->voucher_no} voided: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->toast("Voucher {$expense->voucher_no} voided and its journal reversed.", 'warning');

        return back();
    }

    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function row(Expense $e, Request $request): array
    {
        return [
            'id' => $e->id,
            'voucher_no' => $e->voucher_no,
            'date' => $e->date?->toDateString(),
            'expense_account_id' => $e->expense_account_id,
            'expense_account' => $e->expenseAccount ? "{$e->expenseAccount->code} · {$e->expenseAccount->name}" : null,
            'payment_account_id' => $e->payment_account_id,
            'payment_account' => $e->paymentAccount ? "{$e->paymentAccount->code} · {$e->paymentAccount->name}" : null,
            'supplier_id' => $e->supplier_id,
            'supplier' => $e->supplier?->name,
            'payee' => $e->payee,
            'payee_name' => $e->payeeName(),
            'amount' => $e->amount,
            'description' => $e->description,
            'reference' => $e->reference,
            'payment_method' => $e->payment_method,
            'status' => $e->status,
            'created_by' => $e->created_by,
            'creator' => $e->creator?->name,
            'approver' => $e->approver?->name,
            'journal_id' => $e->journal_id,
            'can_approve' => $e->status === 'pending' && $this->canApprove($request, $e->created_by),
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();
        $postable = fn (string $type) => Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('type', $type)->where('is_postable', true)->where('is_active', true);

        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:'.now()->addDays(30)->toDateString()],
            'expense_account_id' => ['required', $postable('expense')],
            'payment_account_id' => ['required', $postable('asset'), Rule::in(Account::cashOrBank()->pluck('id')->all())],
            'supplier_id' => ['nullable', Rule::exists('suppliers', 'id')->where('school_id', $schoolId)],
            'payee' => ['nullable', 'required_without:supplier_id', 'string', 'max:150'],
            'amount' => ['required', 'numeric', 'min:1', 'max:9999999999999'],
            'description' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:100'],
            'payment_method' => ['required', Rule::in(Expense::METHODS)],
        ], [
            'payee.required_without' => 'Choose a supplier or enter the payee name.',
            'payment_account_id.in' => 'Pay from a cash, bank or mobile-money account.',
        ]);

        $data['amount'] = bcadd((string) $data['amount'], '0', 2);

        return $data;
    }

    private function notifyApprovers(Expense $expense): void
    {
        User::where('school_id', $this->tenancy()->schoolId())
            ->where('id', '!=', $expense->created_by)
            ->where('status', 'active')
            ->with('role')
            ->get()
            ->filter(fn (User $u) => $u->hasPermission('accounting.manage'))
            ->each(fn (User $u) => $u->notify(new SchoolNotification(
                'Payment voucher awaiting approval',
                "{$expense->voucher_no}: ".number_format((float) $expense->amount)." — {$expense->description}",
                "/accounting/expenses/{$expense->id}",
                'info',
            )));
    }
}
