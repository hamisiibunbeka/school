<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class DailyCollections extends Report
{
    public function key(): string
    {
        return 'daily-collections';
    }

    public function title(): string
    {
        return 'Daily Collections (Cashier Report)';
    }

    public function description(): string
    {
        return 'Receipt-by-receipt listing for cash-up, grouped by the cashier who received the money.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'receipt';
    }

    public function permissions(): array
    {
        return ['fees.view'];
    }

    public function filters(): array
    {
        $cashiers = DB::table('users')
            ->whereIn('id', $this->table('payments')->whereNotNull('received_by')->select('received_by'))
            ->orderBy('name')->get(['id', 'name'])
            ->map(fn ($u) => ['value' => $u->id, 'label' => $u->name])->all();

        return [
            ...$this->rangeFilters($this->today(), $this->today()),
            $this->selectFilter('cashier', 'Cashier', $cashiers, '', 'All cashiers'),
            $this->selectFilter('method', 'Method', $this->enum(FeeCollection::METHODS), '', 'All methods'),
            $this->selectFilter('status', 'Status', $this->enum(['posted', 'void']), 'posted', 'Posted & void'),
        ];
    }

    public function run(array $f): array
    {
        $q = $this->table('payments')
            ->join('students', 'students.id', '=', 'payments.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('users', 'users.id', '=', 'payments.received_by')
            ->leftJoin('accounts', 'accounts.id', '=', 'payments.deposit_account_id')
            ->when($f['cashier'], fn ($q, $v) => $q->where('payments.received_by', $v))
            ->when($f['method'], fn ($q, $v) => $q->where('payments.method', $v))
            ->when($f['status'], fn ($q, $v) => $q->where('payments.status', $v));
        $this->dateRange($q, 'payments.payment_date', $f);

        $rows = $this->rows($q->orderBy('payments.payment_date')->orderBy('payments.created_at')->get([
            'payments.id', 'payments.payment_date', DB::raw("DATE_FORMAT(payments.created_at, '%H:%i') as time"), 'payments.receipt_no',
            'students.admission_no', $this->studentName(), DB::raw("COALESCE(school_classes.name, '') as class"),
            'payments.method', 'payments.reference', DB::raw("COALESCE(accounts.name, '') as deposit_account"),
            DB::raw("COALESCE(users.name, 'System') as cashier"), 'payments.status', 'payments.amount',
        ]));

        $posted = array_values(array_filter($rows, fn ($r) => $r['status'] === 'posted'));
        $byCashier = [];
        foreach ($posted as $r) {
            $byCashier[$r['cashier']] = bcadd($byCashier[$r['cashier']] ?? '0', (string) $r['amount'], 2);
        }
        $cash = $this->sum(array_filter($posted, fn ($r) => $r['method'] === 'cash'), 'amount');

        return [
            'columns' => [
                $this->col('payment_date', 'Date', 'date'),
                $this->col('time', 'Time'),
                $this->col('receipt_no', 'Receipt'),
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('method', 'Method', 'badge'),
                $this->col('reference', 'Reference'),
                $this->col('deposit_account', 'Deposited to'),
                $this->col('cashier', 'Received by'),
                $this->col('status', 'Status', 'badge'),
                $this->col('amount', 'Amount', 'money'),
            ],
            'rows' => $rows,
            'totals' => ['payment_date' => 'Total posted', 'amount' => $this->sum($posted, 'amount')],
            'summary' => [
                $this->stat('Total posted', $this->sum($posted, 'amount'), 'money', 'success', 'wallet'),
                $this->stat('Cash to bank', $cash, 'money', 'warning', 'banknote'),
                $this->stat('Receipts', count($posted), 'number', 'primary', 'receipt'),
                $this->stat('Voided', count($rows) - count($posted), 'number', 'danger', 'x'),
            ],
            'chart' => $byCashier ? [
                'type' => 'bar',
                'format' => 'money',
                'horizontal' => true,
                'categories' => array_keys($byCashier),
                'series' => [['name' => 'Collected', 'data' => array_map('floatval', array_values($byCashier))]],
            ] : null,
        ];
    }
}
