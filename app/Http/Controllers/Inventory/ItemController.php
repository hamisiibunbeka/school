<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\ItemCategory;
use App\Models\PurchaseOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ItemController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'category' => '', 'stock' => '', 'status' => ''], $request->only(['search', 'category', 'stock', 'status']));

        $items = InventoryItem::query()
            ->with('category:id,name')
            ->when($filters['category'], fn ($q, $c) => $q->where('item_category_id', $c))
            ->when($filters['stock'] === 'low', fn ($q) => $q->lowStock())
            ->when($filters['stock'] === 'out', fn ($q) => $q->where('quantity', '<=', 0))
            ->when($filters['status'] === 'inactive', fn ($q) => $q->where('is_active', false))
            ->when($filters['status'] === 'active', fn ($q) => $q->where('is_active', true))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%{$s}%")->orWhere('sku', 'like', "%{$s}%")->orWhere('location', 'like', "%{$s}%")))
            ->orderBy('name')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (InventoryItem $i) => [
                'id' => $i->id,
                'name' => $i->name,
                'sku' => $i->sku,
                'unit' => $i->unit,
                'item_category_id' => $i->item_category_id,
                'category' => $i->category?->name,
                'quantity' => (string) $i->quantity,
                'unit_cost' => (string) $i->unit_cost,
                'value' => $i->stockValue(),
                'reorder_level' => (string) $i->reorder_level,
                'location' => $i->location,
                'is_active' => $i->is_active,
                'low' => bccomp((string) $i->quantity, (string) $i->reorder_level, 2) <= 0,
            ]);

        $school = $this->tenancy()->schoolId();
        $byCategory = DB::table('inventory_items')
            ->leftJoin('item_categories', 'item_categories.id', '=', 'inventory_items.item_category_id')
            ->where('inventory_items.school_id', $school)
            ->groupBy('item_categories.name')
            ->selectRaw("COALESCE(item_categories.name, 'Uncategorised') as name, SUM(inventory_items.quantity * inventory_items.unit_cost) as value, COUNT(*) as items")
            ->orderByDesc('value')
            ->get()
            ->map(fn ($r) => ['name' => $r->name, 'value' => round((float) $r->value, 2), 'items' => (int) $r->items]);

        $totalValue = (string) (DB::table('inventory_items')->where('school_id', $school)->selectRaw('COALESCE(SUM(quantity * unit_cost), 0) as v')->value('v') ?? '0');

        return Inertia::render('inventory/items', [
            'items' => $items,
            'filters' => $filters,
            'categories' => ItemCategory::withCount('items')->orderBy('name')->get()->map(fn ($c) => ['value' => $c->id, 'label' => $c->name, 'items_count' => $c->items_count]),
            'byCategory' => $byCategory,
            'units' => ['pcs', 'kg', 'litres', 'bags', 'boxes', 'packets', 'reams', 'bottles', 'cartons', 'pairs', 'sets', 'tins', 'rolls', 'dozens'],
            'stats' => [
                'items' => InventoryItem::where('is_active', true)->count(),
                'value' => $totalValue,
                'low' => InventoryItem::where('is_active', true)->lowStock()->count(),
                'out' => InventoryItem::where('is_active', true)->where('quantity', '<=', 0)->count(),
                'open_pos' => PurchaseOrder::whereIn('status', ['draft', 'approved'])->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $item = InventoryItem::create($this->validated($request) + ['quantity' => 0, 'unit_cost' => 0]);
        $this->audit('created', $item, "Inventory item {$item->name} created", 'inventory');
        $this->toast('Item created. Receive stock through a purchase order or an adjustment.');

        return back();
    }

    public function update(Request $request, InventoryItem $item): RedirectResponse
    {
        $data = $this->validated($request, $item);
        $old = $item->only(array_keys($data));
        $item->update($data);
        $this->audit('updated', $item, "Inventory item {$item->name} updated", 'inventory', $old, $data);
        $this->toast('Item updated.');

        return back();
    }

    public function destroy(InventoryItem $item): RedirectResponse
    {
        if ($item->movements()->exists()) {
            $item->update(['is_active' => false]);
            $this->audit('deactivated', $item, "Inventory item {$item->name} deactivated (has history)", 'inventory');
            $this->toast('Item has stock history, so it was deactivated instead of deleted.', 'info');

            return back();
        }

        $this->audit('deleted', $item, "Inventory item {$item->name} deleted", 'inventory');
        $item->delete();
        $this->toast('Item deleted.');

        return back();
    }

    public function storeCategory(Request $request): RedirectResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:80', Rule::unique('item_categories', 'name')->where('school_id', $this->tenancy()->schoolId())]]);
        ItemCategory::create($data);
        $this->toast('Category added.');

        return back();
    }

    public function updateCategory(Request $request, ItemCategory $category): RedirectResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:80', Rule::unique('item_categories', 'name')->where('school_id', $this->tenancy()->schoolId())->ignore($category->id)]]);
        $category->update($data);
        $this->toast('Category renamed.');

        return back();
    }

    public function destroyCategory(ItemCategory $category): RedirectResponse
    {
        if ($category->items()->exists()) {
            $this->toast('Move or delete the items in this category first.', 'error');

            return back();
        }
        $category->delete();
        $this->toast('Category deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?InventoryItem $item = null): array
    {
        $school = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'sku' => ['nullable', 'string', 'max:40', Rule::unique('inventory_items', 'sku')->where('school_id', $school)->ignore($item?->id)],
            'item_category_id' => ['nullable', Rule::exists('item_categories', 'id')->where('school_id', $school)],
            'unit' => ['required', 'string', 'max:20'],
            'reorder_level' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'location' => ['nullable', 'string', 'max:100'],
            'is_active' => ['boolean'],
        ]);
    }
}
