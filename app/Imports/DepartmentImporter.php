<?php

namespace App\Imports;

use App\Models\Department;
use Illuminate\Support\Str;

class DepartmentImporter extends Importer
{
    private array $existing = [];

    public static function key(): string
    {
        return 'departments';
    }

    public function title(): string
    {
        return 'Departments';
    }

    public function permission(): string
    {
        return 'hr.manage';
    }

    public function columns(): array
    {
        return [
            ['key' => 'name', 'label' => 'Department Name', 'required' => true, 'example' => 'Sciences', 'aliases' => ['name', 'department']],
            ['key' => 'code', 'label' => 'Code', 'example' => 'SCI'],
        ];
    }

    protected function prepare(): void
    {
        $this->existing = $this->lookup(Department::all());
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['name'], $errors);
        $name = trim($row['name'] ?? '');
        $duplicate = isset($this->existing[Str::lower($name)]) ? "Department \"{$name}\" already exists." : ($this->seenBefore('name', $name) ? 'Listed twice in this file.' : null);

        return [$errors, ['name' => $name, 'code' => ($row['code'] ?? '') ? Str::upper($row['code']) : null], $duplicate];
    }

    protected function persist(array $data): void
    {
        Department::create(['name' => $data['name'], 'code' => $data['code']]);
    }
}
