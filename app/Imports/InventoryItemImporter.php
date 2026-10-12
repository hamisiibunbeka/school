<?php

namespace App\Imports;

use App\Models\InventoryItem;
use App\Models\ItemCategory;
use App\Services\Inventory\StockService;
use Illuminate\Support\Str;

class InventoryItemImporter extends Importer
{
    private array $categories = [];

    private array $existing = [];

    public static function key(): string
    {
        return 'inventory-items';
    }

    public function title(): string
    {
        return 'Inventory Items';
    }

    public function permission(): string
    {
        return 'inventory.manage';
    }

    public function notes(): ?string
    {
        return 'Missing categories are created automatically. An opening quantity is recorded as a stock adjustment at the given unit cost.';
    }

    public function columns(): array
    {
        return [
            ['key' => 'name', 'label' => 'Item Name', 'required' => true, 'example' => 'Exercise books (96 pages)', 'aliases' => ['name', 'item']],
            ['key' => 'sku', 'label' => 'SKU / Code', 'example' => 'STA-EXB96', 'aliases' => ['sku', 'code', 'barcode']],
            ['key' => 'category', 'label' => 'Category', 'example' => 'Stationery'],
            ['key' => 'unit', 'label' => 'Unit', 'example' => 'pcs', 'help' => 'pcs, kg, litres, boxes, reams …'],
            ['key' => 'unit_cost', 'label' => 'Unit Cost', 'example' => '1200'],
            ['key' => 'opening_quantity', 'label' => 'Opening Quantity', 'example' => '500', 'aliases' => ['quantity', 'qty']],
            ['key' => 'reorder_level', 'label' => 'Re-order Level', 'example' => '100'],
            ['key' => 'location', 'label' => 'Location', 'example' => 'Main store'],
        ];
    }

    protected function prepare(): void
    {
        $this->categories = $this->lookup(ItemCategory::all(), ['name']);
        $this->existing = $this->lookup(InventoryItem::all(['id', 'name', 'sku']), ['name', 'sku']);
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['name'], $errors);
        $name = trim($row['name'] ?? '');
        $sku = trim($row['sku'] ?? '');

        $duplicate = null;
        if (isset($this->existing[Str::lower($name)]) || ($sku && isset($this->existing[Str::lower($sku)]))) {
            $duplicate = 'An item with this name or SKU already exists.';
        } elseif ($this->seenBefore('name', $name) || ($sku && $this->seenBefore('sku', $sku))) {
            $duplicate = 'Listed twice in this file.';
        }

        return [$errors, [
            'name' => $name,
            'sku' => $sku ?: null,
            'category' => trim($row['category'] ?? ''),
            'unit' => ($row['unit'] ?? '') ?: 'pcs',
            'unit_cost' => $this->number($row['unit_cost'] ?? '', 'Unit cost', $errors) ?? '0',
            'opening_quantity' => $this->number($row['opening_quantity'] ?? '', 'Opening quantity', $errors) ?? '0',
            'reorder_level' => $this->number($row['reorder_level'] ?? '', 'Re-order level', $errors) ?? '0',
            'location' => ($row['location'] ?? '') ?: null,
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        $categoryId = null;
        if ($data['category'] !== '') {
            $key = Str::lower($data['category']);
            $categoryId = $this->categories[$key] ??= ItemCategory::create(['name' => $data['category']])->id;
        }

        $item = InventoryItem::create([
            'item_category_id' => $categoryId,
            'name' => $data['name'],
            'sku' => $data['sku'],
            'unit' => $data['unit'],
            'unit_cost' => $data['unit_cost'],
            'quantity' => 0,
            'reorder_level' => $data['reorder_level'],
            'location' => $data['location'],
            'is_active' => true,
        ]);

        if (bccomp((string) $data['opening_quantity'], '0', 2) > 0) {
            app(StockService::class)->receive($item, bcadd((string) $data['opening_quantity'], '0', 2), bcadd((string) $data['unit_cost'], '0', 2), [
                'type' => 'adjustment',
                'date' => now()->toDateString(),
                'reference' => 'OPENING',
                'notes' => 'Opening balance (spreadsheet import)',
            ]);
        }
    }
}
