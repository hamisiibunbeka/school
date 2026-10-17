<?php

namespace App\Http\Controllers\Accounting;

use App\Models\Account;
use App\Models\BankReconciliation;
use App\Models\JournalLine;
use App\Services\Accounting\LedgerService;
use App\Services\Accounting\ReconciliationService;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Bank & mobile-money reconciliation (phase 1: manual matching).
 * Draft → tick cleared entries until the difference is zero → complete
 * (locks the ticked lines) → reviewed and signed off by a different user.
 */
class ReconciliationController extends AccountingController
{
    public function __construct(protected ReconciliationService $recs, protected LedgerService $ledger) {}

    public function index(): Response
    {
        $accounts = ReconciliationService::reconcilableAccounts();
        $all = BankReconciliation::with(['account:id,code,name', 'preparer:id,name', 'reviewer:id,name'])->orderByDesc('statement_date')->orderByDesc('id')->get();

        return Inertia::render('accounting/reconciliations/index', [
            'accounts' => $accounts->map(function (Account $a) use ($all) {
                $last = $all->where('account_id', $a->id)->where('status', 'completed')->first();
                $draft = $all->where('account_id', $a->id)->where('status', 'draft')->first();
                $since = $last?->statement_date?->toDateString();

                return [
                    'id' => $a->id,
                    'code' => $a->code,
                    'name' => $a->name,
                    'sub_type' => $a->sub_type,
                    'is_active' => $a->is_active,
                    'book_balance' => $this->ledger->balance($a),
                    'last_statement_date' => $since,
                    'last_closing' => $last ? (string) $last->closing_balance : null,
                    'draft_id' => $draft?->id,
                    'suggested_opening' => $this->recs->suggestedOpening($a),
                    'unreconciled' => JournalLine::query()
                        ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
                        ->where('journal_lines.account_id', $a->id)
                        ->whereIn('journals.status', ['posted', 'reversed'])
                        ->where('journals.type', '!=', 'opening')
                        ->where(fn ($q) => $q->whereNull('journal_lines.bank_reconciliation_id')->orWhere('journal_lines.bank_reconciliation_id', $draft?->id ?? 0))
                        ->count(),
                ];
            })->values(),
            'history' => $all->map(fn (BankReconciliation $r) => $this->row($r))->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'account_id' => ['required', Rule::in(ReconciliationService::reconcilableAccounts()->pluck('id')->all())],
            'statement_date' => ['required', 'date', 'before_or_equal:today'],
            'opening_balance' => ['required', 'numeric'],
            'closing_balance' => ['required', 'numeric'],
            'notes' => ['nullable', 'string', 'max:255'],
        ], ['account_id.in' => 'Only bank and mobile-money accounts are reconciled against statements.']);

        if (BankReconciliation::where('account_id', $data['account_id'])->where('status', 'draft')->exists()) {
            throw ValidationException::withMessages(['account_id' => 'This account already has a reconciliation in progress. Finish or delete it first.']);
        }
        $last = BankReconciliation::where('account_id', $data['account_id'])->where('status', 'completed')->max('statement_date');
        if ($last && $data['statement_date'] <= substr((string) $last, 0, 10)) {
            throw ValidationException::withMessages(['statement_date' => 'The statement date must be after the last completed reconciliation ('.date('d/m/Y', strtotime((string) $last)).').']);
        }

        $rec = BankReconciliation::create([
            ...$data,
            'status' => 'draft',
            'prepared_by' => $request->user()->id,
        ]);

        $this->audit('created', $rec, "Reconciliation started for {$rec->account->name} to ".$rec->statement_date->format('d/m/Y'), 'accounting', null, $data);

        return to_route('accounting.reconciliations.show', $rec);
    }

