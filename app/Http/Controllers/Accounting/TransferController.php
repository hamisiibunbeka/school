<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Models\FundTransfer;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Services\Accounting\LedgerService;
use App\Services\DocumentNumber;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Fund transfers between the school's own cash, bank and mobile-money
 * accounts with maker-checker approval. On approval it posts
 * Dr destination / Dr bank charges / Cr source through the ledger.
 */
class TransferController extends AccountingController
{
    public function __construct(protected LedgerService $ledger) {}

    public function index(Request $request): Response
    {
        $filters = array_merge(
            ['search' => '', 'status' => '', 'account' => '', 'from' => '', 'to' => ''],
            $request->only(['search', 'status', 'account', 'from', 'to']),
        );

        $transfers = FundTransfer::query()
            ->with(['fromAccount:id,code,name', 'toAccount:id,code,name', 'creator:id,name', 'approver:id,name'])
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q
                ->where('transfer_no', 'like', "%{$s}%")
                ->orWhere('reference', 'like', "%{$s}%")
                ->orWhere('description', 'like', "%{$s}%")))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['account'], fn ($q, $v) => $q->where(fn ($q) => $q->where('from_account_id', $v)->orWhere('to_account_id', $v)))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('date', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('date', '<=', $d))
            ->orderByRaw("FIELD(status, 'pending') DESC")
            ->orderByDesc('date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (FundTransfer $t) => $this->row($t, $request));

        $monthStart = now()->startOfMonth()->toDateString();

        return Inertia::render('accounting/transfers/index', [
            'transfers' => $transfers,
            'filters' => $filters,
            'stats' => [
                'pending' => FundTransfer::where('status', 'pending')->count(),
                'pending_amount' => (string) FundTransfer::where('status', 'pending')->sum('amount'),
                'posted_month' => (string) FundTransfer::where('status', 'posted')->whereDate('date', '>=', $monthStart)->sum('amount'),
                'charges_month' => (string) FundTransfer::where('status', 'posted')->whereDate('date', '>=', $monthStart)->sum('charges'),
            ],
            'accounts' => $this->accountOptions(),
            'chargeAccounts' => Lookups::accounts('expense'),
            'defaultChargeAccount' => Account::byCode('6600')?->id,
            'methods' => Lookups::enum(FundTransfer::METHODS),
            'statuses' => Lookups::enum(FundTransfer::STATUSES),
        ]);
    }

    public function show(Request $request, FundTransfer $transfer): Response
    {
        $transfer->load(['fromAccount', 'toAccount', 'chargeAccount', 'creator:id,name', 'approver:id,name', 'journal.lines.account:id,code,name']);

        return Inertia::render('accounting/transfers/show', [
            'transfer' => [
                ...$this->row($transfer, $request),
                'charge_account' => $transfer->chargeAccount ? "{$transfer->chargeAccount->code} · {$transfer->chargeAccount->name}" : null,
                'created_at' => $transfer->created_at?->toIso8601String(),
                'rejection_reason' => $transfer->status === 'rejected' ? $this->lastReason($transfer, 'rejected') : null,
                'void_reason' => $transfer->status === 'void' ? $this->lastReason($transfer, 'voided') : null,
                'journal' => $transfer->journal ? [
                    'id' => $transfer->journal->id,
                    'journal_no' => $transfer->journal->journal_no,
                    'status' => $transfer->journal->status,
                    'lines' => $transfer->journal->lines->map(fn ($l) => [
                        'id' => $l->id, 'code' => $l->account?->code, 'account' => $l->account?->name, 'debit' => $l->debit, 'credit' => $l->credit,
                    ])->all(),
                ] : null,
            ],
            'audits' => $this->auditTrail($transfer),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $this->assertOpenPeriod($data['date']);

        $transfer = FundTransfer::create([
            ...$data,
            'transfer_no' => DocumentNumber::next('transfer'),
            'status' => 'pending',
            'created_by' => $request->user()->id,
        ]);

        $this->audit('created', $transfer, "Fund transfer {$transfer->transfer_no} raised: ".number_format((float) $transfer->amount)." from {$transfer->fromAccount?->name} to {$transfer->toAccount?->name}", 'accounting', null, $data);
        $this->notifyApprovers($transfer);
        $this->toast("Transfer {$transfer->transfer_no} created and awaiting approval.");

        return back();
    }

    public function update(Request $request, FundTransfer $transfer): RedirectResponse
    {
        if ($transfer->status !== 'pending') {
            $this->toast('Only pending transfers can be edited.', 'error');

            return back();
        }

        $data = $this->validated($request);
        $this->assertOpenPeriod($data['date']);
        $old = $transfer->only(array_keys($data));
        $transfer->update($data);

        $this->audit('updated', $transfer, "Fund transfer {$transfer->transfer_no} updated", 'accounting', $old, $data);
        $this->toast('Transfer updated.');

        return back();
    }

    public function destroy(FundTransfer $transfer): RedirectResponse
    {
        if (! in_array($transfer->status, ['pending', 'rejected'], true)) {
            $this->toast('Posted transfers cannot be deleted — void them instead.', 'error');

            return back();
        }

        $no = $transfer->transfer_no;
        $transfer->delete();
        $this->audit('deleted', null, "Fund transfer {$no} deleted", 'accounting');
        $this->toast("Transfer {$no} deleted.");

        return to_route('accounting.transfers.index');
    }

    /** Approve: posts Dr destination (+ Dr bank charges) / Cr source. */
    public function approve(Request $request, FundTransfer $transfer): RedirectResponse
    {
        if ($transfer->status !== 'pending') {
            $this->toast('Only pending transfers can be approved.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $transfer->created_by, 'transfer');
        $this->assertOpenPeriod($transfer->date->toDateString());
        $this->assertFunds($transfer);

        DB::transaction(function () use ($transfer, $request) {
            $from = $transfer->fromAccount;
            $to = $transfer->toAccount;
            $lines = [
                ['account_id' => $to->id, 'debit' => (string) $transfer->amount, 'narration' => "Transfer in from {$from->name}"],
            ];
            if (bccomp((string) $transfer->charges, '0', 2) > 0) {
                $lines[] = ['account_id' => $transfer->charge_account_id, 'debit' => (string) $transfer->charges, 'narration' => "Charges on transfer {$transfer->transfer_no}"];
            }
            $lines[] = ['account_id' => $from->id, 'credit' => $transfer->totalOut(), 'narration' => "Transfer out to {$to->name}"];

            $journal = $this->ledger->record([
                'date' => $transfer->date->toDateString(),
                'type' => 'transfer',
                'reference' => $transfer->reference ?: $transfer->transfer_no,
                'narration' => "{$transfer->transfer_no}: {$transfer->description}",
            ], $lines, $transfer);

            $journal->forceFill(['created_by' => $transfer->created_by, 'approved_by' => $request->user()->id])->save();
            $transfer->update(['status' => 'posted', 'approved_by' => $request->user()->id, 'journal_id' => $journal->id]);
        });

        $this->audit('approved', $transfer, "Fund transfer {$transfer->transfer_no} approved and posted", 'accounting');
        $this->notifyMaker($transfer, $request, 'Transfer approved', "Transfer {$transfer->transfer_no} was approved and posted.", 'success');
        $this->toast("Transfer {$transfer->transfer_no} approved — posted to the ledger.");

        return back();
    }

    public function reject(Request $request, FundTransfer $transfer): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        if ($transfer->status !== 'pending') {
            $this->toast('Only pending transfers can be rejected.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $transfer->created_by, 'transfer');

        $transfer->update(['status' => 'rejected', 'approved_by' => $request->user()->id]);
        $this->audit('rejected', $transfer, "Fund transfer {$transfer->transfer_no} rejected: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->notifyMaker($transfer, $request, 'Transfer rejected', "Transfer {$transfer->transfer_no} was rejected: {$data['reason']}", 'warning');
        $this->toast('Transfer rejected.', 'warning');

        return back();
    }

    /** Void a posted transfer by reversing its journal (never edit in place). */
    public function void(Request $request, FundTransfer $transfer): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        if ($transfer->status !== 'posted') {
            $this->toast('Only posted transfers can be voided.', 'error');

            return back();
        }
        $this->assertOpenPeriod(now()->toDateString());

        DB::transaction(function () use ($transfer, $data) {
            if ($transfer->journal && $transfer->journal->isPosted()) {
                $this->ledger->reverse($transfer->journal, "Void {$transfer->transfer_no}: {$data['reason']}");
            }
            $transfer->update(['status' => 'void']);
        });

        $this->audit('voided', $transfer, "Fund transfer {$transfer->transfer_no} voided: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->toast("Transfer {$transfer->transfer_no} voided and its journal reversed.", 'warning');

        return back();
    }

    // ------------------------------------------------------------------

    /**
     * Cash and mobile money cannot go below zero; banks may run an
     * overdraft, so they are not blocked here.
     */
    private function assertFunds(FundTransfer $transfer): void
    {
        $from = $transfer->fromAccount;
        if ($from->sub_type === 'bank') {
            return;
        }

        $available = $this->ledger->balance($from, null, $transfer->date->toDateString());
        if (bccomp($available, $transfer->totalOut(), 2) < 0) {
            throw ValidationException::withMessages([
                'approval' => "{$from->name} only had ".number_format((float) $available, 2)." on {$transfer->date->format('d/m/Y')}, less than the ".number_format((float) $transfer->totalOut(), 2).' this transfer takes out.',
            ]);
        }
    }

    /** @return array<string, mixed> */
    private function row(FundTransfer $t, Request $request): array
    {
        return [
            'id' => $t->id,
            'transfer_no' => $t->transfer_no,
            'date' => $t->date?->toDateString(),
            'from_account_id' => $t->from_account_id,
            'from_account' => $t->fromAccount ? "{$t->fromAccount->code} · {$t->fromAccount->name}" : null,
            'to_account_id' => $t->to_account_id,
            'to_account' => $t->toAccount ? "{$t->toAccount->code} · {$t->toAccount->name}" : null,
            'amount' => $t->amount,
            'charges' => $t->charges,
            'charge_account_id' => $t->charge_account_id,
            'total_out' => $t->totalOut(),
            'method' => $t->method,
            'reference' => $t->reference,
            'description' => $t->description,
            'status' => $t->status,
            'created_by' => $t->created_by,
            'creator' => $t->creator?->name,
            'approver' => $t->approver?->name,
            'journal_id' => $t->journal_id,
            'can_approve' => $t->status === 'pending' && $this->canApprove($request, $t->created_by),
        ];
    }

    /** Cash / bank / mobile-money accounts with their current balances. */
    private function accountOptions(): array
    {
        return Account::cashOrBank()->where('is_postable', true)->where('is_active', true)->orderBy('code')->get()
            ->map(fn (Account $a) => [
                'value' => $a->id,
                'label' => "{$a->code} · {$a->name}",
                'sub_type' => $a->sub_type,
                'balance' => $this->ledger->balance($a),
            ])->all();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $cashIds = Account::cashOrBank()->where('is_postable', true)->where('is_active', true)->pluck('id')->all();
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'from_account_id' => ['required', Rule::in($cashIds)],
            'to_account_id' => ['required', Rule::in($cashIds), 'different:from_account_id'],
            'amount' => ['required', 'numeric', 'min:1', 'max:9999999999999'],
            'charges' => ['nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'charge_account_id' => [
                Rule::requiredIf(fn () => (float) $request->input('charges') > 0),
                'nullable',
                Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('type', 'expense')->where('is_postable', true)->where('is_active', true),
            ],
            'method' => ['required', Rule::in(FundTransfer::METHODS)],
            'reference' => ['nullable', 'string', 'max:100'],
            'description' => ['required', 'string', 'max:255'],
        ], [
            'from_account_id.in' => 'Transfer from a cash, bank or mobile-money account.',
            'to_account_id.in' => 'Transfer to a cash, bank or mobile-money account.',
            'to_account_id.different' => 'Choose two different accounts.',
            'date.before_or_equal' => 'A transfer cannot be dated in the future.',
            'charge_account_id.required' => 'Choose the expense account for the charges.',
        ]);

        $data['amount'] = bcadd((string) $data['amount'], '0', 2);
        $data['charges'] = bcadd((string) ($data['charges'] ?? 0), '0', 2);
        if (bccomp($data['charges'], '0', 2) === 0) {
            $data['charge_account_id'] = null;
        }

        return $data;
    }

    private function notifyApprovers(FundTransfer $transfer): void
    {
        User::where('school_id', $this->tenancy()->schoolId())
            ->where('id', '!=', $transfer->created_by)
            ->where('status', 'active')
            ->with('role')
            ->get()
            ->filter(fn (User $u) => $u->hasPermission('accounting.manage'))
            ->each(fn (User $u) => $u->notify(new SchoolNotification(
                'Fund transfer awaiting approval',
                "{$transfer->transfer_no}: ".number_format((float) $transfer->amount)." — {$transfer->description}",
                "/accounting/transfers/{$transfer->id}",
                'info',
            )));
    }

    private function notifyMaker(FundTransfer $transfer, Request $request, string $title, string $message, string $type): void
    {
        if ($transfer->created_by && $transfer->created_by !== $request->user()->id) {
            User::find($transfer->created_by)?->notify(new SchoolNotification($title, $message, "/accounting/transfers/{$transfer->id}", $type));
        }
    }
}
