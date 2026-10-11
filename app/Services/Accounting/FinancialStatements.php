<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\Budget;
use App\Models\FiscalYear;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Financial statement maths (SRS 5.4 / 5.5).
 *
 * Every figure is derived from posted ledger lines (status posted or reversed —
 * a reversed journal and its mirror reversal both stay in the ledger and net to nil).
 * Money is handled as decimal strings with bcmath (scale 2).
 */
class FinancialStatements
{
    public const CASH_SUB_TYPES = ['cash', 'bank', 'mobile_money'];

    public const CURRENT_ASSET_SUB_TYPES = ['cash', 'bank', 'mobile_money', 'receivable', 'current_asset', 'inventory', 'prepaid'];

    public const NON_CURRENT_LIABILITY_SUB_TYPES = ['long_term_liability'];

    public const DIRECT_COST_SUB_TYPES = ['direct_cost', 'cost_of_sales'];

    public const INVESTING_SUB_TYPES = ['fixed_asset', 'contra_asset', 'non_current_asset', 'investment'];

    public const FINANCING_LIABILITY_SUB_TYPES = ['long_term_liability', 'loan'];

    /** @var Collection<int, Account>|null */
    protected ?Collection $accounts = null;

    public function __construct(protected LedgerService $ledger) {}

    // ------------------------------------------------------------------
    // Building blocks
    // ------------------------------------------------------------------

    /** @return Collection<int, Account> all accounts of the school keyed by id, ordered by code */
    public function accounts(): Collection
    {
        return $this->accounts ??= Account::orderBy('code')->get()->keyBy('id');
    }

    /**
     * Posted debit / credit totals per account.
     *
     * @return array<int, array{dr: string, cr: string}>
     */
    public function sums(?string $from = null, ?string $to = null): array
    {
        $out = [];
        foreach ($this->ledger->totalsByAccount($from, $to) as $row) {
            $out[(int) $row->account_id] = ['dr' => $this->m($row->dr), 'cr' => $this->m($row->cr)];
        }

        return $out;
    }

    /** Balance signed in the account's normal direction. */
    public function signed(Account $account, string $dr, string $cr): string
    {
        return $account->normal_balance === 'debit' ? bcsub($dr, $cr, 2) : bcsub($cr, $dr, 2);
    }

    /**
     * Current (all-time) balance of every account, header accounts rolled up from their children.
     *
     * @return array<int, string> account_id => balance in the account's normal direction
     */
    public function accountBalances(?string $to = null): array
    {
        $sums = $this->sums(null, $to);
        $accounts = $this->accounts();

        // Net debit (dr - cr) per account including descendants.
        $net = [];
        foreach ($accounts as $a) {
            $net[$a->id] = isset($sums[$a->id]) ? bcsub($sums[$a->id]['dr'], $sums[$a->id]['cr'], 2) : '0.00';
        }

        $children = $accounts->groupBy('parent_id');
        $rolled = [];
        $roll = function (int $id) use (&$roll, &$rolled, $net, $children): string {
            if (isset($rolled[$id])) {
                return $rolled[$id];
            }
            $total = $net[$id] ?? '0.00';
            foreach ($children->get($id, collect()) as $child) {
                $total = bcadd($total, $roll($child->id), 2);
            }

            return $rolled[$id] = $total;
        };

        $out = [];
        foreach ($accounts as $a) {
            $n = $roll($a->id);
            $out[$a->id] = $a->normal_balance === 'debit' ? $n : bcsub('0', $n, 2);
        }

        return $out;
    }

    // ------------------------------------------------------------------
    // Trial balance
    // ------------------------------------------------------------------

