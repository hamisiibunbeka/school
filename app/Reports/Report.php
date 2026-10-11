<?php

namespace App\Reports;

use App\Models\AcademicYear;
use App\Models\Term;
use App\Models\User;
use App\Support\Lookups;
use App\Support\Tenancy;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Base class for every standard report (SRS 4.23).
 *
 * A report declares its metadata, the filters it accepts and a run() method
 * returning a uniform result shape the generic viewer / CSV exporter renders:
 *
 *   [
 *     'columns' => [['key','label','type' => text|money|number|percent|date|badge, 'align'?]],
 *     'rows'    => [[key => value, ...], ...],
 *     'totals'  => [key => value] | null,
 *     'summary' => [['label','value','format' => money|number|percent|text,'tone','icon']] | null,
 *     'chart'   => ['type','categories'?,'series','labels'?,'format'?,'stacked'?,'horizontal'?] | null,
 *     'note'    => string | null,
 *   ]
 *
 * All queries go through DB::table() scoped by school_id so a report works even
 * when a module's Eloquent models are absent, and returns empty results for
 * modules that hold no data yet.
 */
abstract class Report
{
    abstract public function key(): string;

    abstract public function title(): string;

    abstract public function description(): string;

    /** Catalogue category key, see ReportRegistry::CATEGORIES. */
    abstract public function category(): string;

    /** Module permissions required in addition to reports.view. @return array<int,string> */
    abstract public function permissions(): array;

    /** @param  array<string, string>  $filters */
    abstract public function run(array $filters): array;

    /** lucide-react icon name used on the catalogue card. */
    public function icon(): string
    {
        return 'file-text';
    }

    /** Filter definitions. @return array<int, array<string, mixed>> */
    public function filters(): array
    {
        return [];
    }

    public function authorize(User $user): bool
    {
        foreach (['reports.view', ...$this->permissions()] as $permission) {
            if (! $user->can($permission)) {
                return false;
            }
        }

        return true;
    }

    /** @return array<string, mixed> */
    public function meta(): array
    {
        return [
            'key' => $this->key(),
            'title' => $this->title(),
            'description' => $this->description(),
            'category' => $this->category(),
            'icon' => $this->icon(),
            'href' => '/reports/'.$this->key(),
        ];
    }

    /**
     * Merge request input with defaults and sanitise every value by type.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, string>
     */
    public function resolveFilters(array $input): array
    {
        $values = [];
        foreach ($this->filters() as $def) {
            $key = $def['key'];
            $default = (string) ($def['default'] ?? '');
            $raw = array_key_exists($key, $input) && ! is_array($input[$key]) ? trim((string) $input[$key]) : $default;

            $values[$key] = match ($def['type']) {
                'date' => $raw === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw) ? $raw : $default,
                'number' => $raw === '' || is_numeric($raw) ? $raw : $default,
                'select' => $raw === '' || $this->optionExists($def['options'] ?? [], $raw) ? $raw : $default,
                default => mb_substr($raw, 0, 100),
            };

            if (($def['required'] ?? false) && $values[$key] === '') {
                $values[$key] = $default;
            }
        }

        // Keep date ranges in order.
        if (($values['from'] ?? '') !== '' && ($values['to'] ?? '') !== '' && $values['from'] > $values['to']) {
            [$values['from'], $values['to']] = [$values['to'], $values['from']];
        }

