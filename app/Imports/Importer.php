<?php

namespace App\Imports;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Base class for spreadsheet imports (SRS 4.2 / 14): template columns,
 * header matching, per-row validation with Excel row numbers, duplicate
 * detection, preview (dry run) and an all-or-nothing commit.
 *
 * Subclasses define columns() and implement validateRow() / persist().
 */
abstract class Importer
{
    /** Values seen earlier in the same file, for in-file duplicate detection. */
    protected array $seen = [];

    abstract public static function key(): string;

    abstract public function title(): string;

    /** Permission required to import (e.g. "students.manage"). */
    abstract public function permission(): string;

    /**
     * @return array<int, array{key: string, label: string, required?: bool, example?: string, help?: string, options?: array<int,string>, width?: int, aliases?: array<int,string>}>
     */
    abstract public function columns(): array;

    /**
     * Validate & normalise one row. Return [errors, data, duplicateMessage|null].
     *
     * @param  array<string, string>  $row  values keyed by column key
     * @return array{0: array<int,string>, 1: array<string,mixed>, 2: string|null}
     */
    abstract protected function validateRow(array $row): array;

    /** Save one validated row. Runs inside the import transaction. */
    abstract protected function persist(array $data): void;

    /** Called once before validating rows (load lookups here). */
    protected function prepare(): void {}

    /** Optional extra explanation shown above the preview. */
    public function notes(): ?string
    {
        return null;
    }

    /* ------------------------------------------------------------------ */

    /**
     * Turn raw sheet rows into keyed rows and validate each.
     *
     * @param  array<int, array<int, string>>  $sheet
     * @return array{columns: array, rows: array<int, array{line:int, values: array<string,string>, data: array<string,mixed>, errors: array<int,string>, duplicate: ?string, status: string}>, unknown_headers: array<int,string>, missing_required: array<int,string>}
     */
    public function preview(array $sheet): array
    {
        $this->prepare();
        $this->seen = [];

        // Find the header row (first non-empty row).
        $headerIndex = null;
        foreach ($sheet as $i => $r) {
            if (array_filter($r, fn ($v) => trim((string) $v) !== '')) {
                $headerIndex = $i;
                break;
            }
        }
        if ($headerIndex === null) {
            return ['columns' => $this->columns(), 'rows' => [], 'unknown_headers' => [], 'missing_required' => array_column(array_filter($this->columns(), fn ($c) => $c['required'] ?? false), 'label')];
        }

        [$map, $unknown] = $this->mapHeaders($sheet[$headerIndex]);
        $missing = [];
        foreach ($this->columns() as $col) {
            if (($col['required'] ?? false) && ! in_array($col['key'], $map, true)) {
                $missing[] = $col['label'];
            }
        }

        $rows = [];
        foreach (array_slice($sheet, $headerIndex + 1, null, true) as $i => $raw) {
            $values = [];
            foreach ($map as $index => $key) {
                $values[$key] = trim((string) ($raw[$index] ?? ''));
            }
            if (! array_filter($values, fn ($v) => $v !== '')) {
                continue; // blank row
            }

            try {
                [$errors, $data, $duplicate] = $this->validateRow($values);
            } catch (Throwable $e) {
                [$errors, $data, $duplicate] = [[$e->getMessage()], [], null];
            }

            $rows[] = [
                'line' => $i + 1, // Excel row number
                'values' => $values,
                'data' => $data,
                'errors' => array_values($errors),
                'duplicate' => $duplicate,
                'status' => $errors ? 'invalid' : ($duplicate ? 'duplicate' : 'valid'),
            ];

            if (count($rows) >= Spreadsheet::MAX_ROWS) {
                break;
            }
        }

        return ['columns' => $this->columns(), 'rows' => $rows, 'unknown_headers' => $unknown, 'missing_required' => $missing];
    }

    /**
     * Import the valid rows (and duplicates only when $includeDuplicates, for importers that upsert).
     *
     * @param  array<int, array<string, mixed>>  $rows  preview rows
     * @return array{imported: int, skipped: int}
     */
    public function commit(array $rows, bool $includeDuplicates = false): array
    {
        $this->prepare();
        $imported = 0;

        DB::transaction(function () use ($rows, $includeDuplicates, &$imported) {
            foreach ($rows as $row) {
                if ($row['status'] === 'valid' || ($includeDuplicates && $row['status'] === 'duplicate' && $this->canUpdateDuplicates())) {
                    $this->persist($row['data'] + ['__duplicate' => $row['status'] === 'duplicate']);
                    $imported++;
                }
            }
        });

        return ['imported' => $imported, 'skipped' => count($rows) - $imported];
    }

    /** Whether "update existing records" is offered for duplicates. */
    public function canUpdateDuplicates(): bool
    {
        return false;
    }