    /**
     * Trial balance. With $from = null the balances are cumulative "as at" $to; otherwise period movements.
     *
     * @return array{rows: array<int, array<string, mixed>>, total_debit: string, total_credit: string, balanced: bool, cmp_total_debit: ?string, cmp_total_credit: ?string, cmp_balanced: ?bool}
     */
    public function trialBalance(string $to, ?string $from = null, ?string $cmpTo = null, ?string $cmpFrom = null): array
    {
        $current = $this->sums($from, $to);
        $compare = $cmpTo ? $this->sums($cmpFrom, $cmpTo) : [];

        $rows = [];
        $td = $tc = $cd = $cc = '0.00';

        foreach ($this->accounts() as $a) {
            $c = $current[$a->id] ?? null;
            $p = $compare[$a->id] ?? null;
            if (! $c && ! $p) {
                continue;
            }

            [$debit, $credit] = $this->split($c);
            [$pDebit, $pCredit] = $this->split($p);

            if (bccomp($debit, '0', 2) === 0 && bccomp($credit, '0', 2) === 0 && bccomp($pDebit, '0', 2) === 0 && bccomp($pCredit, '0', 2) === 0) {
                continue;
            }

            $td = bcadd($td, $debit, 2);
            $tc = bcadd($tc, $credit, 2);
            $cd = bcadd($cd, $pDebit, 2);
            $cc = bcadd($cc, $pCredit, 2);

            $rows[] = [
                'id' => $a->id,
                'code' => $a->code,
                'name' => $a->name,
                'type' => $a->type,
                'sub_type' => $a->sub_type,
                'period_dr' => $c['dr'] ?? '0.00',
                'period_cr' => $c['cr'] ?? '0.00',
                'debit' => $debit,
                'credit' => $credit,
                'cmp_debit' => $pDebit,
                'cmp_credit' => $pCredit,
            ];
        }

        return [
            'rows' => $rows,
            'total_debit' => $td,
            'total_credit' => $tc,
            'balanced' => bccomp($td, $tc, 2) === 0,
            'cmp_total_debit' => $cmpTo ? $cd : null,
            'cmp_total_credit' => $cmpTo ? $cc : null,
            'cmp_balanced' => $cmpTo ? bccomp($cd, $cc, 2) === 0 : null,
        ];
    }

    /** @param  array{dr:string,cr:string}|null  $s  @return array{0:string,1:string} [debit, credit] column values */
    protected function split(?array $s): array
    {
        if (! $s) {
            return ['0.00', '0.00'];
        }
        $net = bcsub($s['dr'], $s['cr'], 2);

        return bccomp($net, '0', 2) >= 0 ? [$net, '0.00'] : ['0.00', bcsub('0', $net, 2)];
    }

    // ------------------------------------------------------------------
    // Income statement & trading account
    // ------------------------------------------------------------------

    /**
     * @return array{
     *   income: array{rows: array<int, array<string,mixed>>, total: string},
     *   direct: array{rows: array<int, array<string,mixed>>, total: string},
     *   operating: array{rows: array<int, array<string,mixed>>, total: string},
     *   gross: string, net: string,
     *   trading: array{sales: array<int, array<string,mixed>>, cost: array<int, array<string,mixed>>, sales_total: string, cost_total: string, gross_profit: string}|null
     * }
     */
    public function incomeStatement(string $from, string $to): array
    {
        $sums = $this->sums($from, $to);
        $sections = ['income' => [], 'direct' => [], 'operating' => []];
        $totals = ['income' => '0.00', 'direct' => '0.00', 'operating' => '0.00'];
        $sales = $cost = [];
        $salesTotal = $costTotal = '0.00';

        foreach ($this->accounts() as $a) {
            if (! in_array($a->type, ['income', 'expense'], true) || ! isset($sums[$a->id])) {
                continue;
            }

            $amount = $a->type === 'income'
                ? bcsub($sums[$a->id]['cr'], $sums[$a->id]['dr'], 2)
                : bcsub($sums[$a->id]['dr'], $sums[$a->id]['cr'], 2);

            if (bccomp($amount, '0', 2) === 0) {
                continue;
            }

            $section = $a->type === 'income' ? 'income' : (in_array($a->sub_type, self::DIRECT_COST_SUB_TYPES, true) ? 'direct' : 'operating');
            $row = ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'sub_type' => $a->sub_type, 'amount' => $amount];
            $sections[$section][] = $row;
            $totals[$section] = bcadd($totals[$section], $amount, 2);

            if ($a->sub_type === 'sales') {
                $sales[] = $row;
                $salesTotal = bcadd($salesTotal, $amount, 2);
            }
            if ($a->sub_type === 'cost_of_sales') {
                $cost[] = $row;
                $costTotal = bcadd($costTotal, $amount, 2);
            }
        }

        $gross = bcsub($totals['income'], $totals['direct'], 2);

