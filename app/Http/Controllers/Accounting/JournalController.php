<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Models\Expense;
use App\Models\Journal;
use App\Models\User;
use App\Notifications\SchoolNotification;
use App\Services\Accounting\LedgerService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** General journal with maker-checker workflow (SRS 5.3, 13). */
class JournalController extends AccountingController
{
    /** Journal types a user may create by hand. */
    public const MANUAL_TYPES = ['general', 'adjustment', 'accrual', 'prepayment', 'depreciation', 'opening'];

    public const ALL_TYPES = ['general', 'adjustment', 'accrual', 'prepayment', 'depreciation', 'opening', 'fees', 'receipt', 'expense', 'payroll', 'inventory', 'reversal'];

    public const STATUSES = ['draft', 'submitted', 'posted', 'rejected', 'reversed'];

    /** Manual journals may only hit control accounts for these types. */
    private const CONTROL_ALLOWED_TYPES = ['opening', 'adjustment'];

    public function __construct(protected LedgerService $ledger) {}

    public function index(Request $request): Response
    {
        $filters = array_merge(
            ['search' => '', 'status' => '', 'type' => '', 'from' => '', 'to' => '', 'mine' => ''],
            $request->only(['search', 'status', 'type', 'from', 'to', 'mine']),
        );
        $userId = $request->user()->id;

        $journals = Journal::query()
            ->with(['creator:id,name', 'approver:id,name'])
            ->withCount('lines')
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q
                ->where('journal_no', 'like', "%{$s}%")
                ->orWhere('narration', 'like', "%{$s}%")
                ->orWhere('reference', 'like', "%{$s}%")))
            ->when($filters['status'], fn ($q, $s) => $q->where('status', $s))
            ->when($filters['type'], fn ($q, $t) => $q->where('type', $t))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('date', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('date', '<=', $d))
            ->when($filters['mine'] === 'approval', fn ($q) => $q->where('status', 'submitted')->where('created_by', '!=', $userId))
            ->orderByDesc('date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Journal $j) => [
                'id' => $j->id,
                'journal_no' => $j->journal_no,
                'date' => $j->date?->toDateString(),
                'type' => $j->type,
                'reference' => $j->reference,
                'narration' => $j->narration,
                'total' => $j->total,
                'status' => $j->status,
                'lines_count' => $j->lines_count,
                'source' => $j->source_type ? class_basename($j->source_type) : null,
                'creator' => $j->creator?->name,
                'approver' => $j->approver?->name,
                'created_by' => $j->created_by,
            ]);

        $monthStart = now()->startOfMonth()->toDateString();

        return Inertia::render('accounting/journals/index', [
            'journals' => $journals,
            'filters' => $filters,
            'types' => $this->typeOptions(self::ALL_TYPES),
            'statuses' => array_map(fn ($s) => ['value' => $s, 'label' => ucfirst($s)], self::STATUSES),
            'stats' => [
                'draft' => Journal::where('status', 'draft')->count(),
                'submitted' => Journal::where('status', 'submitted')->count(),
                'awaiting_me' => Journal::where('status', 'submitted')->where('created_by', '!=', $userId)->count(),
                'posted_month' => Journal::whereIn('status', ['posted', 'reversed'])->whereDate('date', '>=', $monthStart)->count(),
                'posted_month_total' => (string) Journal::whereIn('status', ['posted', 'reversed'])->whereDate('date', '>=', $monthStart)->sum('total'),
                'reversed' => Journal::where('status', 'reversed')->count(),
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('accounting/journals/form', [
            'journal' => null,
            ...$this->formOptions(),
        ]);
    }

    public function edit(Journal $journal): Response
    {
        $this->assertEditable($journal);
        $journal->load('lines');

        return Inertia::render('accounting/journals/form', [
            'journal' => [
                'id' => $journal->id,
                'journal_no' => $journal->journal_no,
                'date' => $journal->date->toDateString(),
                'type' => $journal->type,
                'reference' => $journal->reference ?? '',
                'narration' => $journal->narration,
                'status' => $journal->status,
                'rejection_reason' => $journal->status === 'rejected' ? $this->lastReason($journal, 'rejected') : null,
                'lines' => $journal->lines->map(fn ($l) => [
                    'account_id' => (string) $l->account_id,
                    'debit' => bccomp((string) $l->debit, '0', 2) ? (string) $l->debit : '',
                    'credit' => bccomp((string) $l->credit, '0', 2) ? (string) $l->credit : '',
                    'narration' => $l->narration ?? '',
                ])->all(),
            ],
            ...$this->formOptions(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        [$header, $lines, $submit] = $this->validated($request);

        $journal = $this->ledger->record($header, $lines, null, false);

        if ($submit) {
            $journal->forceFill(['status' => 'submitted'])->save();
        }

        $this->audit($submit ? 'submitted' : 'created', $journal, "Journal {$journal->journal_no} ".($submit ? 'created and submitted for approval' : 'saved as draft'), 'accounting');
        if ($submit) {
            $this->notifyApprovers($journal);
        }
        $this->toast($submit ? "Journal {$journal->journal_no} submitted for approval." : "Journal {$journal->journal_no} saved as draft.");

        return to_route('accounting.journals.show', $journal);
    }

    public function update(Request $request, Journal $journal): RedirectResponse
    {
        $this->assertEditable($journal);
        [$header, $lines, $submit] = $this->validated($request);

        DB::transaction(function () use ($journal, $header, $lines, $submit) {
            $total = array_reduce($lines, fn ($c, $l) => bcadd($c, $l['debit'], 2), '0');
            $journal->update([
                'date' => $header['date'],
                'type' => $header['type'],
                'reference' => $header['reference'],
                'narration' => $header['narration'],
                'total' => $total,
            ]);
            $journal->forceFill(['status' => $submit ? 'submitted' : 'draft'])->save();
            $journal->lines()->delete();
            $journal->lines()->createMany($lines);
        });

        $this->audit($submit ? 'submitted' : 'updated', $journal, "Journal {$journal->journal_no} ".($submit ? 'updated and submitted for approval' : 'updated'), 'accounting');
        if ($submit) {
            $this->notifyApprovers($journal);
        }
        $this->toast($submit ? 'Journal submitted for approval.' : 'Draft journal updated.');

        return to_route('accounting.journals.show', $journal);
    }

    public function destroy(Journal $journal): RedirectResponse
    {
        $this->assertEditable($journal);

        $no = $journal->journal_no;
        DB::transaction(function () use ($journal) {
            $journal->lines()->delete();
            $journal->delete();
        });

        $this->audit('deleted', null, "Unposted journal {$no} deleted", 'accounting');
        $this->toast("Journal {$no} deleted.");

        return to_route('accounting.journals.index');
    }

    public function show(Request $request, Journal $journal): Response
    {
        $journal->load(['lines.account:id,code,name,type,is_control', 'creator:id,name', 'approver:id,name', 'reversalOf:id,journal_no']);
        $reversedBy = Journal::where('reversal_of_id', $journal->id)->first(['id', 'journal_no', 'date']);

        return Inertia::render('accounting/journals/show', [
            'journal' => [
                'id' => $journal->id,
                'journal_no' => $journal->journal_no,
                'date' => $journal->date->toDateString(),
                'type' => $journal->type,
                'reference' => $journal->reference,
                'narration' => $journal->narration,
                'total' => $journal->total,
                'status' => $journal->status,
                'creator' => $journal->creator?->name,
                'approver' => $journal->approver?->name,
                'created_by' => $journal->created_by,
                'created_at' => $journal->created_at?->toIso8601String(),
                'posted_at' => $journal->posted_at?->toIso8601String(),
                'source' => $this->sourceLink($journal),
                'reversal_of' => $journal->reversalOf ? ['id' => $journal->reversalOf->id, 'journal_no' => $journal->reversalOf->journal_no] : null,
                'reversed_by' => $reversedBy ? ['id' => $reversedBy->id, 'journal_no' => $reversedBy->journal_no, 'date' => $reversedBy->date?->toDateString()] : null,
                'rejection_reason' => $journal->status === 'rejected' ? $this->lastReason($journal, 'rejected') : null,
                'lines' => $journal->lines->map(fn ($l) => [
                    'id' => $l->id,
                    'account_id' => $l->account_id,
                    'code' => $l->account?->code,
                    'account' => $l->account?->name,
                    'is_control' => (bool) $l->account?->is_control,
                    'narration' => $l->narration,
                    'debit' => $l->debit,
                    'credit' => $l->credit,
                ])->all(),
            ],
            'audits' => $this->auditTrail($journal),
            'permissions' => [
                'edit' => $request->user()->can('accounting.manage') && in_array($journal->status, ['draft', 'rejected'], true),
                'submit' => $request->user()->can('accounting.manage') && $journal->status === 'draft',
                'approve' => $journal->status === 'submitted' && $this->canApprove($request, $journal->created_by),
                'reverse' => $request->user()->can('accounting.manage') && $journal->status === 'posted' && $this->reversibleHere($journal),
                'is_maker' => $journal->created_by === $request->user()->id,
            ],
            'reverseBlockedReason' => $journal->status === 'posted' && ! $this->reversibleHere($journal)
                ? 'This journal was generated by the '.class_basename((string) $journal->source_type).' sub-ledger; correct it from the originating module so the sub-ledger stays in agreement.'
                : null,
        ]);
    }

    public function submit(Journal $journal): RedirectResponse
    {
        if ($journal->status !== 'draft') {
            $this->toast('Only draft journals can be submitted.', 'error');

            return back();
        }

        $journal->forceFill(['status' => 'submitted'])->save();
        $this->audit('submitted', $journal, "Journal {$journal->journal_no} submitted for approval", 'accounting');
        $this->notifyApprovers($journal);
        $this->toast('Journal submitted for approval.');

        return back();
    }

    public function approve(Request $request, Journal $journal): RedirectResponse
    {
        if ($journal->status !== 'submitted') {
            $this->toast('Only submitted journals can be approved.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $journal->created_by);

        DB::transaction(function () use ($journal, $request) {
            $journal->forceFill(['approved_by' => $request->user()->id])->save();
            $this->ledger->post($journal);
        });

        $this->audit('approved', $journal, "Journal {$journal->journal_no} approved and posted", 'accounting');
        $this->notifyMaker($journal, 'Journal approved', "Journal {$journal->journal_no} was approved and posted by {$request->user()->name}.", 'success');
        $this->toast("Journal {$journal->journal_no} approved and posted to the ledger.");

        return back();
    }

    public function reject(Request $request, Journal $journal): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        if ($journal->status !== 'submitted') {
            $this->toast('Only submitted journals can be rejected.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $journal->created_by);

        $journal->forceFill(['status' => 'rejected', 'approved_by' => null])->save();
        $this->audit('rejected', $journal, "Journal {$journal->journal_no} rejected: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->notifyMaker($journal, 'Journal rejected', "Journal {$journal->journal_no} was rejected: {$data['reason']}", 'warning');
        $this->toast('Journal rejected and returned to the maker.', 'warning');

        return back();
    }

    public function reverse(Request $request, Journal $journal): RedirectResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'date' => ['nullable', 'date'],
        ]);

        if (! $journal->isPosted()) {
            $this->toast('Only posted journals can be reversed.', 'error');

            return back();
        }
        if (! $this->reversibleHere($journal)) {
            $this->toast('Sub-ledger journals must be corrected from their originating module.', 'error');

            return back();
        }

        $date = $data['date'] ?? now()->toDateString();
        $this->assertOpenPeriod($date);

        $reversal = DB::transaction(function () use ($journal, $data, $date) {
            $reversal = $this->ledger->reverse($journal, $data['reason'], $date);

            if ($journal->source_type && class_basename($journal->source_type) === 'Expense' && $journal->source instanceof Expense && $journal->source->status === 'paid') {
                $journal->source->update(['status' => 'void']);
                $this->audit('voided', $journal->source, "Voucher {$journal->source->voucher_no} voided by reversal of {$journal->journal_no}", 'accounting', null, ['reason' => $data['reason']]);
            }

            return $reversal;
        });

        $this->audit('reversed', $journal, "Journal {$journal->journal_no} reversed by {$reversal->journal_no}: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->toast("Journal reversed by {$reversal->journal_no}.");

        return to_route('accounting.journals.show', $reversal);
    }

    // ------------------------------------------------------------------

    private function reversibleHere(Journal $journal): bool
    {
        return ! $journal->source_type || in_array(class_basename($journal->source_type), ['Expense', 'BankReconciliation'], true);
    }

    private function assertEditable(Journal $journal): void
    {
        if (! in_array($journal->status, ['draft', 'rejected'], true) || $journal->source_type) {
            abort(403, 'Only draft or rejected manual journals can be changed. Posted journals are immutable — reverse them instead.');
        }
    }

    /** @return array{0: array<string, mixed>, 1: array<int, array<string, mixed>>, 2: bool} */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        $data = $request->validate([
            'date' => ['required', 'date'],
            'type' => ['required', Rule::in(self::MANUAL_TYPES)],
            'reference' => ['nullable', 'string', 'max:100'],
            'narration' => ['required', 'string', 'max:255'],
            'action' => ['required', Rule::in(['draft', 'submit'])],
            'lines' => ['required', 'array', 'min:2', 'max:100'],
            'lines.*.account_id' => ['required', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('is_postable', true)->where('is_active', true)],
            'lines.*.debit' => ['nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'lines.*.credit' => ['nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'lines.*.narration' => ['nullable', 'string', 'max:255'],
        ], [
            'lines.*.account_id.required' => 'Choose an account.',
            'lines.*.account_id.exists' => 'Choose an active, postable account.',
        ]);

        $this->assertOpenPeriod($data['date']);

        $controls = Account::where('is_control', true)->pluck('name', 'id');
        $lines = [];
        $errors = [];
        $dr = $cr = '0.00';

        foreach ($data['lines'] as $i => $line) {
            $debit = bcadd((string) ($line['debit'] ?? '0') ?: '0', '0', 2);
            $credit = bcadd((string) ($line['credit'] ?? '0') ?: '0', '0', 2);

            if (bccomp($debit, '0', 2) > 0 && bccomp($credit, '0', 2) > 0) {
                $errors["lines.{$i}.debit"] = 'Enter either a debit or a credit, not both.';
            }
            if (bccomp($debit, '0', 2) === 0 && bccomp($credit, '0', 2) === 0) {
                $errors["lines.{$i}.debit"] = 'Enter a debit or credit amount.';
            }
            if (isset($controls[(int) $line['account_id']]) && ! in_array($data['type'], self::CONTROL_ALLOWED_TYPES, true)) {
                $errors["lines.{$i}.account_id"] = "{$controls[(int) $line['account_id']]} is a control account updated through its sub-ledger; use an opening or adjustment journal.";
            }

            $dr = bcadd($dr, $debit, 2);
            $cr = bcadd($cr, $credit, 2);
            $lines[] = ['account_id' => (int) $line['account_id'], 'debit' => $debit, 'credit' => $credit, 'narration' => $line['narration'] ?? null];
        }

        if (bccomp($dr, $cr, 2) !== 0) {
            $errors['lines'] = 'The journal does not balance: debits '.number_format((float) $dr, 2).' vs credits '.number_format((float) $cr, 2).'.';
        }
        if (bccomp($dr, '0', 2) === 0) {
            $errors['lines'] = 'The journal total cannot be zero.';
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return [
            ['date' => $data['date'], 'type' => $data['type'], 'reference' => $data['reference'] ?? null, 'narration' => $data['narration']],
            $lines,
            $data['action'] === 'submit',
        ];
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        return [
            'accounts' => Account::postable()->orderBy('code')->get(['id', 'code', 'name', 'type', 'sub_type', 'is_control', 'normal_balance'])
                ->map(fn ($a) => [
                    'value' => $a->id,
                    'label' => "{$a->code} · {$a->name}",
                    'type' => $a->type,
                    'is_control' => $a->is_control,
                ])->all(),
            'types' => $this->typeOptions(self::MANUAL_TYPES),
        ];
    }

    /** @param  array<int, string>  $types @return array<int, array{value:string,label:string}> */
    private function typeOptions(array $types): array
    {
        return array_map(fn ($t) => ['value' => $t, 'label' => ucfirst($t)], $types);
    }

    /** @return array{label: string, url: ?string}|null */
    private function sourceLink(Journal $journal): ?array
    {
        if (! $journal->source_type) {
            return null;
        }

        $type = class_basename($journal->source_type);
        $id = $journal->source_id;
        $source = rescue(fn () => $journal->source, null, false);
        $label = match ($type) {
            'Expense' => 'Payment voucher '.($source->voucher_no ?? "#{$id}"),
            'Invoice' => 'Invoice '.($source->invoice_no ?? "#{$id}"),
            'Payment' => 'Receipt '.($source->receipt_no ?? "#{$id}"),
            'PayrollRun' => 'Payroll run '.($source->name ?? $source->period ?? "#{$id}"),
            'PurchaseOrder' => 'Purchase order '.($source->po_no ?? $source->order_no ?? "#{$id}"),
            default => "{$type} #{$id}",
        };
        $url = match ($type) {
            'Expense' => "/accounting/expenses/{$id}",
            'Invoice' => "/fees/invoices/{$id}",
            'Payment' => "/fees/payments/{$id}",
            'PayrollRun' => "/payroll/{$id}",
            'PurchaseOrder' => "/inventory/purchase-orders/{$id}",
            default => null,
        };

        return ['label' => $label, 'url' => $url, 'type' => $type];
    }

    private function notifyApprovers(Journal $journal): void
    {
        $users = User::where('school_id', $this->tenancy()->schoolId())
            ->where('id', '!=', $journal->created_by)
            ->where('status', 'active')
            ->with('role')
            ->get()
            ->filter(fn (User $u) => $u->hasPermission('accounting.manage'));

        foreach ($users as $user) {
            $user->notify(new SchoolNotification('Journal awaiting approval', "Journal {$journal->journal_no} ({$journal->narration}) needs your approval.", "/accounting/journals/{$journal->id}", 'info'));
        }
    }

    private function notifyMaker(Journal $journal, string $title, string $message, string $type): void
    {
        if ($journal->created_by && $journal->created_by !== auth()->id()) {
            User::find($journal->created_by)?->notify(new SchoolNotification($title, $message, "/accounting/journals/{$journal->id}", $type));
        }
    }
}
