<?php

namespace App\Reports\Students;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class EnrolmentSummary extends Report
{
    public function key(): string
    {
        return 'enrolment-summary';
    }

    public function title(): string
    {
        return 'Enrolment Summary by Class & Gender';
    }

    public function description(): string
    {
        return 'Learners per class and stream split by gender and residence, with capacity utilisation.';
    }

    public function category(): string
    {
        return 'students';
    }

    public function icon(): string
    {
        return 'users';
    }

    public function permissions(): array
    {
        return ['students.view'];
    }

    public function filters(): array
    {
        return [
            $this->selectFilter('status', 'Status', $this->enum(['active', 'on_leave', 'suspended', 'transferred', 'graduated', 'withdrawn']), 'active', 'Any status'),
            $this->selectFilter('residence', 'Residence', $this->enum(['day', 'boarding']), '', 'Day & boarding'),
        ];
    }

    public function run(array $f): array
    {
        $rows = $this->table('streams')
            ->join('school_classes', 'school_classes.id', '=', 'streams.school_class_id')
            ->leftJoin('students', function ($j) use ($f) {
                $j->on('students.stream_id', '=', 'streams.id')->whereNull('students.deleted_at');
                if ($f['status'] !== '') {
                    $j->where('students.status', '=', $f['status']);
                }
                if ($f['residence'] !== '') {
                    $j->where('students.residence_type', '=', $f['residence']);
                }
            })
            ->groupBy('streams.id', 'streams.name', 'streams.capacity', 'school_classes.name', 'school_classes.level')
            ->orderBy('school_classes.level')->orderBy('streams.name')
            ->get([
                DB::raw("CONCAT(school_classes.name, ' ', streams.name) as class"),
                DB::raw("SUM(students.gender = 'male') as male"),
                DB::raw("SUM(students.gender = 'female') as female"),
                DB::raw("SUM(students.residence_type = 'day') as day"),
                DB::raw("SUM(students.residence_type = 'boarding') as boarding"),
                DB::raw('COUNT(students.id) as total'),
                'streams.capacity',
                'school_classes.name as class_name',
            ]);

        // Learners in a class without a stream
        $unstreamed = $this->table('students')
            ->join('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->whereNull('students.deleted_at')->whereNull('students.stream_id')
            ->when($f['status'], fn ($q, $v) => $q->where('students.status', $v))
            ->when($f['residence'], fn ($q, $v) => $q->where('students.residence_type', $v))
            ->groupBy('school_classes.id', 'school_classes.name', 'school_classes.level')
            ->get([
                DB::raw("CONCAT(school_classes.name, ' (no stream)') as class"),
                DB::raw("SUM(students.gender = 'male') as male"),
                DB::raw("SUM(students.gender = 'female') as female"),
                DB::raw("SUM(students.residence_type = 'day') as day"),
                DB::raw("SUM(students.residence_type = 'boarding') as boarding"),
                DB::raw('COUNT(students.id) as total'),
                DB::raw('NULL as capacity'),
                'school_classes.name as class_name',
            ]);

        $rows = array_map(function ($r) {
            $r = (array) $r;
            foreach (['male', 'female', 'day', 'boarding', 'total'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            $r['utilisation'] = $r['capacity'] ? $this->pct($r['total'], $r['capacity']) : null;

            return $r;
        }, [...$this->rows($rows), ...$this->rows($unstreamed)]);

        // Chart by class (streams combined)
        $byClass = [];
        foreach ($rows as $r) {
            $byClass[$r['class_name']]['male'] = ($byClass[$r['class_name']]['male'] ?? 0) + $r['male'];
            $byClass[$r['class_name']]['female'] = ($byClass[$r['class_name']]['female'] ?? 0) + $r['female'];
        }

        $total = $this->count($rows, 'total');
        $capacity = $this->count($rows, 'capacity');

        return [
            'columns' => [
                $this->col('class', 'Class / stream'),
                $this->col('male', 'Boys', 'number'),
                $this->col('female', 'Girls', 'number'),
                $this->col('day', 'Day', 'number'),
                $this->col('boarding', 'Boarding', 'number'),
                $this->col('total', 'Total', 'number'),
                $this->col('capacity', 'Capacity', 'number'),
                $this->col('utilisation', 'Utilisation', 'percent'),
            ],
            'rows' => $rows,
            'totals' => [
                'class' => 'Total',
                'male' => $this->count($rows, 'male'),
                'female' => $this->count($rows, 'female'),
                'day' => $this->count($rows, 'day'),
                'boarding' => $this->count($rows, 'boarding'),
                'total' => $total,
                'capacity' => $capacity ?: null,
                'utilisation' => $capacity ? $this->pct($total, $capacity) : null,
            ],
            'summary' => [
                $this->stat('Total learners', $total, 'number', 'primary', 'users'),
                $this->stat('Boys', $this->count($rows, 'male'), 'number', 'info', 'user'),
                $this->stat('Girls', $this->count($rows, 'female'), 'number', 'warning', 'user'),
                $this->stat('Boarders', $this->count($rows, 'boarding'), 'number', 'secondary', 'bed'),
            ],
            'chart' => [
                'type' => 'bar',
                'stacked' => true,
                'categories' => array_keys($byClass),
                'series' => [
                    ['name' => 'Boys', 'data' => array_column($byClass, 'male')],
                    ['name' => 'Girls', 'data' => array_column($byClass, 'female')],
                ],
            ],
        ];
    }
}
