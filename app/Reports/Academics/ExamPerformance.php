<?php

namespace App\Reports\Academics;

use Illuminate\Support\Facades\DB;

class ExamPerformance extends ExamReport
{
    public function key(): string
    {
        return 'exam-performance';
    }

    public function title(): string
    {
        return 'Exam Class Performance by Subject';
    }

    public function description(): string
    {
        return 'Average, highest, lowest and pass rate for every subject in an exam.';
    }

    public function icon(): string
    {
        return 'bar-chart';
    }

    public function filters(): array
    {
        return [
            $this->examFilter(),
            $this->classFilter(),
            $this->streamFilter(),
            $this->numberFilter('pass_mark', 'Pass mark %', '30', ['min' => 0, 'max' => 100]),
        ];
    }

    public function run(array $f): array
    {
        $exam = $this->exam($f['exam']);
        if (! $exam) {
            return $this->emptyResult('Select an exam to analyse.');
        }
        $pass = min(max((float) ($f['pass_mark'] !== '' ? $f['pass_mark'] : 30), 0), 100);
        $pct = $this->pctExpr($exam);

        $rows = $this->table('exam_marks')
            ->join('subjects', 'subjects.id', '=', 'exam_marks.subject_id')
            ->join('students', 'students.id', '=', 'exam_marks.student_id')
            ->where('exam_marks.exam_id', $exam->id)
            ->when($f['class'], fn ($q, $v) => $q->where('exam_marks.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('students.stream_id', $v))
            ->groupBy('subjects.id', 'subjects.name', 'subjects.code')
            ->orderBy('subjects.name')
            ->get([
                'subjects.id',
                DB::raw("CONCAT(subjects.name, IF(subjects.code IS NULL, '', CONCAT(' (', subjects.code, ')'))) as subject"),
                DB::raw('SUM(exam_marks.is_absent = 0 AND exam_marks.score IS NOT NULL) as sat'),
                DB::raw('SUM(exam_marks.is_absent = 1) as absent'),
                DB::raw("ROUND(AVG(CASE WHEN exam_marks.is_absent = 0 THEN $pct END), 1) as average"),
                DB::raw("ROUND(MAX(CASE WHEN exam_marks.is_absent = 0 THEN $pct END), 1) as highest"),
                DB::raw("ROUND(MIN(CASE WHEN exam_marks.is_absent = 0 THEN $pct END), 1) as lowest"),
                DB::raw("SUM(exam_marks.is_absent = 0 AND $pct >= $pass) as passed"),
            ]);

        $scales = $this->scales();
        $rows = array_map(function ($r) use ($scales) {
            $r = (array) $r;
            $r['sat'] = (int) $r['sat'];
            $r['absent'] = (int) $r['absent'];
            $r['passed'] = (int) $r['passed'];
            $r['average'] = $r['average'] !== null ? (float) $r['average'] : null;
            $r['grade'] = $this->gradeFor($r['average'], $scales);
            $r['pass_rate'] = $this->pct($r['passed'], $r['sat']);

            return $r;
        }, $this->rows($rows));

        $sat = $this->count($rows, 'sat');
        $avg = $sat ? round(array_sum(array_map(fn ($r) => ($r['average'] ?? 0) * $r['sat'], $rows)) / $sat, 1) : null;
        $best = collect($rows)->sortByDesc('average')->first();

        return [
            'columns' => [
                $this->col('subject', 'Subject'),
                $this->col('sat', 'Sat', 'number'),
                $this->col('absent', 'Absent', 'number'),
                $this->col('average', 'Average %', 'number'),
                $this->col('grade', 'Mean grade', 'badge'),
                $this->col('highest', 'Highest %', 'number'),
                $this->col('lowest', 'Lowest %', 'number'),
                $this->col('passed', 'Passed', 'number'),
                $this->col('pass_rate', 'Pass rate', 'percent'),
            ],
            'rows' => $rows,
            'totals' => [
                'subject' => 'All subjects',
                'sat' => $sat,
                'absent' => $this->count($rows, 'absent'),
                'average' => $avg,
                'grade' => $this->gradeFor($avg, $scales),
                'passed' => $this->count($rows, 'passed'),
                'pass_rate' => $this->pct($this->count($rows, 'passed'), $sat),
            ],
            'summary' => [
                $this->stat('Overall mean', $avg, 'percent', 'primary', 'trending-up'),
                $this->stat('Pass rate', $this->pct($this->count($rows, 'passed'), $sat), 'percent', 'success', 'check'),
                $this->stat('Best subject', $best ? $best['subject'] : '—', 'text', 'info', 'award'),
                $this->stat('Scripts marked', $sat, 'number', 'secondary', 'file-text'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'categories' => array_column($rows, 'subject'),
                'series' => [
                    ['name' => 'Average %', 'data' => array_map(fn ($r) => $r['average'] ?? 0, $rows)],
                    ['name' => 'Pass rate %', 'data' => array_map(fn ($r) => $r['pass_rate'] ?? 0, $rows)],
                ],
            ] : null,
            'note' => "Exam: {$exam->name}. Scores are shown as a percentage of the maximum score ({$exam->max_score}); pass mark {$pass}%.",
        ];
    }
}
