<?php

namespace App\Reports\Operations;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class StockValuation extends Report
{
    public function key(): string
    {
        return 'stock-valuation';
    }

    public function title(): string
    {
        return 'Stock Valuation & Low Stock';
    }

    public function description(): string
    {
        return 'Stock on hand at weighted average cost, with items at or below re-order level.';
    }

    public function category(): string
    {
        return 'operations';
    }

    public function icon(): string
    {
        return 'package';
    }

    public function permissions(): array
    {
        return ['inventory.view'];
    }

    public function filters(): array
    {
        $categories = $this->table('item_categories')->orderBy('name')->get(['id', 'name'])->map(fn ($c) => ['value' => $c->id, 'label' => $c->name])->all();

        return [
            $this->selectFilter('item_category', 'Category', $categories, '', 'All categories'),
            $this->selectFilter('stock', 'Stock level', [['value' => 'low', 'label' => 'At / below re-order level'], ['value' => 'out', 'label' => 'Out of stock'], ['value' => 'ok', 'label' => 'Healthy']], '', 'All items'),
        ];
    }

    public function run(array $f): array
    {
        $rows = $this->rows($this->table('inventory_items')
            ->leftJoin('item_categories', 'item_categories.id', '=', 'inventory_items.item_category_id')
            ->where('inventory_items.is_active', true)
            ->when($f['item_category'], fn ($q, $v) => $q->where('inventory_items.item_category_id', $v))
            ->when($f['stock'] === 'low', fn ($q) => $q->whereColumn('inventory_items.quantity', '<=', 'inventory_items.reorder_level'))
            ->when($f['stock'] === 'out', fn ($q) => $q->where('inventory_items.quantity', '<=', 0))
            ->when($f['stock'] === 'ok', fn ($q) => $q->whereColumn('inventory_items.quantity', '>', 'inventory_items.reorder_level'))
            ->orderBy('item_categories.name')->orderBy('inventory_items.name')
            ->get([
                'inventory_items.sku', 'inventory_items.name', DB::raw("COALESCE(item_categories.name, 'Uncategorised') as category"),
                'inventory_items.unit', 'inventory_items.location', 'inventory_items.quantity', 'inventory_items.reorder_level', 'inventory_items.unit_cost',
                DB::raw('ROUND(inventory_items.quantity * inventory_items.unit_cost, 2) as value'),
                DB::raw("CASE WHEN inventory_items.quantity <= 0 THEN 'out_of_stock' WHEN inventory_items.quantity <= inventory_items.reorder_level THEN 'low' ELSE 'ok' END as level"),
            ]));

        $byCategory = [];
        foreach ($rows as $r) {
            $byCategory[$r['category']] = bcadd($byCategory[$r['category']] ?? '0', (string) $r['value'], 2);
        }
        $value = $this->sum($rows, 'value');

        return [
            'columns' => [
                $this->col('sku', 'SKU'),
                $this->col('name', 'Item'),
                $this->col('category', 'Category'),
                $this->col('location', 'Location'),
                $this->col('unit', 'Unit'),
                $this->col('quantity', 'On hand', 'number'),
                $this->col('reorder_level', 'Re-order level', 'number'),
                $this->col('unit_cost', 'Avg. unit cost', 'money'),
                $this->col('value', 'Stock value', 'money'),
                $this->col('level', 'Level', 'badge'),
            ],
            'rows' => $rows,
            'totals' => ['sku' => 'Total', 'value' => $value],
            'summary' => [
                $this->stat('Stock value', $value, 'money', 'primary', 'package'),
                $this->stat('Items', count($rows), 'number', 'info', 'list'),
                $this->stat('Low stock', count(array_filter($rows, fn ($r) => $r['level'] === 'low')), 'number', 'warning', 'alert-triangle'),
                $this->stat('Out of stock', count(array_filter($rows, fn ($r) => $r['level'] === 'out_of_stock')), 'number', 'danger', 'x'),
            ],
            'chart' => bccomp($value, '0', 2) > 0 ? [
                'type' => 'donut',
                'format' => 'money',
                'labels' => array_keys($byCategory),
                'series' => array_map('floatval', array_values($byCategory)),
            ] : null,
        ];
    }
}
