<?php

namespace App\Reports\Students;

use App\Reports\Report;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class NewAdmissions extends Report
{
    public function key(): string
    {
        return 'new-admissions';
    }

    public function title(): string
    {
        return 'New Admissions in Period';
    }

    public function description(): string
    {
        return 'Learners admitted within a date range, with previous school and admission month trend.';
    }

    public function category(): string
    {
        return 'students';
    }

    public function icon(): string
    {
        return 'user-plus';
    }

    public function permissions(): array
    {
        return ['students.view'];
    }

    public function filters(): array
    {
        return [
            ...$this->rangeFilters(now()->startOfYear()->toDateString(), $this->today()),
            $this->classFilter(),
            $this->selectFilter('residence', 'Residence', $this->enum(['day', 'boarding']), '', 'Day & boarding'),
        ];
    }

    public function run(array $f): array
    {
        $q = $this->table('students')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->whereNull('students.deleted_at')->whereNotNull('students.admission_date')
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v))
            ->when($f['residence'], fn ($q, $v) => $q->where('students.residence_type', $v));
        $this->dateRange($q, 'students.admission_date', $f);

        $rows = $this->rows($q->orderBy('students.admission_date')->get([
            'students.id', 'students.admission_date', 'students.admission_no', $this->studentName(), 'students.gender',
            DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class"),
            'students.residence_type', 'students.previous_school', 'students.status',
        ]));

        $months = [];
        foreach ($rows as $r) {
            $m = Carbon::parse($r['admission_date'])->format('M Y');
            $months[$m] = ($months[$m] ?? 0) + 1;
        }
        $male = count(array_filter($rows, fn ($r) => $r['gender'] === 'male'));

        return [
            'columns' => [
                $this->col('admission_date', 'Admitted', 'date'),
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('gender', 'Gender', 'badge'),
                $this->col('class', 'Class'),
                $this->col('residence_type', 'Residence', 'badge'),
                $this->col('previous_school', 'Previous school'),
                $this->col('status', 'Status', 'badge'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('New learners', count($rows), 'number', 'primary', 'user-plus'),
                $this->stat('Boys', $male, 'number', 'info', 'user'),
                $this->stat('Girls', count($rows) - $male, 'number', 'warning', 'user'),
                $this->stat('Boarders', count(array_filter($rows, fn ($r) => $r['residence_type'] === 'boarding')), 'number', 'secondary', 'bed'),
            ],
            'chart' => $months ? [
                'type' => 'bar',
                'categories' => array_keys($months),
                'series' => [['name' => 'Admissions', 'data' => array_values($months)]],
            ] : null,
        ];
    }
}
