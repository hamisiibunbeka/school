<?php

namespace App\Reports\Academics;

use Illuminate\Support\Facades\DB;

class GradeDistribution extends ExamReport
{
    public function key(): string
    {
        return 'grade-distribution';
    }

    public function title(): string
    {
        return 'Grade Distribution per Exam';
    }

    public function description(): string
    {
        return 'Number of learners achieving each grade, per subject, for an exam.';
    }

    public function icon(): string
    {
        return 'pie-chart';
    }

    public function filters(): array
    {
        return [
            $this->examFilter(),
            $this->classFilter(),
            $this->streamFilter(),
        ];
    }

    public function run(array $f): array
    {
        $exam = $this->exam($f['exam']);
        if (! $exam) {
            return $this->emptyResult('Select an exam to analyse.');
        }

        $data = $this->table('exam_marks')
            ->join('subjects', 'subjects.id', '=', 'exam_marks.subject_id')
            ->join('students', 'students.id', '=', 'exam_marks.student_id')
            ->where('exam_marks.exam_id', $exam->id)
            ->where('exam_marks.is_absent', false)->whereNotNull('exam_marks.grade')
            ->when($f['class'], fn ($q, $v) => $q->where('exam_marks.school_class_id', $v))
            ->when($f['stream'], fn ($q, $v) => $q->where('students.stream_id', $v))
            ->groupBy('subjects.id', 'subjects.name', 'exam_marks.grade')
            ->orderBy('subjects.name')
            ->get(['subjects.id', 'subjects.name as subject', 'exam_marks.grade', DB::raw('COUNT(*) as total')]);

        $grades = array_map(fn ($s) => $s->grade, $this->scales());
        foreach ($data->pluck('grade')->unique() as $g) {
            if (! in_array($g, $grades, true)) {
                $grades[] = $g;
            }
        }

        $rows = [];
        foreach ($data->groupBy('id') as $items) {
            $row = ['subject' => $items->first()->subject, 'total' => 0];
            foreach ($grades as $g) {
                $row['g_'.$g] = 0;
            }
            foreach ($items as $i) {
                $row['g_'.$i->grade] = (int) $i->total;
                $row['total'] += (int) $i->total;
            }
            $rows[] = $row;
        }

        $totals = ['subject' => 'All subjects', 'total' => $this->count($rows, 'total')];
        foreach ($grades as $g) {
            $totals['g_'.$g] = $this->count($rows, 'g_'.$g);
        }
        $top = $grades[0] ?? null;

        return [
            'columns' => [
                $this->col('subject', 'Subject'),
                ...array_map(fn ($g) => $this->col('g_'.$g, $g, 'number'), $grades),
                $this->col('total', 'Total', 'number'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Grades awarded', $totals['total'], 'number', 'primary', 'award'),
                $this->stat($top ? "Grade $top" : 'Top grade', $top ? $totals['g_'.$top] : 0, 'number', 'success', 'star'),
                $this->stat('Subjects', count($rows), 'number', 'info', 'book-open'),
            ],
            'chart' => $totals['total'] ? [
                'type' => 'donut',
                'labels' => array_map(fn ($g) => "Grade $g", $grades),
                'series' => array_map(fn ($g) => $totals['g_'.$g], $grades),
            ] : null,
            'note' => "Exam: {$exam->name}.",
        ];
    }
}