    /** @return array{0: array<int,string>, 1: array<int,string>} index => column key, unknown headers */
    protected function mapHeaders(array $headers): array
    {
        $lookup = [];
        foreach ($this->columns() as $col) {
            foreach (array_merge([$col['key'], $col['label']], $col['aliases'] ?? []) as $name) {
                $lookup[$this->norm($name)] = $col['key'];
            }
        }

        $map = [];
        $unknown = [];
        foreach ($headers as $i => $header) {
            $h = $this->norm((string) $header);
            if ($h === '') {
                continue;
            }
            if (isset($lookup[$h]) && ! in_array($lookup[$h], $map, true)) {
                $map[$i] = $lookup[$h];
            } else {
                $unknown[] = (string) $header;
            }
        }

        return [$map, $unknown];
    }

    protected function norm(string $value): string
    {
        return Str::of($value)->lower()->replace(['*', '(', ')', '.'], '')->replace(['-', '/'], ' ')->squish()->replace(' ', '_')->toString();
    }

    /* ------------------------------ helpers ------------------------------ */

    /** Excel serial, dd/mm/yyyy, d-m-yyyy, yyyy-mm-dd … → "Y-m-d" (null if blank). Adds an error if invalid. */
    protected function date(?string $value, string $label, array &$errors, bool $past = false): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        $date = null;
        if (is_numeric($value) && (float) $value > 1000 && (float) $value < 80000) {
            // Excel serial date (1900 system).
            $date = CarbonImmutable::create(1899, 12, 30)->addDays((int) floor((float) $value));
        } elseif (preg_match('#^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$#', $value, $m)) {
            $year = strlen($m[3]) === 2 ? 2000 + (int) $m[3] : (int) $m[3];
            if (checkdate((int) $m[2], (int) $m[1], $year)) {
                $date = CarbonImmutable::create($year, (int) $m[2], (int) $m[1]);
            }
        } elseif (preg_match('#^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})#', $value, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            $date = CarbonImmutable::create((int) $m[1], (int) $m[2], (int) $m[3]);
        }

        if (! $date) {
            $errors[] = "{$label} \"{$value}\" is not a valid date (use dd/mm/yyyy).";

            return null;
        }
        if ($past && $date->isFuture()) {
            $errors[] = "{$label} cannot be in the future.";
        }

        return $date->toDateString();
    }

    /** Match a value against allowed options (case-insensitive, with aliases). */
    protected function enum(?string $value, array $options, string $label, array &$errors, ?string $default = null, array $aliases = []): ?string
    {
        $v = Str::lower(trim((string) $value));
        if ($v === '') {
            return $default;
        }
        if (isset($aliases[$v])) {
            return $aliases[$v];
        }
        foreach ($options as $option) {
            if ($v === Str::lower($option) || $v === Str::lower(str_replace('_', ' ', $option))) {
                return $option;
            }
        }
        $errors[] = "{$label} \"{$value}\" must be one of: ".implode(', ', $options).'.';

        return $default;
    }

    protected function number(?string $value, string $label, array &$errors, ?float $min = 0): ?string
    {
        $v = str_replace([',', ' '], '', trim((string) $value));
        if ($v === '') {
            return null;
        }
        if (! is_numeric($v) || ($min !== null && (float) $v < $min)) {
            $errors[] = "{$label} \"{$value}\" must be a number".($min !== null ? " ≥ {$min}" : '').'.';

            return null;
        }

        return $v;
    }

    protected function required(array $row, array $keys, array &$errors): void
    {
        $labels = array_column($this->columns(), 'label', 'key');
        foreach ($keys as $key) {
            if (trim((string) ($row[$key] ?? '')) === '') {
                $errors[] = ($labels[$key] ?? $key).' is required.';
            }
        }
    }

    /** Remember a value to flag later rows in the same file with the same value. */
    protected function seenBefore(string $bucket, ?string $value): bool
    {
        $v = Str::lower(trim((string) $value));
        if ($v === '') {
            return false;
        }
        if (isset($this->seen[$bucket][$v])) {
            return true;
        }
        $this->seen[$bucket][$v] = true;

        return false;
    }

    /**
     * Case-insensitive name/code lookup map from a model collection.
     *
     * @return array<string, int>
     */
    protected function lookup(iterable $models, array $fields = ['name', 'code']): array
    {
        $map = [];
        foreach ($models as $m) {
            foreach ($fields as $f) {
                if (filled($m->{$f})) {
                    $map[Str::lower(trim((string) $m->{$f}))] = $m->id;
                }
            }
        }

        return $map;
    }

    /** Template example row + instructions. */
    public function template(): array
    {
        $columns = $this->columns();
        $example = array_map(fn ($c) => $c['example'] ?? '', $columns);

        $instructions = [['Column', 'Required', 'Description / format', 'Allowed values']];
        foreach ($columns as $c) {
            $instructions[] = [$c['label'], ($c['required'] ?? false) ? 'Yes' : 'No', $c['help'] ?? '', implode(', ', $c['options'] ?? [])];
        }
        $instructions[] = ['', '', '', ''];
        $instructions[] = ['Tips', '', 'Keep the header row. Dates as dd/mm/yyyy. Delete the example row before importing. Max '.Spreadsheet::MAX_ROWS.' rows per file.', ''];

        return [$columns, [$example], $instructions];
    }
}
