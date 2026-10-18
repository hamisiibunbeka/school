<?php

namespace App\Imports;

use App\Models\Department;
use App\Models\Subject;
use Illuminate\Support\Str;

class SubjectImporter extends Importer
{
    private array $existing = [];

    private array $departments = [];

    public static function key(): string
    {
        return 'subjects';
    }

    public function title(): string
    {
        return 'Subjects';
    }

    public function permission(): string
    {
        return 'academics.manage';
    }

    public function columns(): array
    {
        return [
            ['key' => 'name', 'label' => 'Subject Name', 'required' => true, 'example' => 'Biology', 'aliases' => ['name', 'subject']],
            ['key' => 'code', 'label' => 'Code', 'example' => 'BIO'],
            ['key' => 'type', 'label' => 'Type', 'example' => 'core', 'options' => ['core', 'elective'], 'help' => 'core / elective (default core)'],
            ['key' => 'department', 'label' => 'Department', 'example' => 'Sciences'],
        ];
    }

    protected function prepare(): void
    {
        $this->existing = $this->lookup(Subject::all());
        $this->departments = $this->lookup(Department::all());
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['name'], $errors);
        $name = trim($row['name'] ?? '');
        $code = ($row['code'] ?? '') ? Str::upper(trim($row['code'])) : null;

        $departmentId = null;
        if (filled($row['department'] ?? '')) {
            $departmentId = $this->departments[Str::lower($row['department'])] ?? null;
            if (! $departmentId) {
                $errors[] = "Department \"{$row['department']}\" does not exist.";
            }
        }

        $duplicate = null;
        if (isset($this->existing[Str::lower($name)]) || ($code && isset($this->existing[Str::lower($code)]))) {
            $duplicate = 'A subject with this name or code already exists.';
        } elseif ($this->seenBefore('name', $name) || ($code && $this->seenBefore('code', $code))) {
            $duplicate = 'Listed twice in this file.';
        }

        return [$errors, [
            'name' => $name,
            'code' => $code,
            'type' => $this->enum($row['type'] ?? '', ['core', 'elective'], 'Type', $errors, 'core', ['optional' => 'elective', 'compulsory' => 'core']),
            'department_id' => $departmentId,
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        unset($data['__duplicate']);
        Subject::create($data);
    }
}