    public function show(Request $request, BankReconciliation $reconciliation): Response
    {
        $rec = $reconciliation->load(['account', 'preparer:id,name', 'reviewer:id,name']);

        $lines = ($rec->isDraft() ? $this->recs->candidates($rec) : $rec->lines()->join('journals', 'journals.id', '=', 'journal_lines.journal_id'))
            ->select('journal_lines.*')
            ->with('journal:id,journal_no,date,type,reference,narration')
            ->orderBy('journals.date')->orderBy('journal_lines.id')
            ->get()
            ->map(fn (JournalLine $l) => [
                'id' => $l->id,
                'journal_id' => $l->journal_id,
                'journal_no' => $l->journal?->journal_no,
                'date' => $l->journal?->date?->toDateString(),
                'type' => $l->journal?->type,
                'reference' => $l->journal?->reference,
                'narration' => $l->narration ?: $l->journal?->narration,
                'debit' => $l->debit,
                'credit' => $l->credit,
                'cleared' => $l->bank_reconciliation_id === $rec->id,
            ]);

        // Completed statements also list what was left outstanding at that date.
        $outstanding = $rec->isDraft() ? [] : JournalLine::query()
            ->select('journal_lines.*')
            ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
            ->where('journal_lines.account_id', $rec->account_id)
            ->whereIn('journals.status', ['posted', 'reversed'])
            ->where('journals.type', '!=', 'opening')
            ->whereDate('journals.date', '<=', $rec->statement_date)
            ->where(fn ($q) => $q->whereNull('journal_lines.bank_reconciliation_id')->orWhereIn('journal_lines.bank_reconciliation_id', BankReconciliation::where('account_id', $rec->account_id)->where('statement_date', '>', $rec->statement_date)->pluck('id')))
            ->with('journal:id,journal_no,date,reference,narration')
            ->orderBy('journals.date')
            ->get()
            ->map(fn (JournalLine $l) => ['id' => $l->id, 'date' => $l->journal?->date?->toDateString(), 'journal_no' => $l->journal?->journal_no, 'reference' => $l->journal?->reference, 'narration' => $l->narration ?: $l->journal?->narration, 'debit' => $l->debit, 'credit' => $l->credit]);

        $isLatest = ! BankReconciliation::where('account_id', $rec->account_id)->where('id', '!=', $rec->id)->where('statement_date', '>', $rec->statement_date)->exists();

        return Inertia::render('accounting/reconciliations/show', [
            'reconciliation' => $this->row($rec) + [
                'account_sub_type' => $rec->account->sub_type,
                'notes' => $rec->notes,
                'can_review' => $rec->status === 'completed' && ! $rec->reviewed_by && $this->canApprove($request, $rec->prepared_by),
                'can_reopen' => $rec->status === 'completed' && $isLatest,
            ],
            'summary' => $this->recs->summary($rec),
            'lines' => $lines,
            'outstanding' => $outstanding,
            'counterAccounts' => Lookups::accounts(['expense', 'income']),
            'defaults' => ['charges' => Account::byCode('6600')?->id, 'income' => Account::byCode('4900')?->id],
            'audits' => $this->auditTrail($rec),
        ]);
    }

    /** Save the ticked (cleared) entries. */
    public function saveLines(Request $request, BankReconciliation $reconciliation): RedirectResponse
    {
        $data = $request->validate(['line_ids' => ['present', 'array'], 'line_ids.*' => ['integer']]);
        $this->recs->setCleared($reconciliation, $data['line_ids']);
        $this->toast('Progress saved.');

        return back();
    }

    public function update(Request $request, BankReconciliation $reconciliation): RedirectResponse
    {
        $this->recs->assertDraft($reconciliation);
        $data = $request->validate([
            'statement_date' => ['required', 'date', 'before_or_equal:today'],
            'opening_balance' => ['required', 'numeric'],
            'closing_balance' => ['required', 'numeric'],
            'notes' => ['nullable', 'string', 'max:255'],
            'line_ids' => ['nullable', 'array'],
            'line_ids.*' => ['integer'],
        ]);
        if (isset($data['line_ids'])) {
            $this->recs->setCleared($reconciliation, $data['line_ids']);
        }
        unset($data['line_ids']);

        $old = $reconciliation->only(array_keys($data));
        DB::transaction(function () use ($reconciliation, $data) {
            $reconciliation->update($data);
            // Entries dated after a moved-back statement date no longer belong here.
            JournalLine::where('bank_reconciliation_id', $reconciliation->id)
                ->whereHas('journal', fn ($q) => $q->whereDate('date', '>', $data['statement_date']))
                ->update(['bank_reconciliation_id' => null]);
        });
        $this->audit('updated', $reconciliation, 'Statement details updated', 'accounting', $old, $data);
        $this->toast('Statement details updated.');

        return back();
    }

    /**
     * Post an entry that appears on the statement but not in the books
     * (bank charges, interest, direct debits) and tick it as cleared.
     */
    public function adjustment(Request $request, BankReconciliation $reconciliation): RedirectResponse
    {
        $this->recs->assertDraft($reconciliation);
        $schoolId = $this->tenancy()->schoolId();
        $data = $request->validate([
            'direction' => ['required', Rule::in(['in', 'out'])],
            'date' => ['required', 'date', 'before_or_equal:'.$reconciliation->statement_date->toDateString()],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999999'],
            'account_id' => ['required', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->whereIn('type', ['expense', 'income'])->where('is_postable', true)->where('is_active', true)],
            'description' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:100'],
            'line_ids' => ['nullable', 'array'],
            'line_ids.*' => ['integer'],
        ], ['date.before_or_equal' => 'The entry must be dated on or before the statement date.']);
        $this->assertOpenPeriod($data['date']);
        if (isset($data['line_ids'])) {
            $this->recs->setCleared($reconciliation, $data['line_ids']); // keep the user's unsaved ticks
        }

        $amount = bcadd((string) $data['amount'], '0', 2);
        $bank = $reconciliation->account;
        $in = $data['direction'] === 'in';

        DB::transaction(function () use ($reconciliation, $data, $amount, $bank, $in) {
            $journal = $this->ledger->record([
                'date' => $data['date'],
                'type' => 'bank_adjustment',
                'reference' => $data['reference'] ?? null,
                'narration' => "Per {$bank->name} statement: {$data['description']}",
            ], [
                ['account_id' => $bank->id, 'debit' => $in ? $amount : '0', 'credit' => $in ? '0' : $amount, 'narration' => $data['description']],
                ['account_id' => (int) $data['account_id'], 'debit' => $in ? '0' : $amount, 'credit' => $in ? $amount : '0', 'narration' => $data['description']],
            ], $reconciliation);

            JournalLine::where('journal_id', $journal->id)->where('account_id', $bank->id)->update(['bank_reconciliation_id' => $reconciliation->id]);
            $this->audit('adjusted', $reconciliation, "Statement entry posted ({$journal->journal_no}): ".($in ? 'money in ' : 'money out ').number_format((float) $amount, 2)." — {$data['description']}", 'accounting');
        });

        $this->toast('Statement entry posted to the ledger and ticked as cleared.');

        return back();
    }

