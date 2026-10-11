<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class Discounts extends Report
{
    public function key(): string
    {
        return 'discounts';
    }

    public function title(): string
    {
        return 'Discounts & Scholarships Granted';
    }

    public function description(): string
    {
        return 'Approved discounts and scholarships per learner with the amount applied on invoices.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'badge-percent';
    }

    public function permissions(): array
    {
        return ['fees.view'];
    }

    public function filters(): array
    {
        $categories = $this->table('fee_categories')->orderBy('name')->get(['id', 'name'])
            ->map(fn ($c) => ['value' => $c->id, 'label' => $c->name])->all();

        return [
            $this->classFilter(),
            $this->selectFilter('fee_category', 'Fee category', $categories, '', 'All categories'),
            $this->selectFilter('active', 'Status', [['value' => '1', 'label' => 'Active'], ['value' => '0', 'label' => 'Inactive']], '1', 'Active & inactive'),
            $this->termFilter(true, 'All terms (applied amount)'),
        ];
    }

    public function run(array $f): array
    {
        // Discount actually applied on invoice lines, per student & category.
        $applied = DB::table('invoice_items')
            ->join('invoices', 'invoices.id', '=', 'invoice_items.invoice_id')
            ->where('invoices.school_id', $this->schoolId())
            ->whereNotIn('invoices.status', ['draft', 'cancelled'])
            ->when($f['term'], fn ($q, $v) => $q->where('invoices.term_id', $v))
            ->groupBy('invoices.student_id', 'invoice_items.fee_category_id')
            ->selectRaw('invoices.student_id, invoice_items.fee_category_id, SUM(invoice_items.discount) as applied');

        $rows = $this->rows($this->table('fee_discounts')
            ->join('students', 'students.id', '=', 'fee_discounts.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('fee_categories', 'fee_categories.id', '=', 'fee_discounts.fee_category_id')
            ->leftJoin('users', 'users.id', '=', 'fee_discounts.approved_by')
            ->leftJoinSub($applied, 'ap', function ($j) {
                $j->on('ap.student_id', '=', 'fee_discounts.student_id')
                    ->whereRaw('(fee_discounts.fee_category_id IS NULL OR ap.fee_category_id = fee_discounts.fee_category_id)');
            })
            ->whereNull('students.deleted_at')
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->when($f['fee_category'], fn ($q, $v) => $q->where('fee_discounts.fee_category_id', $v))
            ->when($f['active'] !== '', fn ($q) => $q->where('fee_discounts.is_active', $f['active'] === '1'))
            ->groupBy('fee_discounts.id', 'fee_discounts.name', 'fee_discounts.type', 'fee_discounts.value', 'fee_discounts.reason', 'fee_discounts.is_active',
                'students.admission_no', 'students.first_name', 'students.middle_name', 'students.last_name', 'school_classes.name', 'fee_categories.name', 'users.name')
            ->orderBy('students.first_name')
            ->get([
                'fee_discounts.id', 'students.admission_no', $this->studentName(), DB::raw("COALESCE(school_classes.name, '') as class"),
                'fee_discounts.name', DB::raw("COALESCE(fee_categories.name, 'All fees') as fee_category"),
                'fee_discounts.type', 'fee_discounts.value', 'fee_discounts.reason',
                DB::raw("COALESCE(users.name, '') as approved_by"),
                DB::raw("IF(fee_discounts.is_active, 'active', 'inactive') as status"),
                DB::raw('COALESCE(SUM(ap.applied), 0) as applied'),
            ]));

        foreach ($rows as &$r) {
            $r['value_label'] = $r['type'] === 'percent' ? rtrim(rtrim((string) $r['value'], '0'), '.').'%' : number_format((float) $r['value'], 2);
        }
        unset($r);

        $byName = [];
        foreach ($rows as $r) {
            $byName[$r['name']] = bcadd($byName[$r['name']] ?? '0', (string) $r['applied'], 2);
        }

        return [
            'columns' => [
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('name', 'Discount / scholarship'),
                $this->col('fee_category', 'Applies to'),
                $this->col('value_label', 'Value'),
                $this->col('reason', 'Reason'),
                $this->col('approved_by', 'Approved by'),
                $this->col('status', 'Status', 'badge'),
                $this->col('applied', 'Applied on invoices', 'money'),
            ],
            'rows' => $rows,
            'totals' => ['admission_no' => 'Total', 'applied' => $this->sum($rows, 'applied')],
            'summary' => [
                $this->stat('Discounts granted', count($rows), 'number', 'primary', 'badge-percent'),
                $this->stat('Beneficiaries', count(array_unique(array_column($rows, 'admission_no'))), 'number', 'info', 'users'),
                $this->stat('Value applied', $this->sum($rows, 'applied'), 'money', 'warning', 'wallet'),
            ],
            'chart' => array_filter($byName, fn ($v) => bccomp($v, '0', 2) > 0) ? [
                'type' => 'donut',
                'format' => 'money',
                'labels' => array_keys($byName),
                'series' => array_map('floatval', array_values($byName)),
            ] : null,
        ];
    }
}
