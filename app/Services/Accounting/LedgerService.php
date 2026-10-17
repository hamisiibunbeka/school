<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\FiscalYear;
use App\Models\Journal;
use App\Services\AuditLogger;
use App\Services\DocumentNumber;
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Double-entry ledger engine.
 *
 * Every financial module (fees, receipts, expenses, payroll, inventory)
 * posts through this service so that the General Ledger, Trial Balance
 * and financial statements are always derived from balanced, posted
 * journals. Amounts are handled as decimal strings with bcmath, never floats.
 */
class LedgerService
{
    /**
     * Create (and optionally post) a balanced journal.
     *
     * @param  array{date: string, narration: string, type?: string, reference?: string|null}  $header
     * @param  array<int, array{account_id: int, debit?: string|float|int, credit?: string|float|int, narration?: string|null}>  $lines
     */
    public function record(array $header, array $lines, ?Model $source = null, bool $post = true): Journal
    {
        $lines = $this->normaliseLines($lines);
        $this->assertBalanced($lines);
        $this->assertOpenPeriod($header['date']);

        return DB::transaction(function () use ($header, $lines, $source, $post) {
            $total = array_reduce($lines, fn ($carry, $l) => bcadd($carry, $l['debit'], 2), '0');

            $journal = new Journal([
                'journal_no' => DocumentNumber::next('journal'),
                'date' => $header['date'],
                'type' => $header['type'] ?? 'general',
                'reference' => $header['reference'] ?? null,
                'narration' => $header['narration'],
                'total' => $total,
                'status' => 'draft',
                'created_by' => auth()->id(),
            ]);

            if ($source) {
                $journal->source()->associate($source);
            }

            $journal->save();
            $journal->lines()->createMany($lines);

            if ($post) {
                $this->post($journal);
            }

            return $journal->fresh('lines');
        });
    }

    /** Post a draft/submitted journal. Posted journals are immutable. */
    public function post(Journal $journal): Journal
    {
        if ($journal->isPosted()) {
            return $journal;
        }

        if (! in_array($journal->status, ['draft', 'submitted'], true)) {
            throw ValidationException::withMessages(['journal' => "A {$journal->status} journal cannot be posted."]);
        }

        $lines = $journal->lines()->get(['account_id', 'debit', 'credit'])->toArray();
        $this->assertBalanced($this->normaliseLines($lines));
        $this->assertOpenPeriod($journal->date->toDateString());

        $journal->forceFill([
            'status' => 'posted',
            'posted_at' => now(),
            'approved_by' => $journal->approved_by ?? auth()->id(),
        ])->save();

        AuditLogger::log('posted', $journal, "Journal {$journal->journal_no} posted", module: 'accounting');

        return $journal;
    }

    /** Reverse a posted journal with a mirror-image journal (never edit in place). */
    public function reverse(Journal $journal, string $reason, ?string $date = null): Journal
    {
        if (! $journal->isPosted()) {
            throw ValidationException::withMessages(['journal' => 'Only posted journals can be reversed.']);
        }

        return DB::transaction(function () use ($journal, $reason, $date) {
            $lines = $journal->lines->map(fn ($l) => [
                'account_id' => $l->account_id,
                'debit' => $l->credit,
                'credit' => $l->debit,
                'narration' => 'Reversal: '.($l->narration ?? ''),
            ])->all();

            $reversal = $this->record([
                'date' => $date ?? now()->toDateString(),
                'type' => 'reversal',
                'reference' => $journal->journal_no,
                'narration' => "Reversal of {$journal->journal_no}: {$reason}",
            ], $lines, $journal->source);

            $reversal->forceFill(['reversal_of_id' => $journal->id])->save();
            $journal->forceFill(['status' => 'reversed'])->save();

            return $reversal;
        });
    }

    /**
     * Balance of an account from posted journals, signed by its normal balance.
     * Returns a decimal string.
     */
    public function balance(Account $account, ?string $from = null, ?string $to = null): string
    {
        $row = $this->postedLines($from, $to)
            ->where('journal_lines.account_id', $account->id)
            ->selectRaw('COALESCE(SUM(journal_lines.debit),0) as dr, COALESCE(SUM(journal_lines.credit),0) as cr')
            ->first();

        return $account->normal_balance === 'debit'
            ? bcsub((string) $row->dr, (string) $row->cr, 2)
            : bcsub((string) $row->cr, (string) $row->dr, 2);
    }

    /**
     * Debit/credit totals per account for posted journals in a period.
     *
     * @return Collection<int, object{account_id:int, dr:string, cr:string}>
     */
    public function totalsByAccount(?string $from = null, ?string $to = null)
    {
        return $this->postedLines($from, $to)
            ->groupBy('journal_lines.account_id')
            ->selectRaw('journal_lines.account_id, SUM(journal_lines.debit) as dr, SUM(journal_lines.credit) as cr')
            ->get()
            ->keyBy('account_id');
    }

    /** Base query: journal lines of posted (incl. later reversed) journals for the current school. */
    public function postedLines(?string $from = null, ?string $to = null)
    {
        return DB::table('journal_lines')
            ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
            ->where('journal_lines.school_id', app(Tenancy::class)->schoolId())
            ->whereIn('journals.status', ['posted', 'reversed'])
            ->when($from, fn ($q) => $q->whereDate('journals.date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('journals.date', '<=', $to));
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<int, array{account_id:int, debit:string, credit:string, narration:?string}>
     */
    protected function normaliseLines(array $lines): array
    {
        $normalised = [];

        foreach ($lines as $line) {
            $debit = $this->money($line['debit'] ?? 0);
            $credit = $this->money($line['credit'] ?? 0);

            if (bccomp($debit, '0', 2) === 0 && bccomp($credit, '0', 2) === 0) {
                continue;
            }

            if (bccomp($debit, '0', 2) < 0 || bccomp($credit, '0', 2) < 0) {
                throw ValidationException::withMessages(['lines' => 'Journal amounts cannot be negative.']);
            }

            $normalised[] = [
                'account_id' => (int) $line['account_id'],
                'debit' => $debit,
                'credit' => $credit,
                'narration' => $line['narration'] ?? null,
            ];
        }

        return $normalised;
    }

    /** @param  array<int, array{debit:string, credit:string}>  $lines */
    protected function assertBalanced(array $lines): void
    {
        if (count($lines) < 2) {
            throw ValidationException::withMessages(['lines' => 'A journal needs at least two lines.']);
        }

        $dr = array_reduce($lines, fn ($c, $l) => bcadd($c, $l['debit'], 2), '0');
        $cr = array_reduce($lines, fn ($c, $l) => bcadd($c, $l['credit'], 2), '0');

        if (bccomp($dr, $cr, 2) !== 0) {
            throw ValidationException::withMessages([
                'lines' => "Journal is not balanced: debits {$dr} vs credits {$cr}.",
            ]);
        }
    }

    protected function assertOpenPeriod(string $date): void
    {
        $year = FiscalYear::forDate($date);

        if ($year && $year->isClosed()) {
            throw ValidationException::withMessages([
                'date' => "The fiscal period {$year->name} is closed for posting.",
            ]);
        }
    }

    protected function money(mixed $value): string
    {
        $value = trim((string) ($value ?: '0'));

        if (! preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            throw ValidationException::withMessages(['lines' => "Invalid amount \"{$value}\"."]);
        }

        return bcadd($value, '0', 2);
    }
}