        return [
            'income' => ['rows' => $sections['income'], 'total' => $totals['income']],
            'direct' => ['rows' => $sections['direct'], 'total' => $totals['direct']],
            'operating' => ['rows' => $sections['operating'], 'total' => $totals['operating']],
            'gross' => $gross,
            'net' => bcsub($gross, $totals['operating'], 2),
            'trading' => ($sales || $cost) ? [
                'sales' => $sales,
                'cost' => $cost,
                'sales_total' => $salesTotal,
                'cost_total' => $costTotal,
                'gross_profit' => bcsub($salesTotal, $costTotal, 2),
            ] : null,
        ];
    }

    // ------------------------------------------------------------------
    // Balance sheet
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function balanceSheet(string $asAt): array
    {
        $sums = $this->sums(null, $asAt);
        $fy = FiscalYear::forDate($asAt);
        $periodStart = $fy?->start_date?->toDateString() ?? CarbonImmutable::parse($asAt)->startOfYear()->toDateString();
        $periodSums = $this->sums($periodStart, $asAt);

        $groups = [
            'current_assets' => [], 'non_current_assets' => [],
            'current_liabilities' => [], 'non_current_liabilities' => [],
            'equity' => [],
        ];
        $totalSurplus = $periodSurplus = '0.00';

        foreach ($this->accounts() as $a) {
            $s = $sums[$a->id] ?? null;
            if (! $s) {
                continue;
            }

            if (in_array($a->type, ['income', 'expense'], true)) {
                $totalSurplus = bcadd($totalSurplus, bcsub($s['cr'], $s['dr'], 2), 2);
                if (isset($periodSums[$a->id])) {
                    $periodSurplus = bcadd($periodSurplus, bcsub($periodSums[$a->id]['cr'], $periodSums[$a->id]['dr'], 2), 2);
                }

                continue;
            }

            // Assets are presented debit-positive (contra assets therefore appear negative);
            // liabilities and equity credit-positive.
            $amount = $a->type === 'asset' ? bcsub($s['dr'], $s['cr'], 2) : bcsub($s['cr'], $s['dr'], 2);
            if (bccomp($amount, '0', 2) === 0) {
                continue;
            }

            $group = match ($a->type) {
                'asset' => in_array($a->sub_type, self::CURRENT_ASSET_SUB_TYPES, true) ? 'current_assets' : 'non_current_assets',
                'liability' => in_array($a->sub_type, self::NON_CURRENT_LIABILITY_SUB_TYPES, true) ? 'non_current_liabilities' : 'current_liabilities',
                default => 'equity',
            };

            $groups[$group][] = ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'sub_type' => $a->sub_type, 'amount' => $amount];
        }

        $priorSurplus = bcsub($totalSurplus, $periodSurplus, 2);
        if (bccomp($priorSurplus, '0', 2) !== 0) {
            $groups['equity'][] = ['id' => null, 'code' => '', 'name' => 'Accumulated surplus/(deficit) b/f (not yet closed)', 'sub_type' => 'surplus', 'amount' => $priorSurplus];
        }
        $groups['equity'][] = ['id' => null, 'code' => '', 'name' => 'Current period surplus/(deficit)', 'sub_type' => 'surplus', 'amount' => $periodSurplus];

        $totals = array_map(fn ($rows) => array_reduce($rows, fn ($c, $r) => bcadd($c, $r['amount'], 2), '0.00'), $groups);
        $assets = bcadd($totals['current_assets'], $totals['non_current_assets'], 2);
        $liabilities = bcadd($totals['current_liabilities'], $totals['non_current_liabilities'], 2);
        $equity = $totals['equity'];
        $le = bcadd($liabilities, $equity, 2);

        return [
            'groups' => $groups,
            'totals' => $totals,
            'total_assets' => $assets,
            'total_liabilities' => $liabilities,
            'total_equity' => $equity,
            'total_liabilities_equity' => $le,
            'difference' => bcsub($assets, $le, 2),
            'balanced' => bccomp($assets, $le, 2) === 0,
            'period_start' => $periodStart,
            'period_surplus' => $periodSurplus,
        ];
    }

    // ------------------------------------------------------------------
    // Cash flow (direct method)
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function cashFlow(string $from, string $to): array
    {
        $accounts = $this->accounts();
        $cashIds = $accounts->filter(fn ($a) => $a->type === 'asset' && in_array($a->sub_type, self::CASH_SUB_TYPES, true))->keys()->all();

        $beforeFrom = CarbonImmutable::parse($from)->subDay()->toDateString();
        $openingSums = $this->sums(null, $beforeFrom);
        $closingSums = $this->sums(null, $to);

        // Opening-balance journals inside the period are treated as balances brought forward, not flows.
        $openingJournalCash = $this->ledger->postedLines($from, $to)
            ->where('journals.type', 'opening')
            ->whereIn('journal_lines.account_id', $cashIds ?: [0])
            ->selectRaw('journal_lines.account_id, SUM(journal_lines.debit) as dr, SUM(journal_lines.credit) as cr')
            ->groupBy('journal_lines.account_id')
            ->get()->keyBy('account_id');

        $cashAccounts = [];
        $opening = $closing = '0.00';
        foreach ($cashIds as $id) {
            $o = isset($openingSums[$id]) ? bcsub($openingSums[$id]['dr'], $openingSums[$id]['cr'], 2) : '0.00';
            if ($oj = $openingJournalCash->get($id)) {
                $o = bcadd($o, bcsub($this->m($oj->dr), $this->m($oj->cr), 2), 2);
            }
            $c = isset($closingSums[$id]) ? bcsub($closingSums[$id]['dr'], $closingSums[$id]['cr'], 2) : '0.00';
            $opening = bcadd($opening, $o, 2);
            $closing = bcadd($closing, $c, 2);
            if (bccomp($o, '0', 2) !== 0 || bccomp($c, '0', 2) !== 0) {
                $a = $accounts[$id];
                $cashAccounts[] = ['id' => $id, 'code' => $a->code, 'name' => $a->name, 'opening' => $o, 'closing' => $c, 'movement' => bcsub($c, $o, 2)];
            }
        }

        // Counter-account lines of every journal that touched cash/bank in the period.
        $counter = $this->ledger->postedLines($from, $to)
            ->where('journals.type', '!=', 'opening')
            ->whereNotIn('journal_lines.account_id', $cashIds ?: [0])
            ->whereExists(fn ($q) => $q->select(DB::raw(1))
                ->from('journal_lines as cl')
                ->whereColumn('cl.journal_id', 'journal_lines.journal_id')
                ->whereIn('cl.account_id', $cashIds ?: [0]))
            ->selectRaw('journal_lines.account_id, SUM(journal_lines.credit) as inflow, SUM(journal_lines.debit) as outflow')
            ->groupBy('journal_lines.account_id')
            ->get();

        $activities = [];
        foreach (['operating', 'investing', 'financing'] as $key) {
            $activities[$key] = ['receipts' => [], 'payments' => [], 'total_receipts' => '0.00', 'total_payments' => '0.00', 'net' => '0.00'];
        }

        foreach ($counter as $row) {
            $a = $accounts[$row->account_id] ?? null;
            if (! $a) {
                continue;
            }
            $key = $this->activityFor($a);
            $in = $this->m($row->inflow);
            $out = $this->m($row->outflow);
            // Net per counter-account so offsetting lines (e.g. receipts later reversed) collapse.
            $net = bcsub($in, $out, 2);
            if (bccomp($net, '0', 2) === 0) {
                continue;
            }
            $line = ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'type' => $a->type, 'sub_type' => $a->sub_type, 'amount' => bccomp($net, '0', 2) > 0 ? $net : bcsub('0', $net, 2)];
            if (bccomp($net, '0', 2) > 0) {
                $activities[$key]['receipts'][] = $line;
                $activities[$key]['total_receipts'] = bcadd($activities[$key]['total_receipts'], $net, 2);
            } else {
                $activities[$key]['payments'][] = $line;
                $activities[$key]['total_payments'] = bcadd($activities[$key]['total_payments'], $line['amount'], 2);
            }
        }

        $netMovement = '0.00';
        foreach ($activities as $key => $act) {
            $activities[$key]['net'] = bcsub($act['total_receipts'], $act['total_payments'], 2);
            $netMovement = bcadd($netMovement, $activities[$key]['net'], 2);
        }

        $computedClosing = bcadd($opening, $netMovement, 2);

        return [
            'activities' => $activities,
            'opening' => $opening,
            'net_movement' => $netMovement,
            'closing' => $closing,
            'computed_closing' => $computedClosing,
            'difference' => bcsub($closing, $computedClosing, 2),
            'reconciled' => bccomp($closing, $computedClosing, 2) === 0,
            'cash_accounts' => $cashAccounts,
        ];
    }

    public function activityFor(Account $a): string
    {
        if ($a->type === 'asset' && in_array($a->sub_type, self::INVESTING_SUB_TYPES, true)) {
            return 'investing';
        }
        if ($a->type === 'equity' || ($a->type === 'liability' && in_array($a->sub_type, self::FINANCING_LIABILITY_SUB_TYPES, true))) {
            return 'financing';
        }

        return 'operating';
    }

    // ------------------------------------------------------------------
    // Account ledger
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function ledger(Account $account, string $from, string $to): array
    {
        $before = CarbonImmutable::parse($from)->subDay()->toDateString();
        $o = $this->ledger->postedLines(null, $before)
            ->where('journal_lines.account_id', $account->id)
            ->selectRaw('COALESCE(SUM(journal_lines.debit),0) as dr, COALESCE(SUM(journal_lines.credit),0) as cr')
            ->first();
        $opening = $this->signed($account, $this->m($o->dr ?? 0), $this->m($o->cr ?? 0));

        $lines = $this->ledger->postedLines($from, $to)
            ->where('journal_lines.account_id', $account->id)
            ->orderBy('journals.date')->orderBy('journals.id')->orderBy('journal_lines.id')
            ->get([
                'journal_lines.id', 'journals.id as journal_id', 'journals.journal_no', 'journals.date', 'journals.type',
                'journals.reference', 'journals.narration as journal_narration', 'journal_lines.narration', 'journal_lines.debit', 'journal_lines.credit',
                'journals.status',
            ]);

        $running = $opening;
        $totalDr = $totalCr = '0.00';
        $rows = [];
        foreach ($lines as $l) {
            $dr = $this->m($l->debit);
            $cr = $this->m($l->credit);
            $running = bcadd($running, $this->signed($account, $dr, $cr), 2);
            $totalDr = bcadd($totalDr, $dr, 2);
            $totalCr = bcadd($totalCr, $cr, 2);
            $rows[] = [
                'id' => $l->id,
                'journal_id' => $l->journal_id,
                'journal_no' => $l->journal_no,
                'date' => substr((string) $l->date, 0, 10),
                'type' => $l->type,
                'status' => $l->status,
                'reference' => $l->reference,
                'narration' => $l->narration ?: $l->journal_narration,
                'debit' => $dr,
                'credit' => $cr,
                'balance' => $running,
            ];
        }

        return [
            'opening' => $opening,
            'closing' => $running,
            'total_debit' => $totalDr,
            'total_credit' => $totalCr,
            'lines' => $rows,
        ];
    }

    // ------------------------------------------------------------------
    // Budget vs actual
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function budgetVsActual(FiscalYear $year): array
    {
        $sums = $this->sums($year->start_date->toDateString(), $year->end_date->toDateString());
        $budgets = Budget::where('fiscal_year_id', $year->id)->get()->keyBy('account_id');

        $rows = [];
        $totals = [
            'income' => ['budget' => '0.00', 'actual' => '0.00', 'variance' => '0.00'],
            'expense' => ['budget' => '0.00', 'actual' => '0.00', 'variance' => '0.00'],
        ];

        foreach ($this->accounts() as $a) {
            if (! in_array($a->type, ['income', 'expense'], true) || ! $a->is_postable) {
                continue;
            }
            $budget = $budgets->get($a->id);
            $s = $sums[$a->id] ?? null;
            if (! $budget && ! $s) {
                continue;
            }

            $actual = $s ? ($a->type === 'income' ? bcsub($s['cr'], $s['dr'], 2) : bcsub($s['dr'], $s['cr'], 2)) : '0.00';
            $budgetAmount = $budget ? $this->m($budget->amount) : '0.00';
            // Favourable variance is positive: income above budget, expenses below budget.
            $variance = $a->type === 'income' ? bcsub($actual, $budgetAmount, 2) : bcsub($budgetAmount, $actual, 2);
            $pct = bccomp($budgetAmount, '0', 2) !== 0 ? bcdiv(bcmul($variance, '100', 4), $budgetAmount, 1) : null;
            $used = bccomp($budgetAmount, '0', 2) !== 0 ? bcdiv(bcmul($actual, '100', 4), $budgetAmount, 1) : null;

            $rows[] = [
                'id' => $budget?->id,
                'account_id' => $a->id,
                'code' => $a->code,
                'name' => $a->name,
                'type' => $a->type,
                'budget' => $budgetAmount,
                'actual' => $actual,
                'variance' => $variance,
                'variance_pct' => $pct,
                'utilisation' => $used,
                'notes' => $budget?->notes,
            ];

            $t = &$totals[$a->type];
            $t['budget'] = bcadd($t['budget'], $budgetAmount, 2);
            $t['actual'] = bcadd($t['actual'], $actual, 2);
            $t['variance'] = bcadd($t['variance'], $variance, 2);
            unset($t);
        }

        return ['rows' => $rows, 'totals' => $totals];
    }

    // ------------------------------------------------------------------

    protected function m(mixed $value): string
    {
        return bcadd((string) ($value ?: '0'), '0', 2);
    }
}
