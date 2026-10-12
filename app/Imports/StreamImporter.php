<?php

namespace App\Imports;

use App\Models\Department;
use App\Models\Employee;
use App\Models\SchoolClass;
use App\Models\Stream;
use App\Models\Subject;
use Illuminate\Support\Str;

class StreamImporter extends Importer
{
    private array $classes = [];

    private array $existing = [];

    private array $teachers = [];

    public static function key(): string
    {
        return 'streams';
    }

    public function title(): string
    {
        return 'Streams';
    }

    public function permission(): string
    {
        return 'academics.manage';
    }

    public function columns(): array
    {
        return [
            ['key' => 'class', 'label' => 'Class', 'required' => true, 'example' => 'Form One', 'help' => 'Existing class name or code.'],
            ['key' => 'name', 'label' => 'Stream Name', 'required' => true, 'example' => 'C', 'aliases' => ['stream', 'name']],
            ['key' => 'class_teacher', 'label' => 'Class Teacher (Employee No)', 'example' => 'EMP-0005', 'aliases' => ['class teacher', 'teacher']],
            ['key' => 'capacity', 'label' => 'Capacity', 'example' => '45'],
        ];
    }

    protected function prepare(): void
    {
        $this->classes = $this->lookup(SchoolClass::all());
        foreach (Stream::all() as $s) {
            $this->existing[$s->school_class_id.'|'.Str::lower($s->name)] = true;
        }
        $this->teachers = Employee::pluck('id', 'employee_no')->mapWithKeys(fn ($id, $no) => [Str::lower($no) => $id])->all();
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['class', 'name'], $errors);
        $classId = filled($row['class'] ?? '') ? ($this->classes[Str::lower($row['class'])] ?? null) : null;
        if (filled($row['class'] ?? '') && ! $classId) {
            $errors[] = "Class \"{$row['class']}\" does not exist.";
        }
        $teacherId = null;
        if (filled($row['class_teacher'] ?? '')) {
            $teacherId = $this->teachers[Str::lower($row['class_teacher'])] ?? null;
            if (! $teacherId) {
                $errors[] = "No employee with number \"{$row['class_teacher']}\".";
            }
        }
        $capacity = $this->number($row['capacity'] ?? '', 'Capacity', $errors, 0);
        $name = Str::upper(trim($row['name'] ?? ''));

        $duplicate = $classId && isset($this->existing[$classId.'|'.Str::lower($name)]) ? "Stream {$name} already exists in {$row['class']}."
            : ($this->seenBefore('stream', ($classId ?? '').'|'.$name) ? 'Listed twice in this file.' : null);

        return [$errors, ['school_class_id' => $classId, 'name' => $name, 'class_teacher_id' => $teacherId, 'capacity' => $capacity !== null ? (int) $capacity : null], $duplicate];
    }

    protected function persist(array $data): void
    {
        unset($data['__duplicate']);
        Stream::create($data);
    }
}
