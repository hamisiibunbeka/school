<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\StockMovement;
use App\Services\Inventory\StockService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Stock movement ledger + issue / adjustment / return / write-off forms (SRS 4.15). */
class MovementController extends Controller
{
    public const DESTINATIONS = ['Kitchen', 'Boarding', 'Science Lab', 'Form One', 'Form Two', 'Form Three', 'Form Four', 'Administration', 'Sports', 'Maintenance', 'Transport', 'Clinic', 'Events'];

    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'item' => '', 'type' => '', 'from' => '', 'to' => ''], $request->only(['search', 'item', 'type', 'from', 'to']));

        $query = StockMovement::query()
            ->when($filters['item'], fn ($q, $i) => $q->where('inventory_item_id', $i))
            ->when($filters['type'], fn ($q, $t) => $q->where('type', $t))
            ->when($filters['from'], fn ($q, $d) => $q->whereDate('date', '>=', $d))
            ->when($filters['to'], fn ($q, $d) => $q->whereDate('date', '<=', $d))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('reference', 'like', "%{$s}%")->orWhere('issued_to', 'like', "%{$s}%")->orWhere('notes', 'like', "%{$s}%")
                ->orWhereHas('item', fn ($i) => $i->where('name', 'like', "%{$s}%")->orWhere('sku', 'like', "%{$s}%"))));

        $movements = (clone $query)
            ->with(['item:id,name,sku,unit', 'user:id,name', 'purchaseOrder:id,po_no'])
            ->orderByDesc('date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (StockMovement $m) => [
                'id' => $m->id,
                'date' => $m->date?->toDateString(),
                'item_id' => $m->inventory_item_id,
                'item' => $m->item?->name,
                'sku' => $m->item?->sku,
                'unit' => $m->item?->unit,
                'type' => $m->type,
                'quantity' => (string) $m->quantity,
                'unit_cost' => (string) $m->unit_cost,
                'value' => bcmul((string) $m->quantity, (string) $m->unit_cost, 2),
                'balance_after' => (string) $m->balance_after,
                'reference' => $m->reference,
                'purchase_order_id' => $m->purchase_order_id,
                'issued_to' => $m->issued_to,
                'notes' => $m->notes,
                'user' => $m->user?->name,
            ]);

        $school = $this->tenancy()->schoolId();
        $monthStart = now()->startOfMonth()->toDateString();
        $sumValue = fn (array $types, bool $outflow) => (string) (DB::table('stock_movements')->where('school_id', $school)->whereIn('type', $types)->where('date', '>=', $monthStart)
            ->where('quantity', $outflow ? '<' : '>', 0)->selectRaw('COALESCE(SUM(ABS(quantity) * unit_cost), 0) as v')->value('v') ?? '0');

        $byDestination = DB::table('stock_movements')
            ->where('school_id', $school)->where('type', 'issue')->where('date', '>=', now()->subDays(90)->toDateString())
            ->groupBy('issued_to')
            ->selectRaw("COALESCE(issued_to, 'Unspecified') as name, SUM(ABS(quantity) * unit_cost) as value")
            ->orderByDesc('value')->limit(8)->get()
            ->map(fn ($r) => ['name' => $r->name, 'value' => round((float) $r->value, 2)]);

        return Inertia::render('inventory/movements', [
            'movements' => $movements,
            'filters' => $filters,
            'items' => InventoryItem::where('is_active', true)->orderBy('name')->get(['id', 'name', 'sku', 'unit', 'quantity', 'unit_cost'])
                ->map(fn ($i) => ['value' => $i->id, 'label' => $i->name.($i->sku ? " ({$i->sku})" : ''), 'unit' => $i->unit, 'quantity' => (string) $i->quantity, 'unit_cost' => (string) $i->unit_cost]),
            'destinations' => self::DESTINATIONS,
            'types' => array_map(fn ($t) => ['value' => $t, 'label' => ucwords(str_replace('_', ' ', $t))], StockMovement::TYPES),
            'byDestination' => $byDestination,
            'canOverride' => $request->user()->can('inventory.manage'),
            'stats' => [
                'received_month' => $sumValue(['receipt'], false),
                'issued_month' => $sumValue(['issue'], true),
                'written_off_month' => $sumValue(['write_off', 'adjustment'], true),
                'movements_month' => StockMovement::where('date', '>=', $monthStart)->count(),
            ],
        ]);
    }

    public function store(Request $request, StockService $stock): RedirectResponse
    {
        $school = $this->tenancy()->schoolId();
        $data = $request->validate([
            'inventory_item_id' => ['required', Rule::exists('inventory_items', 'id')->where('school_id', $school)],
            'type' => ['required', Rule::in(['issue', 'adjustment', 'return', 'write_off'])],
            'direction' => ['required_if:type,adjustment', 'nullable', Rule::in(['in', 'out'])],
            'quantity' => ['required', 'numeric', 'gt:0', 'max:100000000'],
            'date' => ['required', 'date'],
            'issued_to' => ['required_if:type,issue', 'required_if:type,return', 'nullable', 'string', 'max:100'],
            'reference' => ['nullable', 'string', 'max:60'],
            'unit_cost' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'notes' => ['required_if:type,adjustment', 'required_if:type,write_off', 'nullable', 'string', 'max:255'],
            'override' => ['boolean'],
            'override_reason' => ['required_if:override,true', 'nullable', 'string', 'max:255'],
        ], [
            'notes.required_if' => 'A reason is required for adjustments and write-offs.',
            'issued_to.required_if' => 'Select the department, class or kitchen.',
            'override_reason.required_if' => 'Give a reason for allowing negative stock.',
        ]);

        $qty = number_format((float) $data['quantity'], 2, '.', '');
        $outflow = match ($data['type']) {
            'issue', 'write_off' => true,
            'return' => false,
            'adjustment' => ($data['direction'] ?? 'out') === 'out',
        };
        $signed = $outflow ? '-'.$qty : $qty;

        // Negative stock is only allowed for inventory managers who tick the override AND give a reason.
        $override = (bool) ($data['override'] ?? false) && $request->user()->can('inventory.manage') && ! empty($data['override_reason']);
        $notes = trim(($data['notes'] ?? '').($override ? ' [Negative stock override: '.$data['override_reason'].']' : ''));

        $item = InventoryItem::findOrFail($data['inventory_item_id']);
        $attributes = [
            'date' => $data['date'],
            'issued_to' => $data['issued_to'] ?? null,
            'reference' => $data['reference'] ?? null,
            'notes' => $notes ?: null,
        ];

        // A stock-count gain with a known cost re-averages the item cost like a receipt.
        $movement = (! $outflow && $data['type'] === 'adjustment' && isset($data['unit_cost']) && $data['unit_cost'] !== '')
            ? $stock->receive($item, $qty, number_format((float) $data['unit_cost'], 2, '.', ''), $attributes + ['type' => 'adjustment'])
            : $stock->move($item, $data['type'], $signed, $attributes, $override);

        $stock->postMovement($movement);
        $label = str_replace('_', '-', $data['type']);
        $this->audit($data['type'], $movement, ucfirst($label)." of {$qty} {$item->unit} {$item->name}".($movement->issued_to ? " to {$movement->issued_to}" : '').($override ? ' (negative stock override)' : ''), 'inventory');

        if ($stock->ledgerWarning) {
            $this->toast("Stock updated, but the ledger entry was not posted: {$stock->ledgerWarning}", 'warning');
        } else {
            $this->toast('Stock movement recorded. Balance: '.rtrim(rtrim((string) $movement->balance_after, '0'), '.')." {$item->unit}.");
        }

        return back();
    }
}
