<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class FeeCollection extends Report
{
    public const METHODS = ['cash', 'bank', 'mobile_money', 'cheque', 'card'];

    public function key(): string
    {
        return 'fee-collection';
    }

    public function title(): string
    {
        return 'Fee Collection Summary';
    }

    public function description(): string
    {
        return 'Posted receipts by day or month, split by payment method.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'wallet';
    }

    public function permissions(): array
    {
        return ['fees.view'];
    }

    public function filters(): array
    {
        return [
            ...$this->rangeFilters($this->termStart(), $this->today()),
            $this->selectFilter('group', 'Group by', [['value' => 'month', 'label' => 'Month'], ['value' => 'week', 'label' => 'Week'], ['value' => 'day', 'label' => 'Day']], 'month', null),
            $this->selectFilter('method', 'Method', $this->enum(self::METHODS), '', 'All methods'),
            $this->classFilter(),
        ];
    }

    public function run(array $f): array
    {
        $format = match ($f['group']) {
            'day' => '%Y-%m-%d',
            'week' => '%x-W%v',
            default => '%Y-%m',
        };

        $q = $this->table('payments')
            ->join('students', 'students.id', '=', 'payments.student_id')
            ->where('payments.status', 'posted')
            ->when($f['method'], fn ($q, $v) => $q->where('payments.method', $v))
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v));
        $this->dateRange($q, 'payments.payment_date', $f);

        $select = [
            DB::raw("DATE_FORMAT(payments.payment_date, '$format') as period_key"),
            DB::raw('MIN(payments.payment_date) as first_date'),
            DB::raw('COUNT(*) as receipts'),
            DB::raw('SUM(payments.amount) as total'),
        ];
        foreach (self::METHODS as $m) {
            $select[] = DB::raw("COALESCE(SUM(CASE WHEN payments.method = '$m' THEN payments.amount END), 0) as m_$m");
        }

        $rows = $q->groupByRaw("DATE_FORMAT(payments.payment_date, '$format')")->orderBy('period_key')->get($select);

        $rows = array_map(function ($r) use ($f) {
            $r = (array) $r;
            $d = Carbon::parse($r['first_date']);
            $r['period'] = match ($f['group']) {
                'day' => $d->format('D, d/m/Y'),
                'week' => 'Week of '.$d->startOfWeek()->format('d/m/Y'),
                default => $d->format('F Y'),
            };
            $r['receipts'] = (int) $r['receipts'];
            unset($r['first_date'], $r['period_key']);

            return $r;
        }, $this->rows($rows));

        $methodCols = array_values(array_filter(self::METHODS, fn ($m) => bccomp($this->sum($rows, "m_$m"), '0', 2) !== 0 || $f['method'] === $m));
        $total = $this->sum($rows, 'total');
        $receipts = $this->count($rows, 'receipts');
        $topMethod = collect($methodCols)->sortByDesc(fn ($m) => (float) $this->sum($rows, "m_$m"))->first();

        $totals = ['period' => 'Total', 'receipts' => $receipts, 'total' => $total];
        foreach ($methodCols as $m) {
            $totals["m_$m"] = $this->sum($rows, "m_$m");
        }

        return [
            'columns' => [
                $this->col('period', ucfirst($f['group'] ?: 'month')),
                $this->col('receipts', 'Receipts', 'number'),
                ...array_map(fn ($m) => $this->col("m_$m", ucwords(str_replace('_', ' ', $m)), 'money'), $methodCols),
                $this->col('total', 'Total collected', 'money'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Total collected', $total, 'money', 'success', 'wallet'),
                $this->stat('Receipts issued', $receipts, 'number', 'primary', 'receipt'),
                $this->stat('Average receipt', $receipts ? bcdiv($total, (string) $receipts, 2) : 0, 'money', 'info', 'calculator'),
                $this->stat('Top method', $topMethod ? ucwords(str_replace('_', ' ', $topMethod)) : '—', 'text', 'secondary', 'credit-card'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'stacked' => true,
                'format' => 'money',
                'categories' => array_column($rows, 'period'),
                'series' => array_map(fn ($m) => ['name' => ucwords(str_replace('_', ' ', $m)), 'data' => array_map(fn ($r) => (float) $r["m_$m"], $rows)], $methodCols),
            ] : null,
        ];
    }
}