    public function complete(Request $request, BankReconciliation $reconciliation): RedirectResponse
    {
        $data = $request->validate(['line_ids' => ['present', 'array'], 'line_ids.*' => ['integer']]);
        $this->recs->setCleared($reconciliation, $data['line_ids']);

        $summary = $this->recs->summary($reconciliation->fresh());
        if (bccomp($summary['difference'], '0', 2) !== 0) {
            throw ValidationException::withMessages(['reconciliation' => 'The difference must be zero before completing. Remaining difference: '.number_format((float) $summary['difference'], 2)]);
        }

        $reconciliation->update([
            'status' => 'completed',
            'book_balance' => $summary['book_balance'],
            'completed_at' => now(),
            'prepared_by' => $request->user()->id,
        ]);
        $this->audit('completed', $reconciliation, "Reconciliation of {$reconciliation->account->name} to ".$reconciliation->statement_date->format('d/m/Y').' completed', 'accounting', null, $summary);
        $this->toast('Reconciliation completed and locked. A different user should now review and sign it off.');

        return back();
    }

    /** Second-person review sign-off (maker-checker). */
    public function review(Request $request, BankReconciliation $reconciliation): RedirectResponse
    {
        if ($reconciliation->status !== 'completed' || $reconciliation->reviewed_by) {
            $this->toast('Only completed, unreviewed reconciliations can be signed off.', 'error');

            return back();
        }
        $this->assertDifferentUser($request, $reconciliation->prepared_by, 'reconciliation');

        $reconciliation->update(['reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
        $this->audit('reviewed', $reconciliation, 'Reconciliation reviewed and signed off', 'accounting');
        $this->toast('Reconciliation signed off.');

        return back();
    }

    /** Unlock the latest completed reconciliation of an account (e.g. an error was found). */
    public function reopen(Request $request, BankReconciliation $reconciliation): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        if ($reconciliation->status !== 'completed') {
            $this->toast('Only completed reconciliations can be reopened.', 'error');

            return back();
        }
        $later = BankReconciliation::where('account_id', $reconciliation->account_id)->where('id', '!=', $reconciliation->id)->where('statement_date', '>', $reconciliation->statement_date)->exists();
        $draft = BankReconciliation::where('account_id', $reconciliation->account_id)->where('status', 'draft')->exists();
        if ($later || $draft) {
            $this->toast('Only the latest reconciliation of an account can be reopened (delete or reopen later ones first).', 'error');

            return back();
        }

        $reconciliation->update(['status' => 'draft', 'completed_at' => null, 'reviewed_by' => null, 'reviewed_at' => null, 'book_balance' => null]);
        $this->audit('reopened', $reconciliation, "Reconciliation reopened: {$data['reason']}", 'accounting', null, ['reason' => $data['reason']]);
        $this->toast('Reconciliation reopened for changes.', 'warning');

        return back();
    }

    public function destroy(BankReconciliation $reconciliation): RedirectResponse
    {
        $this->recs->assertDraft($reconciliation);

        DB::transaction(function () use ($reconciliation) {
            JournalLine::where('bank_reconciliation_id', $reconciliation->id)->update(['bank_reconciliation_id' => null]);
            $reconciliation->delete();
        });
        $this->audit('deleted', null, "Draft reconciliation of {$reconciliation->account?->name} to ".$reconciliation->statement_date->format('d/m/Y').' deleted', 'accounting');
        $this->toast('Draft reconciliation deleted.');

        return to_route('accounting.reconciliations.index');
    }

    /** @return array<string, mixed> */
    private function row(BankReconciliation $r): array
    {
        return [
            'id' => $r->id,
            'account_id' => $r->account_id,
            'account' => $r->account ? "{$r->account->code} · {$r->account->name}" : null,
            'statement_date' => $r->statement_date?->toDateString(),
            'opening_balance' => $r->opening_balance,
            'closing_balance' => $r->closing_balance,
            'book_balance' => $r->book_balance,
            'status' => $r->status,
            'prepared_by' => $r->prepared_by,
            'preparer' => $r->preparer?->name,
            'reviewer' => $r->reviewer?->name,
            'completed_at' => $r->completed_at?->toIso8601String(),
            'reviewed_at' => $r->reviewed_at?->toIso8601String(),
        ];
    }
}
