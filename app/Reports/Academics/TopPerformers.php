<?php

namespace App\Reports\Academics;

use Illuminate\Support\Facades\DB;

class TopPerformers extends ExamReport
{
    public function key(): string
    {
        return 'top-performers';
    }

    public function title(): string
    {
        return 'Top Performers (Merit List)';
    }

    public function description(): string
    {
        return 'Learners ranked by average score in an exam, per class or stream.';
    }

    public function icon(): string
    {
        return 'trophy';
    }

    public function filters(): array
    {
        return [
            $this->examFilter(),
            $this->classFilter(),
            $this->streamFilter(),
            $this->selectFilter('limit', 'Show', [
                ['value' => '10', 'label' => 'Top 10'], ['value' => '20', 'label' => 'Top 20'],
                ['value' => '50', 'label' => 'Top 50'], ['value' => 'all', 'label' => 'Full merit list'],
            ], '10', null),
        ];
    }

    public function run(array $f): array
    {
        $exam = $this->exam($f['exam']);
        if (! $exam) {
            return $this->emptyResult('Select an exam to rank learners.');
        }
        $pct = $this->pctExpr($exam);

        $q = $this->table('exam_marks')
            ->join('students', 'students.id', '=', 'exam_marks.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'exam_marks.school_class_id')
            ->leftJoin('streams', 'streams.id', '=', 'students.stream_id')
            ->where('exam_marks.exam_id', $exam->id)->where('exam_marks.is_absent', false)->whereNotNull('exam_marks.score')
            ->when($f['class'], fn ($q, $v) => $q->where('exam_marks.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('students.stream_id', $v))
            ->groupBy('students.id', 'students.admission_no', 'students.first_name', 'students.middle_name', 'students.last_name', 'school_classes.name', 'streams.name')
            ->orderByRaw("AVG($pct) DESC")->orderByRaw('SUM(exam_marks.points) ASC');

        if ($f['limit'] !== 'all') {
            $q->limit((int) ($f['limit'] ?: 10));
        }

        $scales = $this->scales();
        $rows = [];
        $prev = null;
        $rank = 0;
        foreach ($q->get([
            'students.id', 'students.admission_no', $this->studentName(), $this->classLabel(),
            DB::raw('COUNT(*) as subjects'),
            DB::raw('ROUND(SUM(exam_marks.score), 1) as total'),
            DB::raw("ROUND(AVG($pct), 2) as average"),
            DB::raw('SUM(exam_marks.points) as points'),
        ]) as $i => $r) {
            $r = (array) $r;
            $r['average'] = (float) $r['average'];
            $rank = $prev !== null && $prev === $r['average'] ? $rank : $i + 1;
            $prev = $r['average'];
            $r['rank'] = $rank;
            $r['subjects'] = (int) $r['subjects'];
            $r['grade'] = $this->gradeFor($r['average'], $scales);
            $rows[] = $r;
        }

        $top = $rows[0] ?? null;

        return [
            'columns' => [
                $this->col('rank', 'Pos.', 'number'),
                $this->col('admission_no', 'Adm. No'),
                $this->col('student', 'Student'),
                $this->col('class', 'Class'),
                $this->col('subjects', 'Subjects', 'number'),
                $this->col('total', 'Total marks', 'number'),
                $this->col('average', 'Average %', 'number'),
                $this->col('points', 'Points', 'number'),
                $this->col('grade', 'Grade', 'badge'),
            ],
            'rows' => $rows,
            'summary' => [
                $this->stat('Top learner', $top['student'] ?? '—', 'text', 'warning', 'trophy'),
                $this->stat('Top average', $top['average'] ?? null, 'percent', 'success', 'trending-up'),
                $this->stat('Learners listed', count($rows), 'number', 'primary', 'users'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'horizontal' => true,
                'categories' => array_column(array_slice($rows, 0, 15), 'student'),
                'series' => [['name' => 'Average %', 'data' => array_column(array_slice($rows, 0, 15), 'average')]],
            ] : null,
            'note' => "Exam: {$exam->name}. Ranked by average percentage; ties share a position.",
        ];
    }
}
