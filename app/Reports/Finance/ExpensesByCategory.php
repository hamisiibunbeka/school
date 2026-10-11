<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ExpensesByCategory extends Report
{
    public function key(): string
    {
        return 'expenses-by-category';
    }

    public function title(): string
    {
        return 'Expenses by Category & Month';
    }

    public function description(): string
    {
        return 'Expense vouchers per expense account broken down month by month.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'trending-down';
    }

    public function permissions(): array
    {
        return ['accounting.view'];
    }

    public function filters(): array
    {
        $suppliers = $this->table('suppliers')->orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['value' => $s->id, 'label' => $s->name])->all();

        return [
            ...$this->rangeFilters(now()->startOfYear()->toDateString(), $this->today()),
            $this->selectFilter('status', 'Status', [
                ['value' => 'approved_paid', 'label' => 'Approved & paid'],
                ['value' => 'paid', 'label' => 'Paid only'],
                ['value' => 'pending', 'label' => 'Pending approval'],
                ['value' => 'rejected', 'label' => 'Rejected'],
            ], 'approved_paid', 'All statuses'),
            $this->selectFilter('supplier', 'Supplier', $suppliers, '', 'All suppliers'),
        ];
    }

    public function run(array $f): array
    {
        $from = Carbon::parse($f['from'] ?: now()->startOfYear()->toDateString())->startOfMonth();
        $to = Carbon::parse($f['to'] ?: $this->today());
        $months = [];
        for ($m = $from->copy(); $m->lte($to) && count($months) < 24; $m = $m->addMonth()) {
            $months[$m->format('Y-m')] = $m->format('M y');
        }

        $q = $this->table('expenses')
            ->join('accounts', 'accounts.id', '=', 'expenses.expense_account_id')
            ->when($f['status'] === 'approved_paid', fn ($q) => $q->whereIn('expenses.status', ['approved', 'paid']))
            ->when($f['status'] !== '' && $f['status'] !== 'approved_paid', fn ($q) => $q->where('expenses.status', $f['status']))
            ->when($f['supplier'], fn ($q, $v) => $q->where('expenses.supplier_id', $v));
        $this->dateRange($q, 'expenses.date', $f);

        $data = $q->groupBy('accounts.id', 'accounts.code', 'accounts.name')
            ->groupByRaw("DATE_FORMAT(expenses.date, '%Y-%m')")
            ->get(['accounts.id', 'accounts.code', 'accounts.name', DB::raw("DATE_FORMAT(expenses.date, '%Y-%m') as ym"), DB::raw('SUM(expenses.amount) as total'), DB::raw('COUNT(*) as vouchers')]);

        $rows = [];
        foreach ($data->groupBy('id') as $items) {
            $first = $items->first();
            $row = ['account' => "{$first->code} · {$first->name}", 'vouchers' => 0, 'total' => '0'];
            foreach (array_keys($months) as $ym) {
                $row["m_$ym"] = '0';
            }
            foreach ($items as $i) {
                if (isset($months[$i->ym])) {
                    $row["m_{$i->ym}"] = bcadd($row["m_{$i->ym}"], (string) $i->total, 2);
                }
                $row['total'] = bcadd($row['total'], (string) $i->total, 2);
                $row['vouchers'] += (int) $i->vouchers;
            }
            $rows[] = $row;
        }
        usort($rows, fn ($a, $b) => bccomp($b['total'], $a['total'], 2));

        $grand = $this->sum($rows, 'total');
        $totals = ['account' => 'Total', 'vouchers' => $this->count($rows, 'vouchers'), 'total' => $grand];
        foreach (array_keys($months) as $ym) {
            $totals["m_$ym"] = $this->sum($rows, "m_$ym");
        }
        $monthCount = max(count($months), 1);
        $peak = collect($months)->keys()->sortByDesc(fn ($ym) => (float) $totals["m_$ym"])->first();

        return [
            'columns' => [
                $this->col('account', 'Expense account'),
                ...array_map(fn ($ym, $label) => $this->col("m_$ym", $label, 'money'), array_keys($months), $months),
                $this->col('vouchers', 'Vouchers', 'number'),
                $this->col('total', 'Total', 'money'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Total expenses', $grand, 'money', 'danger', 'trending-down'),
                $this->stat('Monthly average', bcdiv($grand, (string) $monthCount, 2), 'money', 'warning', 'calculator'),
                $this->stat('Largest category', $rows[0]['account'] ?? '—', 'text', 'primary', 'pie-chart'),
                $this->stat('Peak month', $peak && bccomp($totals["m_$peak"], '0', 2) > 0 ? $months[$peak] : '—', 'text', 'info', 'calendar'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'stacked' => true,
                'format' => 'money',
                'categories' => array_values($months),
                'series' => array_map(fn ($r) => ['name' => $r['account'], 'data' => array_map(fn ($ym) => (float) $r["m_$ym"], array_keys($months))], array_slice($rows, 0, 8)),
            ] : null,
            'note' => count($months) >= 24 ? 'Monthly columns are limited to the first 24 months of the period; totals include the whole period.' : null,
        ];
    }
}
