<?php

namespace App\Reports\Students;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class AdmissionsPipeline extends Report
{
    private const STATUSES = ['submitted', 'under_review', 'interview', 'accepted', 'waitlisted', 'rejected', 'enrolled', 'withdrawn'];

    public function key(): string
    {
        return 'admissions-pipeline';
    }

    public function title(): string
    {
        return 'Admissions Pipeline by Status';
    }

    public function description(): string
    {
        return 'Applications at each stage of the funnel with gender split and conversion rate.';
    }

    public function category(): string
    {
        return 'students';
    }

    public function icon(): string
    {
        return 'filter';
    }

    public function permissions(): array
    {
        return ['admissions.view'];
    }

    public function filters(): array
    {
        return [
            $this->yearFilter(false),
            $this->classFilter('All entry classes'),
            ...$this->rangeFilters(),
        ];
    }

    public function run(array $f): array
    {
        $data = $this->table('admission_applications')
            ->when($f['year'], fn ($q, $v) => $q->where('academic_year_id', $v))
            ->when($f['class'], fn ($q, $v) => $q->where('school_class_id', $v))
            ->when($f['from'], fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($f['to'], fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->groupBy('status')
            ->get(['status', DB::raw('COUNT(*) as total'), DB::raw("SUM(gender = 'male') as male"), DB::raw("SUM(gender = 'female') as female"), DB::raw('AVG(assessment_score) as avg_score')])
            ->keyBy('status');

        $grand = (int) $data->sum('total');
        $rows = [];
        foreach (array_unique([...self::STATUSES, ...$data->keys()->all()]) as $status) {
            $r = $data[$status] ?? null;
            $rows[] = [
                'status' => $status,
                'total' => (int) ($r->total ?? 0),
                'male' => (int) ($r->male ?? 0),
                'female' => (int) ($r->female ?? 0),
                'avg_score' => $r && $r->avg_score !== null ? round((float) $r->avg_score, 1) : null,
                'share' => $this->pct($r->total ?? 0, $grand),
            ];
        }

        $accepted = ($data['accepted']->total ?? 0) + ($data['enrolled']->total ?? 0);
        $enrolled = (int) ($data['enrolled']->total ?? 0);
        $pending = array_sum(array_map(fn ($s) => (int) ($data[$s]->total ?? 0), ['submitted', 'under_review', 'interview']));

        return [
            'columns' => [
                $this->col('status', 'Stage', 'badge'),
                $this->col('total', 'Applications', 'number'),
                $this->col('male', 'Boys', 'number'),
                $this->col('female', 'Girls', 'number'),
                $this->col('avg_score', 'Avg. assessment', 'number'),
                $this->col('share', 'Share', 'percent'),
            ],
            'rows' => $rows,
            'totals' => ['status' => 'Total', 'total' => $grand, 'male' => $this->count($rows, 'male'), 'female' => $this->count($rows, 'female'), 'share' => $grand ? 100 : null],
            'summary' => [
                $this->stat('Applications', $grand, 'number', 'primary', 'file-text'),
                $this->stat('Awaiting decision', $pending, 'number', 'warning', 'clock'),
                $this->stat('Accepted / enrolled', $accepted, 'number', 'success', 'check'),
                $this->stat('Conversion to enrolment', $this->pct($enrolled, $grand), 'percent', 'info', 'trending-up'),
            ],
            'chart' => [
                'type' => 'donut',
                'labels' => array_map(fn ($r) => ucwords(str_replace('_', ' ', $r['status'])), array_values(array_filter($rows, fn ($r) => $r['total'] > 0))),
                'series' => array_values(array_map(fn ($r) => $r['total'], array_filter($rows, fn ($r) => $r['total'] > 0))),
            ],
        ];
    }
}
