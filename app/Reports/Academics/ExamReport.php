<?php

namespace App\Reports\Academics;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

/** Shared helpers for examination reports. */
abstract class ExamReport extends Report
{
    public function category(): string
    {
        return 'academics';
    }

    public function permissions(): array
    {
        return ['exams.view'];
    }

    /** @return array<string, mixed> */
    protected function examFilter(): array
    {
        $exams = $this->table('exams')
            ->leftJoin('academic_years', 'academic_years.id', '=', 'exams.academic_year_id')
            ->leftJoin('terms', 'terms.id', '=', 'exams.term_id')
            ->orderByDesc('exams.start_date')->orderByDesc('exams.id')
            ->get(['exams.id', 'exams.name', 'exams.status', 'academic_years.name as year', 'terms.name as term']);

        $options = $exams->map(fn ($e) => [
            'value' => $e->id,
            'label' => trim("{$e->name} · ".trim(($e->term ?? '').' '.($e->year ?? ''))).($e->status !== 'published' ? ' ('.str_replace('_', ' ', $e->status).')' : ''),
        ])->all();

        $default = $exams->firstWhere('status', 'published')?->id
            ?? $this->table('exam_marks')->orderByDesc('id')->value('exam_id')
            ?? $exams->first()?->id;

        return $this->selectFilter('exam', 'Exam', $options, (string) ($default ?? ''), 'Select exam', ['required' => true]);
    }

    protected function exam(string $id): ?object
    {
        return $id === '' ? null : $this->table('exams')->where('id', $id)->first();
    }

    /** Grade scale rows ordered high to low. @return array<int, object> */
    protected function scales(): array
    {
        return $this->table('grade_scales')->orderByDesc('min_score')->get(['grade', 'min_score', 'max_score', 'points', 'remark'])->all();
    }

    /** @param array<int, object> $scales */
    protected function gradeFor(?float $pct, array $scales): ?string
    {
        if ($pct === null) {
            return null;
        }
        foreach ($scales as $s) {
            if ($pct >= (float) $s->min_score) {
                return $s->grade;
            }
        }

        return $scales ? end($scales)->grade : null;
    }

    /** SQL expression for a mark as a percentage of the exam's maximum score. */
    protected function pctExpr(object $exam, string $alias = 'exam_marks'): string
    {
        $max = max((float) $exam->max_score, 1);

        return "($alias.score * 100 / $max)";
    }

    /** @return array<string, mixed> */
    protected function emptyResult(string $message): array
    {
        return ['columns' => [], 'rows' => [], 'note' => $message];
    }

    protected function classLabel(): \Illuminate\Contracts\Database\Query\Expression
    {
        return DB::raw("TRIM(CONCAT(COALESCE(school_classes.name, ''), ' ', COALESCE(streams.name, ''))) as class");
    }
}
