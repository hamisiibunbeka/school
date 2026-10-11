<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class InvoicesIssued extends Report
{
    public function key(): string
    {
        return 'invoices-issued';
    }

    public function title(): string
    {
        return 'Invoices Issued by Term & Category';
    }

    public function description(): string
    {
        return 'Gross billing, discounts and net amounts per fee category for a term.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'file-text';
    }

    public function permissions(): array
    {
        return ['fees.view'];
    }

    public function filters(): array
    {
        return [
            $this->yearFilter(false),
            $this->termFilter(true),
            $this->classFilter(),
            ...$this->rangeFilters(),
        ];
    }

    public function run(array $f): array
    {
        $invoices = $this->table('invoices')
            ->join('students', 'students.id', '=', 'invoices.student_id')
            ->whereNotIn('invoices.status', ['draft', 'cancelled'])
            ->when($f['year'], fn ($q, $v) => $q->where('invoices.academic_year_id', $v))
            ->when($f['term'], fn ($q, $v) => $q->where('invoices.term_id', $v))
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v));
        $this->dateRange($invoices, 'invoices.issue_date', $f);

        $rows = $this->rows((clone $invoices)
            ->join('invoice_items', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->leftJoin('fee_categories', 'fee_categories.id', '=', 'invoice_items.fee_category_id')
            ->groupBy('fee_categories.id', 'fee_categories.name', 'fee_categories.code')
            ->orderByRaw('SUM(invoice_items.amount) DESC')
            ->get([
                DB::raw("COALESCE(fee_categories.name, 'Other charges') as category"),
                DB::raw("COALESCE(fee_categories.code, '') as code"),
                DB::raw('COUNT(DISTINCT invoices.id) as invoices'),
                DB::raw('COUNT(DISTINCT invoices.student_id) as learners'),
                DB::raw('SUM(invoice_items.amount) as gross'),
                DB::raw('SUM(invoice_items.discount) as discount'),
                DB::raw('SUM(invoice_items.amount - invoice_items.discount) as net'),
            ]));

        foreach ($rows as &$r) {
            $r['invoices'] = (int) $r['invoices'];
            $r['learners'] = (int) $r['learners'];
        }
        unset($r);

        $head = (clone $invoices)->selectRaw('COUNT(*) as n, COALESCE(SUM(invoices.total),0) as total, COALESCE(SUM(invoices.paid),0) as paid, COALESCE(SUM(invoices.balance),0) as balance')->first();
        $net = $this->sum($rows, 'net');

        foreach ($rows as &$r) {
            $r['share'] = $this->pct($r['net'], $net);
        }
        unset($r);

        return [
            'columns' => [
                $this->col('category', 'Fee category'),
                $this->col('code', 'Code'),
                $this->col('invoices', 'Invoices', 'number'),
                $this->col('learners', 'Learners', 'number'),
                $this->col('gross', 'Gross billed', 'money'),
                $this->col('discount', 'Discounts', 'money'),
                $this->col('net', 'Net billed', 'money'),
                $this->col('share', 'Share', 'percent'),
            ],
            'rows' => $rows,
            'totals' => ['category' => 'Total', 'gross' => $this->sum($rows, 'gross'), 'discount' => $this->sum($rows, 'discount'), 'net' => $net, 'share' => $rows ? 100 : null],
            'summary' => [
                $this->stat('Invoices issued', (int) ($head->n ?? 0), 'number', 'primary', 'file-text'),
                $this->stat('Total billed', $head->total ?? 0, 'money', 'info', 'wallet'),
                $this->stat('Collected against invoices', $head->paid ?? 0, 'money', 'success', 'check'),
                $this->stat('Balance', $head->balance ?? 0, 'money', 'danger', 'alert-circle'),
            ],
            'chart' => $rows ? [
                'type' => 'donut',
                'format' => 'money',
                'labels' => array_column($rows, 'category'),
                'series' => array_map(fn ($r) => (float) $r['net'], $rows),
            ] : null,
        ];
    }
}
