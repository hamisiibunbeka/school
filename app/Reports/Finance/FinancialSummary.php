<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Income vs expenditure by month straight from the posted general ledger.
 * Reversed journals are included together with their reversal entries so
 * they net to zero, matching the Accounting module's statements.
 */
class FinancialSummary extends Report
{
    public function key(): string
    {
        return 'financial-summary';
    }

    public function title(): string
    {
        return 'Financial Summary (Income vs Expenses)';
    }

    public function description(): string
    {
        return 'Monthly income, expenditure and surplus from posted ledger journals.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'line-chart';
    }

    public function permissions(): array
    {
        return ['accounting.view'];
    }

    public function filters(): array
    {
        return [...$this->rangeFilters(now()->startOfYear()->toDateString(), $this->today())];
    }

    public function run(array $f): array
    {
        $q = $this->table('journal_lines')
            ->join('journals', 'journals.id', '=', 'journal_lines.journal_id')
            ->join('accounts', 'accounts.id', '=', 'journal_lines.account_id')
            ->whereIn('journals.status', ['posted', 'reversed'])
            ->whereIn('accounts.type', ['income', 'expense']);
        $this->dateRange($q, 'journals.date', $f);

        $data = $q->groupByRaw("DATE_FORMAT(journals.date, '%Y-%m')")->groupBy('accounts.type', 'accounts.sub_type')
            ->get([
                DB::raw("DATE_FORMAT(journals.date, '%Y-%m') as ym"), 'accounts.type', 'accounts.sub_type',
                DB::raw('SUM(journal_lines.debit) as dr'), DB::raw('SUM(journal_lines.credit) as cr'),
            ]);

        $from = Carbon::parse($f['from'] ?: ($data->min('ym') ? $data->min('ym').'-01' : now()->startOfYear()->toDateString()))->startOfMonth();
        $to = Carbon::parse($f['to'] ?: $this->today());

        $rows = [];
        for ($m = $from->copy(); $m->lte($to) && count($rows) < 36; $m = $m->addMonth()) {
            $rows[$m->format('Y-m')] = ['month' => $m->format('F Y'), 'income' => '0', 'direct_costs' => '0', 'expenses' => '0'];
        }

        foreach ($data as $d) {
            if (! isset($rows[$d->ym])) {
                continue;
            }
            if ($d->type === 'income') {
                $rows[$d->ym]['income'] = bcadd($rows[$d->ym]['income'], bcsub((string) $d->cr, (string) $d->dr, 2), 2);
            } elseif (in_array($d->sub_type, ['direct_cost', 'cost_of_sales'], true)) {
                $rows[$d->ym]['direct_costs'] = bcadd($rows[$d->ym]['direct_costs'], bcsub((string) $d->dr, (string) $d->cr, 2), 2);
            } else {
                $rows[$d->ym]['expenses'] = bcadd($rows[$d->ym]['expenses'], bcsub((string) $d->dr, (string) $d->cr, 2), 2);
            }
        }

        $rows = array_values(array_map(function ($r) {
            $r['total_expenses'] = bcadd($r['direct_costs'], $r['expenses'], 2);
            $r['surplus'] = bcsub($r['income'], $r['total_expenses'], 2);
            $r['margin'] = $this->pct($r['surplus'], $r['income']);

            return $r;
        }, $rows));

        $income = $this->sum($rows, 'income');
        $spend = $this->sum($rows, 'total_expenses');
        $surplus = bcsub($income, $spend, 2);

        return [
            'columns' => [
                $this->col('month', 'Month'),
                $this->col('income', 'Income', 'money'),
                $this->col('direct_costs', 'Direct costs', 'money'),
                $this->col('expenses', 'Operating expenses', 'money'),
                $this->col('total_expenses', 'Total expenditure', 'money'),
                $this->col('surplus', 'Surplus / (deficit)', 'money'),
                $this->col('margin', 'Margin', 'percent'),
            ],
            'rows' => $rows,
            'totals' => [
                'month' => 'Total',
                'income' => $income,
                'direct_costs' => $this->sum($rows, 'direct_costs'),
                'expenses' => $this->sum($rows, 'expenses'),
                'total_expenses' => $spend,
                'surplus' => $surplus,
                'margin' => $this->pct($surplus, $income),
            ],
            'summary' => [
                $this->stat('Income', $income, 'money', 'success', 'trending-up'),
                $this->stat('Expenditure', $spend, 'money', 'danger', 'trending-down'),
                $this->stat(bccomp($surplus, '0', 2) >= 0 ? 'Surplus' : 'Deficit', $surplus, 'money', bccomp($surplus, '0', 2) >= 0 ? 'primary' : 'warning', 'scale'),
                $this->stat('Margin', $this->pct($surplus, $income), 'percent', 'info', 'percent'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'format' => 'money',
                'categories' => array_map(fn ($r) => Carbon::parse('1 '.$r['month'])->format('M y'), $rows),
                'series' => [
                    ['name' => 'Income', 'data' => array_map(fn ($r) => (float) $r['income'], $rows)],
                    ['name' => 'Expenditure', 'data' => array_map(fn ($r) => (float) $r['total_expenses'], $rows)],
                    ['name' => 'Surplus', 'data' => array_map(fn ($r) => (float) $r['surplus'], $rows)],
                ],
            ] : null,
            'note' => 'Source: posted journals in the general ledger. For full statements see the Income Statement and Balance Sheet in Accounting.',
        ];
    }
}
