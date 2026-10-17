<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\BankReconciliation;
use App\Models\JournalLine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Bank / mobile-money reconciliation maths.
 *
 *   statement opening + cleared (ticked) movements  = statement closing   → difference must be 0
 *   statement closing + deposits in transit − unpresented payments = balance per books
 *
 * Candidate lines are posted ledger lines on the account dated on or before
 * the statement date that are not already cleared on a completed
 * reconciliation. Opening-balance journals are excluded: they are what the
 * first statement's opening balance represents.
 */
class ReconciliationService
{
    public function __construct(protected LedgerService $ledger) {}

    /** @return Builder<JournalLine> */
    public function candidates(BankReconciliation $rec): Builder
    {
        return JournalLine::query()
            ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
            ->where('journal_lines.account_id', $rec->account_id)
            ->whereIn('journals.status', ['posted', 'reversed'])
            ->where('journals.type', '!=', 'opening')
            ->whereDate('journals.date', '<=', $rec->statement_date)
            ->where(fn ($q) => $q->whereNull('journal_lines.bank_reconciliation_id')->orWhere('journal_lines.bank_reconciliation_id', $rec->id));
    }

    /**
     * Live figures for the workspace and the printed statement.
     *
     * @return array<string, string>
     */
    public function summary(BankReconciliation $rec): array
    {
        $rows = $this->candidates($rec)
            ->selectRaw('journal_lines.bank_reconciliation_id IS NOT NULL as cleared, SUM(journal_lines.debit) as dr, SUM(journal_lines.credit) as cr')
            ->groupByRaw('journal_lines.bank_reconciliation_id IS NOT NULL')
            ->get()
            ->keyBy(fn ($r) => (int) $r->cleared);

        $clearedIn = (string) ($rows[1]->dr ?? '0');
        $clearedOut = (string) ($rows[1]->cr ?? '0');
        $inTransit = (string) ($rows[0]->dr ?? '0');      // recorded deposits not yet on the statement
        $unpresented = (string) ($rows[0]->cr ?? '0');    // recorded payments not yet on the statement

        $computedClosing = bcadd((string) $rec->opening_balance, bcsub($clearedIn, $clearedOut, 2), 2);
        $book = $this->ledger->balance($rec->account, null, $rec->statement_date->toDateString());
        $adjusted = bcsub(bcadd((string) $rec->closing_balance, $inTransit, 2), $unpresented, 2);

        return [
            'cleared_in' => bcadd($clearedIn, '0', 2),
            'cleared_out' => bcadd($clearedOut, '0', 2),
            'computed_closing' => $computedClosing,
            'difference' => bcsub((string) $rec->closing_balance, $computedClosing, 2),
            'in_transit' => bcadd($inTransit, '0', 2),
            'unpresented' => bcadd($unpresented, '0', 2),
            'adjusted_balance' => $adjusted,
            'book_balance' => $book,
            'unexplained' => bcsub($adjusted, $book, 2),
        ];
    }

    /** Replace the set of ticked lines on a draft reconciliation. */
    public function setCleared(BankReconciliation $rec, array $lineIds): void
    {
        $this->assertDraft($rec);
        $ids = array_map('intval', $lineIds);

        $valid = $this->candidates($rec)->whereIn('journal_lines.id', $ids ?: [0])->pluck('journal_lines.id')->all();
        if (count($valid) !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['line_ids' => 'Some selected entries are not available on this reconciliation (already cleared elsewhere or outside the statement period).']);
        }

        DB::transaction(function () use ($rec, $valid) {
            JournalLine::where('bank_reconciliation_id', $rec->id)->whereNotIn('id', $valid ?: [0])->update(['bank_reconciliation_id' => null]);
            JournalLine::whereIn('id', $valid ?: [0])->update(['bank_reconciliation_id' => $rec->id]);
        });
    }

    /** Statement opening for a new reconciliation: last completed closing, else the opening-balance journal. */
    public function suggestedOpening(Account $account): string
    {
        $last = BankReconciliation::where('account_id', $account->id)->where('status', 'completed')->orderByDesc('statement_date')->first();
        if ($last) {
            return (string) $last->closing_balance;
        }

        $row = DB::table('journal_lines')
            ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
            ->where('journal_lines.account_id', $account->id)
            ->where('journals.type', 'opening')
            ->where('journals.status', 'posted')
            ->selectRaw('COALESCE(SUM(journal_lines.debit - journal_lines.credit), 0) as b')
            ->first();

        return bcadd((string) $row->b, '0', 2);
    }

    public function assertDraft(BankReconciliation $rec): void
    {
        if (! $rec->isDraft()) {
            throw ValidationException::withMessages(['reconciliation' => 'This reconciliation is completed and locked. Reopen it to make changes.']);
        }
    }

    /** @return Collection<int, Account> */
    public static function reconcilableAccounts(): Collection
    {
        return Account::whereIn('sub_type', ['bank', 'mobile_money'])->where('is_postable', true)->orderBy('code')->get();
    }
}
