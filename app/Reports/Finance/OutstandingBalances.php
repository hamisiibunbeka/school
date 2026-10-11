<?php

namespace App\Reports\Finance;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class OutstandingBalances extends Report
{
    public function key(): string
    {
        return 'outstanding-balances';
    }

    public function title(): string
    {
        return 'Outstanding Balances by Class';
    }

    public function description(): string
    {
        return 'Billed, paid and outstanding fees per learner or per class, with guardian phone for follow-up.';
    }

    public function category(): string
    {
        return 'fees';
    }

    public function icon(): string
    {
        return 'alert-circle';
    }

    public function permissions(): array
    {
        return ['fees.view'];
    }

    public function filters(): array
    {
        return [
            $this->selectFilter('group', 'View', [['value' => 'student', 'label' => 'Per learner'], ['value' => 'class', 'label' => 'Per class']], 'student', null),
            $this->termFilter(false),
            $this->classFilter(),
            $this->streamFilter(),
            $this->numberFilter('min_balance', 'Min. balance', '1', ['min' => 0]),
        ];
    }

    public function run(array $f): array
    {
        $min = (string) max((float) ($f['min_balance'] ?: 0), 0);

        $base = $this->table('invoices')
            ->join('students', 'students.id', '=', 'invoices.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->whereNotIn('invoices.status', ['draft', 'cancelled'])
            ->whereNull('students.deleted_at')
            ->when($f['term'], fn ($q, $v) => $q->where('invoices.term_id', $v))
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('students.stream_id', $v));

        if ($f['group'] === 'class') {
            $rows = $this->rows((clone $base)
                ->groupBy('school_classes.id', 'school_classes.name', 'school_classes.level')
                ->havingRaw('SUM(invoices.balance) >= ?', [$min])
                ->orderBy('school_classes.level')
                ->get([
                    DB::raw("COALESCE(school_classes.name, 'Unassigned') as class"),
                    DB::raw('COUNT(DISTINCT invoices.student_id) as learners'),
                    DB::raw('COUNT(DISTINCT CASE WHEN invoices.balance > 0 THEN invoices.student_id END) as debtors'),
                    DB::raw('SUM(invoices.total) as billed'),
                    DB::raw('SUM(invoices.paid) as paid'),
                    DB::raw('SUM(invoices.balance) as balance'),
                ]));
            foreach ($rows as &$r) {
                $r['learners'] = (int) $r['learners'];
                $r['debtors'] = (int) $r['debtors'];
                $r['collection_rate'] = $this->pct($r['paid'], $r['billed']);
            }
            unset($r);

            $columns = [
                $this->col('class', 'Class'),
                $this->col('learners', 'Learners billed', 'number'),
                $this->col('debtors', 'With balance', 'number'),
                $this->col('billed', 'Billed', 'money'),
                $this->col('paid', 'Paid', 'money'),
                $this->col('balance', 'Outstanding', 'money'),
                $this->col('collection_rate', 'Collected', 'percent'),
            ];
            $debtors = $this->count($rows, 'debtors');
            $chart = ['categories' => array_column($rows, 'class'), 'data' => array_map(fn ($r) => (float) $r['balance'], $rows)];
        } else {
            $phone = DB::table('guardian_student')
                ->join('guardians', 'guardians.id', '=', 'guardian_student.guardian_id')
                ->where('guardians.school_id', $this->schoolId())
                ->groupBy('guardian_student.student_id')
                ->selectRaw("guardian_student.student_id, MAX(CONCAT(guardians.first_name, ' ', guardians.last_name)) as guardian, MAX(guardians.phone) as phone");

            $rows = $this->rows((clone $base)
                ->leftJoinSub($phone, 'pg', 'pg.student_id', '=', 'students.id')
                ->groupBy('students.id', 'students.admission_no', 'students.first_name', 'students.middle_name', 'students.last_name', 'school_classes.name', 'school_classes.level', 'streams.name', 'pg.guardian', 'pg.phone')
                ->havingRaw('SUM(invoices.balance) >= ?', [$min])
                ->orderBy('school_classes.level')->orderByRaw('SUM(invoices.balance) DESC')
                ->get([
                    'students.id', 'students.admission_no', $this->studentName(),
                    DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
                    DB::raw("COALESCE(school_classes.name, 'Unassigned') as class_name"),
                    DB::raw('SUM(invoices.total) as billed'),
                    DB::raw('SUM(invoices.paid) as paid'),
                    DB::raw('SUM(invoices.balance) as balance'),
                    DB::raw('MIN(CASE WHEN invoices.balance > 0 THEN invoices.due_date END) as oldest_due'),
                    DB::raw("COALESCE(pg.guardian, '') as guardian"),
                    DB::raw("COALESCE(pg.phone, '') as phone"),
                ]));

            $columns = [
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('billed', 'Billed', 'money'),
                $this->col('paid', 'Paid', 'money'),
                $this->col('balance', 'Outstanding', 'money'),
                $this->col('oldest_due', 'Oldest due', 'date'),
                $this->col('guardian', 'Guardian'),
                $this->col('phone', 'Phone'),
            ];
            $debtors = count(array_filter($rows, fn ($r) => bccomp((string) $r['balance'], '0', 2) > 0));
            $byClass = [];
            foreach ($rows as $r) {
                $byClass[$r['class_name']] = bcadd($byClass[$r['class_name']] ?? '0', (string) $r['balance'], 2);
            }
            $chart = ['categories' => array_keys($byClass), 'data' => array_map('floatval', array_values($byClass))];
        }

        $billed = $this->sum($rows, 'billed');
        $paid = $this->sum($rows, 'paid');
        $balance = $this->sum($rows, 'balance');

        return [
            'columns' => $columns,
            'rows' => $rows,
            'totals' => [$columns[0]['key'] => 'Total', 'billed' => $billed, 'paid' => $paid, 'balance' => $balance, 'collection_rate' => $this->pct($paid, $billed)],
            'summary' => [
                $this->stat('Total outstanding', $balance, 'money', 'danger', 'alert-circle'),
                $this->stat('Learners with balance', $debtors, 'number', 'warning', 'users'),
                $this->stat('Billed', $billed, 'money', 'primary', 'file-text'),
                $this->stat('Collection rate', $this->pct($paid, $billed), 'percent', 'success', 'trending-up'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'format' => 'money',
                'categories' => $chart['categories'],
                'series' => [['name' => 'Outstanding', 'data' => $chart['data']]],
            ] : null,
        ];
    }
}