        return $values;
    }

    /**
     * Human readable list of the filters that were applied.
     *
     * @param  array<string, string>  $values
     * @return array<int, array{label:string, value:string}>
     */
    public function describeFilters(array $values): array
    {
        $out = [];
        foreach ($this->filters() as $def) {
            $value = $values[$def['key']] ?? '';
            if ($value === '' || in_array($def['key'], ['from', 'to', 'date', 'as_of'], true)) {
                continue;
            }
            $display = match ($def['type']) {
                'date' => Carbon::parse($value)->format('d M Y'),
                'select' => collect($def['options'] ?? [])->first(fn ($o) => (string) $o['value'] === $value)['label'] ?? $value,
                default => $value,
            };
            $out[] = ['label' => $def['label'], 'value' => (string) $display];
        }

        return $out;
    }

    /** Reporting period label for the metadata block. @param array<string,string> $values */
    public function period(array $values): string
    {
        $fmt = fn (string $d) => Carbon::parse($d)->format('d M Y');
        $from = $values['from'] ?? '';
        $to = $values['to'] ?? '';

        if ($from !== '' || $to !== '') {
            return ($from !== '' ? $fmt($from) : 'Beginning').' – '.($to !== '' ? $fmt($to) : 'Today');
        }
        foreach (['date', 'as_of'] as $k) {
            if (($values[$k] ?? '') !== '') {
                return ($k === 'as_of' ? 'As at ' : '').$fmt($values[$k]);
            }
        }

        return 'As at '.now()->format('d M Y');
    }

    // ------------------------------------------------------------------
    // Query helpers
    // ------------------------------------------------------------------

    protected function schoolId(): ?int
    {
        return app(Tenancy::class)->schoolId();
    }

    /** School-scoped query builder; pass "table as alias" to alias. */
    protected function table(string $table): Builder
    {
        $alias = str_contains($table, ' as ') ? trim(explode(' as ', $table)[1]) : $table;

        return DB::table($table)->where("$alias.school_id", $this->schoolId());
    }

    /** Apply a whereBetween/whereDate range on a date column. */
    protected function dateRange(Builder $q, string $column, array $f): Builder
    {
        if (($f['from'] ?? '') !== '') {
            $q->whereDate($column, '>=', $f['from']);
        }
        if (($f['to'] ?? '') !== '') {
            $q->whereDate($column, '<=', $f['to']);
        }

        return $q;
    }

    /** SQL for a student's display name. */
    protected function studentName(string $alias = 'students'): \Illuminate\Contracts\Database\Query\Expression
    {
        return DB::raw("TRIM(CONCAT($alias.first_name, ' ', COALESCE(CONCAT($alias.middle_name, ' '), ''), $alias.last_name)) as student");
    }

    /** Convert query results (stdClass) into plain arrays. @return array<int, array<string,mixed>> */
    protected function rows(iterable $results): array
    {
        $rows = [];
        foreach ($results as $r) {
            $rows[] = (array) $r;
        }

        return $rows;
    }

    /** Sum a money column with bcmath. @param array<int, array<string,mixed>> $rows */
    protected function sum(array $rows, string $key, int $scale = 2): string
    {
        $total = '0';
        foreach ($rows as $row) {
            $total = bcadd($total, (string) ($row[$key] ?? '0') ?: '0', $scale);
        }

        return $total;
    }

    /** Integer sum. @param array<int, array<string,mixed>> $rows */
    protected function count(array $rows, string $key): int
    {
        return (int) array_sum(array_map(fn ($r) => (int) ($r[$key] ?? 0), $rows));
    }

    protected function pct(float|int|string $part, float|int|string $whole, int $decimals = 1): ?float
    {
        return (float) $whole > 0 ? round(100 * (float) $part / (float) $whole, $decimals) : null;
    }

    // ------------------------------------------------------------------
    // Column / summary helpers
    // ------------------------------------------------------------------

    /** @return array<string, string> */
    protected function col(string $key, string $label, string $type = 'text'): array
    {
        return ['key' => $key, 'label' => $label, 'type' => $type];
    }

    /** @return array<string, mixed> */
    protected function stat(string $label, mixed $value, string $format = 'number', string $tone = 'primary', string $icon = 'bar-chart'): array
    {
        return compact('label', 'value', 'format', 'tone', 'icon');
    }

    // ------------------------------------------------------------------
    // Filter definition helpers
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    protected function dateFilter(string $key, string $label, ?string $default = ''): array
    {
        return ['key' => $key, 'label' => $label, 'type' => 'date', 'default' => $default ?? ''];
    }

    /** @return array<int, array<string, mixed>> */
    protected function rangeFilters(?string $from = '', ?string $to = ''): array
    {
        return [$this->dateFilter('from', 'From', $from), $this->dateFilter('to', 'To', $to)];
    }

    /**
     * @param  array<int, array<string, mixed>>  $options
     * @return array<string, mixed>
     */
    protected function selectFilter(string $key, string $label, array $options, string $default = '', ?string $placeholder = 'All', array $extra = []): array
    {
        return ['key' => $key, 'label' => $label, 'type' => 'select', 'options' => array_values($options), 'default' => $default, 'placeholder' => $placeholder, ...$extra];
    }

    /** @return array<string, mixed> */
    protected function numberFilter(string $key, string $label, string $default = '', array $extra = []): array
    {
        return ['key' => $key, 'label' => $label, 'type' => 'number', 'default' => $default, ...$extra];
    }

    /** @return array<string, mixed> */
    protected function classFilter(string $placeholder = 'All classes'): array
    {
        $options = array_map(fn ($c) => ['value' => $c['value'], 'label' => $c['label']], Lookups::classes());

        return $this->selectFilter('class', 'Class', $options, '', $placeholder);
    }

    /** Stream options carry a `parent` so the viewer narrows them to the chosen class. @return array<string, mixed> */
    protected function streamFilter(): array
    {
        $options = array_map(fn ($s) => ['value' => $s['value'], 'label' => $s['label'], 'parent' => $s['school_class_id']], Lookups::streams());

        return $this->selectFilter('stream', 'Stream', $options, '', 'All streams', ['dependsOn' => 'class']);
    }

    /** @return array<string, mixed> */
    protected function termFilter(bool $defaultCurrent = true, string $placeholder = 'All terms'): array
    {
        $options = array_map(fn ($t) => ['value' => $t['value'], 'label' => $t['label']], Lookups::terms());

        return $this->selectFilter('term', 'Term', $options, $defaultCurrent ? (string) (Term::current()?->id ?? '') : '', $placeholder);
    }

    /** @return array<string, mixed> */
    protected function yearFilter(bool $defaultCurrent = true, string $placeholder = 'All years'): array
    {
        $options = array_map(fn ($y) => ['value' => $y['value'], 'label' => $y['label']], Lookups::academicYears());

        return $this->selectFilter('year', 'Academic year', $options, $defaultCurrent ? (string) (AcademicYear::current()?->id ?? '') : '', $placeholder);
    }

    /** @return array<string, mixed> */
    protected function departmentFilter(): array
    {
        return $this->selectFilter('department', 'Department', Lookups::departments(), '', 'All departments');
    }

    /** @param array<int,string> $values @return array<int, array{value:string,label:string}> */
    protected function enum(array $values): array
    {
        return Lookups::enum($values);
    }

    /** Start of the current term (or Jan 1st) for period defaults. */
    protected function termStart(): string
    {
        $term = Term::current();

        return $term ? Carbon::parse($term->start_date)->toDateString() : now()->startOfYear()->toDateString();
    }

    protected function today(): string
    {
        return now()->toDateString();
    }

    /** @param array<int, array<string,mixed>> $options */
    private function optionExists(array $options, string $value): bool
    {
        foreach ($options as $o) {
            if ((string) $o['value'] === $value) {
                return true;
            }
        }

        return false;
    }
}
