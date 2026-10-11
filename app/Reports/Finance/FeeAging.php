<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class FeeAging extends Report
{
    private const BUCKETS = [
        'current' => 'Not yet due',
        'd30' => '0–30 days',
        'd60' => '31–60 days',
        'd90' => '61–90 days',
        'd90p' => '90+ days',
    ];

    public function key(): string
    {
        return 'fee-aging';
    }

    public function title(): string
    {
        return 'Fee Arrears Aging';
    }

    public function description(): string
    {
        return 'Unpaid invoice balances bucketed by days past due (0–30, 31–60, 61–90, 90+).';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'hourglass';
    }

    public function permissions(): array
    {
        return ['fees.view'];
    }

    public function filters(): array
    {
        return [
            $this->dateFilter('as_of', 'As at', $this->today()),
            $this->classFilter(),
            $this->selectFilter('group', 'View', [['value' => 'student', 'label' => 'Per learner'], ['value' => 'class', 'label' => 'Per class']], 'student', null),
        ];
    }

    public function run(array $f): array
    {
        $asOf = $f['as_of'] ?: $this->today();
        $days = "DATEDIFF('$asOf', COALESCE(invoices.due_date, invoices.issue_date))";

        $q = $this->table('invoices')
            ->join('students', 'students.id', '=', 'invoices.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->whereIn('invoices.status', ['unpaid', 'partial'])
            ->where('invoices.balance', '>', 0)
            ->whereDate('invoices.issue_date', '<=', $asOf)
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v));

        $select = [
            DB::raw("COALESCE(SUM(CASE WHEN $days <= 0 THEN invoices.balance END), 0) as current"),
            DB::raw("COALESCE(SUM(CASE WHEN $days BETWEEN 1 AND 30 THEN invoices.balance END), 0) as d30"),
            DB::raw("COALESCE(SUM(CASE WHEN $days BETWEEN 31 AND 60 THEN invoices.balance END), 0) as d60"),
            DB::raw("COALESCE(SUM(CASE WHEN $days BETWEEN 61 AND 90 THEN invoices.balance END), 0) as d90"),
            DB::raw("COALESCE(SUM(CASE WHEN $days > 90 THEN invoices.balance END), 0) as d90p"),
            DB::raw('SUM(invoices.balance) as total'),
            DB::raw("MAX($days) as max_days"),
        ];

        if ($f['group'] === 'class') {
            $rows = $this->rows($q->groupBy('school_classes.id', 'school_classes.name', 'school_classes.level')->orderBy('school_classes.level')
                ->get([DB::raw("COALESCE(school_classes.name, 'Unassigned') as name"), DB::raw('COUNT(DISTINCT invoices.student_id) as learners'), ...$select]));
            $lead = [$this->col('name', 'Class'), $this->col('learners', 'Learners', 'number')];
        } else {
            $rows = $this->rows($q->groupBy('students.id', 'students.admission_no', 'students.first_name', 'students.middle_name', 'students.last_name', 'school_classes.name')
                ->orderByRaw('SUM(invoices.balance) DESC')
                ->get(['students.admission_no', DB::raw("TRIM(CONCAT(students.first_name, ' ', COALESCE(CONCAT(students.middle_name, ' '), ''), students.last_name)) as name"), DB::raw("COALESCE(school_classes.name, '') as class"), DB::raw('COUNT(*) as invoices'), ...$select]));
            $lead = [$this->col('admission_no', 'Adm. No'), $this->col('name', 'Student'), $this->col('class', 'Class'), $this->col('invoices', 'Invoices', 'number')];
        }

        foreach ($rows as &$r) {
            $r['max_days'] = max((int) $r['max_days'], 0);
        }
        unset($r);

        $totals = ['name' => 'Total', 'total' => $this->sum($rows, 'total')];
        foreach (array_keys(self::BUCKETS) as $b) {
            $totals[$b] = $this->sum($rows, $b);
        }
        $overdue = bcsub($totals['total'], $totals['current'], 2);

        return [
            'columns' => [
                ...$lead,
                ...array_map(fn ($k, $label) => $this->col($k, $label, 'money'), array_keys(self::BUCKETS), self::BUCKETS),
                $this->col('total', 'Total', 'money'),
                $this->col('max_days', 'Oldest (days)', 'number'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Total receivable', $totals['total'], 'money', 'primary', 'wallet'),
                $this->stat('Overdue', $overdue, 'money', 'warning', 'clock'),
                $this->stat('Over 90 days', $totals['d90p'], 'money', 'danger', 'alert-triangle'),
                $this->stat('Overdue share', $this->pct($overdue, $totals['total']), 'percent', 'secondary', 'percent'),
            ],
            'chart' => bccomp($totals['total'], '0', 2) > 0 ? [
                'type' => 'bar',
                'format' => 'money',
                'categories' => array_values(self::BUCKETS),
                'series' => [['name' => 'Balance', 'data' => array_map(fn ($b) => (float) $totals[$b], array_keys(self::BUCKETS))]],
            ] : null,
            'note' => 'Aging uses the invoice due date (or issue date when no due date is set) against current outstanding balances.',
        ];
    }
}
