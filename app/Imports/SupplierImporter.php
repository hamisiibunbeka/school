<?php

namespace App\Imports;

use App\Models\Supplier;
use Illuminate\Support\Str;

class SupplierImporter extends Importer
{
    private array $existing = [];

    public static function key(): string
    {
        return 'suppliers';
    }

    public function title(): string
    {
        return 'Suppliers';
    }

    public function permission(): string
    {
        return 'inventory.manage';
    }

    public function columns(): array
    {
        return [
            ['key' => 'name', 'label' => 'Supplier Name', 'required' => true, 'example' => 'Kariakoo Stationers Ltd', 'aliases' => ['name', 'supplier']],
            ['key' => 'contact_person', 'label' => 'Contact Person', 'example' => 'Juma Ally'],
            ['key' => 'phone', 'label' => 'Phone', 'example' => '+255716000333'],
            ['key' => 'email', 'label' => 'Email', 'example' => 'sales@kariakoostationers.co.tz'],
            ['key' => 'address', 'label' => 'Address', 'example' => 'Kariakoo, Dar es Salaam'],
            ['key' => 'tin', 'label' => 'TIN', 'example' => '111-222-333'],
        ];
    }

    protected function prepare(): void
    {
        $this->existing = $this->lookup(Supplier::all(['id', 'name', 'tin']), ['name', 'tin']);
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['name'], $errors);
        if (filled($row['email'] ?? '') && ! filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Email is not valid.';
        }
        $name = trim($row['name'] ?? '');
        $tin = trim($row['tin'] ?? '');

        $duplicate = isset($this->existing[Str::lower($name)]) || ($tin && isset($this->existing[Str::lower($tin)])) ? 'A supplier with this name or TIN already exists.'
            : ($this->seenBefore('name', $name) ? 'Listed twice in this file.' : null);

        return [$errors, [
            'name' => $name,
            'contact_person' => ($row['contact_person'] ?? '') ?: null,
            'phone' => ($row['phone'] ?? '') ?: null,
            'email' => ($row['email'] ?? '') ? Str::lower($row['email']) : null,
            'address' => ($row['address'] ?? '') ?: null,
            'tin' => $tin ?: null,
            'is_active' => true,
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        unset($data['__duplicate']);
        Supplier::create($data);
    }
}
