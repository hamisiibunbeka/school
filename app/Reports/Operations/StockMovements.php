<?php

namespace App\Reports\Operations;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class StockMovements extends Report
{
    private const TYPES = ['receipt', 'issue', 'adjustment', 'return', 'write_off'];

    public function key(): string
    {
        return 'stock-movements';
    }

    public function title(): string
    {
        return 'Stock Movement Summary';
    }

    public function description(): string
    {
        return 'Quantities received, issued, adjusted and written off per item over a period.';
    }

    public function category(): string
    {
        return 'operations';
    }

    public function icon(): string
    {
        return 'arrow-left-right';
    }

    public function permissions(): array
    {
        return ['inventory.view'];
    }

    public function filters(): array
    {
        $categories = $this->table('item_categories')->orderBy('name')->get(['id', 'name'])->map(fn ($c) => ['value' => $c->id, 'label' => $c->name])->all();

        return [
            ...$this->rangeFilters(now()->startOfMonth()->subMonths(2)->toDateString(), $this->today()),
            $this->selectFilter('item_category', 'Category', $categories, '', 'All categories'),
            $this->selectFilter('type', 'Movement', $this->enum(self::TYPES), '', 'All movements'),
        ];
    }

    public function run(array $f): array
    {
        $q = $this->table('stock_movements')
            ->join('inventory_items', 'inventory_items.id', '=', 'stock_movements.inventory_item_id')
            ->leftJoin('item_categories', 'item_categories.id', '=', 'inventory_items.item_category_id')
            ->when($f['item_category'], fn ($q, $v) => $q->where('inventory_items.item_category_id', $v))
            ->when($f['type'], fn ($q, $v) => $q->where('stock_movements.type', $v));
        $this->dateRange($q, 'stock_movements.date', $f);

        $select = [
            'inventory_items.name', 'inventory_items.unit', DB::raw("COALESCE(item_categories.name, 'Uncategorised') as category"),
            DB::raw('COUNT(*) as movements'),
        ];
        foreach (self::TYPES as $t) {
            $select[] = DB::raw("COALESCE(SUM(CASE WHEN stock_movements.type = '$t' THEN stock_movements.quantity END), 0) as q_$t");
        }
        $select[] = DB::raw('SUM(stock_movements.quantity) as net');
        $select[] = DB::raw("ROUND(COALESCE(SUM(CASE WHEN stock_movements.quantity < 0 THEN -stock_movements.quantity * stock_movements.unit_cost END), 0), 2) as value_out");
        $select[] = DB::raw("ROUND(COALESCE(SUM(CASE WHEN stock_movements.quantity > 0 THEN stock_movements.quantity * stock_movements.unit_cost END), 0), 2) as value_in");
        $select[] = 'inventory_items.quantity as on_hand';

        $rows = $this->rows($q->groupBy('inventory_items.id', 'inventory_items.name', 'inventory_items.unit', 'inventory_items.quantity', 'item_categories.name')
            ->orderBy('item_categories.name')->orderBy('inventory_items.name')->get($select));

        foreach ($rows as &$r) {
            $r['movements'] = (int) $r['movements'];
        }
        unset($r);

        $totals = ['name' => 'Total', 'movements' => $this->count($rows, 'movements'), 'value_in' => $this->sum($rows, 'value_in'), 'value_out' => $this->sum($rows, 'value_out')];
        $typeTotals = [];
        foreach (self::TYPES as $t) {
            $typeTotals[$t] = abs((float) $this->sum($rows, "q_$t"));
        }

        return [
            'columns' => [
                $this->col('name', 'Item'),
                $this->col('category', 'Category'),
                $this->col('unit', 'Unit'),
                $this->col('movements', 'Movements', 'number'),
                ...array_map(fn ($t) => $this->col("q_$t", ucwords(str_replace('_', ' ', $t)), 'number'), self::TYPES),
                $this->col('net', 'Net change', 'number'),
                $this->col('on_hand', 'On hand now', 'number'),
                $this->col('value_in', 'Value in', 'money'),
                $this->col('value_out', 'Value out', 'money'),
            ],
            'rows' => $rows,
            'totals' => $totals,
            'summary' => [
                $this->stat('Value received', $totals['value_in'], 'money', 'success', 'arrow-down'),
                $this->stat('Value issued / out', $totals['value_out'], 'money', 'danger', 'arrow-up'),
                $this->stat('Movements', $totals['movements'], 'number', 'primary', 'arrow-left-right'),
                $this->stat('Items moved', count($rows), 'number', 'info', 'package'),
            ],
            'chart' => $rows ? [
                'type' => 'bar',
                'categories' => array_map(fn ($t) => ucwords(str_replace('_', ' ', $t)), self::TYPES),
                'series' => [['name' => 'Quantity', 'data' => array_values($typeTotals)]],
            ] : null,
            'note' => 'Quantities are signed: positive = into stock, negative = out of stock.',
        ];
    }
}
