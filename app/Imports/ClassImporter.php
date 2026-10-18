<?php

namespace App\Imports;

use App\Models\SchoolClass;
use App\Models\Stream;
use Illuminate\Support\Str;

class ClassImporter extends Importer
{
    private array $existing = [];

    private int $nextLevel = 1;

    public static function key(): string
    {
        return 'classes';
    }

    public function title(): string
    {
        return 'Classes';
    }

    public function permission(): string
    {
        return 'academics.manage';
    }

    public function columns(): array
    {
        return [
            ['key' => 'name', 'label' => 'Class Name', 'required' => true, 'example' => 'Form Five', 'aliases' => ['name', 'class']],
            ['key' => 'code', 'label' => 'Code', 'example' => 'F5'],
            ['key' => 'level', 'label' => 'Level', 'example' => '5', 'help' => 'Promotion order (1 = lowest). Blank = after the last class.'],
            ['key' => 'capacity', 'label' => 'Capacity', 'example' => '90'],
            ['key' => 'streams', 'label' => 'Streams', 'example' => 'A, B', 'help' => 'Optional comma-separated stream names to create.'],
        ];
    }

    protected function prepare(): void
    {
        $this->existing = $this->lookup(SchoolClass::all());
        $this->nextLevel = (int) SchoolClass::max('level') + 1;
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['name'], $errors);
        $name = trim($row['name'] ?? '');
        $level = $this->number($row['level'] ?? '', 'Level', $errors, 1);
        $capacity = $this->number($row['capacity'] ?? '', 'Capacity', $errors, 0);

        $duplicate = isset($this->existing[Str::lower($name)]) ? "Class \"{$name}\" already exists." : ($this->seenBefore('name', $name) ? 'Listed twice in this file.' : null);

        return [$errors, [
            'name' => $name,
            'code' => ($row['code'] ?? '') ? Str::upper($row['code']) : null,
            'level' => $level !== null ? (int) $level : null,
            'capacity' => $capacity !== null ? (int) $capacity : null,
            'streams' => array_values(array_filter(array_map('trim', explode(',', $row['streams'] ?? '')))),
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        $class = SchoolClass::create([
            'name' => $data['name'], 'code' => $data['code'], 'capacity' => $data['capacity'],
            'level' => $data['level'] ?? $this->nextLevel++,
        ]);
        foreach ($data['streams'] as $stream) {
            Stream::create(['school_class_id' => $class->id, 'name' => Str::upper($stream)]);
        }
    }
}
