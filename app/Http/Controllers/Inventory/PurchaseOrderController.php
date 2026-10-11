<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Supplier;
use App\Services\DocumentNumber;
use App\Services\Inventory\StockService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Purchase orders: draft → approved (by a different user) → received (full / partial GRNs) | cancelled. */
class PurchaseOrderController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'supplier' => ''], $request->only(['search', 'status', 'supplier']));

        $orders = PurchaseOrder::query()
            ->with(['supplier:id,name', 'creator:id,name', 'approver:id,name', 'items:id,purchase_order_id,quantity,received_quantity'])
            ->withCount('items')
            ->when($filters['status'] === 'partial', fn ($q) => $q->where('status', 'approved')->whereHas('items', fn ($i) => $i->where('received_quantity', '>', 0)))
            ->when($filters['status'] && $filters['status'] !== 'partial', fn ($q) => $q->where('status', $filters['status']))
            ->when($filters['supplier'], fn ($q, $s) => $q->where('supplier_id', $s))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('po_no', 'like', "%{$s}%")->orWhere('notes', 'like', "%{$s}%")->orWhereHas('supplier', fn ($sp) => $sp->where('name', 'like', "%{$s}%"))))
            ->orderByDesc('order_date')->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (PurchaseOrder $po) => [
                'id' => $po->id,
                'po_no' => $po->po_no,
                'supplier' => $po->supplier?->name,
                'order_date' => $po->order_date?->toDateString(),
                'expected_date' => $po->expected_date?->toDateString(),
                'total' => (string) $po->total,
                'status' => $po->displayStatus(),
                'items_count' => $po->items_count,
                'progress' => $this->progress($po),
                'created_by' => $po->creator?->name,
                'approved_by' => $po->approver?->name,
            ]);

        return Inertia::render('inventory/purchase-orders/index', [
            'orders' => $orders,
            'filters' => $filters,
            'suppliers' => Supplier::orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['value' => $s->id, 'label' => $s->name]),
            'stats' => [
                'draft' => PurchaseOrder::where('status', 'draft')->count(),
                'approved' => PurchaseOrder::where('status', 'approved')->count(),
                'open_value' => (string) PurchaseOrder::whereIn('status', ['draft', 'approved'])->sum('total'),
                'received_month' => (string) PurchaseOrder::where('status', 'received')->where('updated_at', '>=', now()->startOfMonth())->sum('total'),
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('inventory/purchase-orders/form', $this->formData(null));
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $order = DB::transaction(function () use ($data, $request) {
            $order = PurchaseOrder::create([
                'po_no' => DocumentNumber::next('purchase_order'),
                'supplier_id' => $data['supplier_id'],
                'order_date' => $data['order_date'],
                'expected_date' => $data['expected_date'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => 'draft',
                'created_by' => $request->user()->id,
            ]);
            $this->syncLines($order, $data['lines']);

            return $order;
        });

        $this->audit('created', $order, "Purchase order {$order->po_no} created", 'inventory');
        $this->toast("Purchase order {$order->po_no} saved as draft. Another user must approve it.");

        return to_route('inventory.purchase-orders.show', $order);
    }

    public function show(PurchaseOrder $purchaseOrder): Response
    {
        $purchaseOrder->load(['supplier', 'creator:id,name', 'approver:id,name', 'items.item:id,name,sku,unit', 'movements' => fn ($q) => $q->with('item:id,name,unit', 'user:id,name')->orderBy('date')->orderBy('id')]);
        $user = request()->user();

        return Inertia::render('inventory/purchase-orders/show', [
            'order' => [
                'id' => $purchaseOrder->id,
                'po_no' => $purchaseOrder->po_no,
                'status' => $purchaseOrder->displayStatus(),
                'raw_status' => $purchaseOrder->status,
                'order_date' => $purchaseOrder->order_date?->toDateString(),
                'expected_date' => $purchaseOrder->expected_date?->toDateString(),
                'notes' => $purchaseOrder->notes,
                'total' => (string) $purchaseOrder->total,
                'created_by' => $purchaseOrder->creator?->name,
                'created_by_id' => $purchaseOrder->created_by,
                'approved_by' => $purchaseOrder->approver?->name,
                'created_at' => $purchaseOrder->created_at?->toDateTimeString(),
                'progress' => $this->progress($purchaseOrder),
                'supplier' => $purchaseOrder->supplier?->only(['id', 'name', 'contact_person', 'phone', 'email', 'address', 'tin']),
                'lines' => $purchaseOrder->items->map(fn (PurchaseOrderItem $l) => [
                    'id' => $l->id,
                    'item' => $l->item?->name,
                    'sku' => $l->item?->sku,
                    'unit' => $l->item?->unit,
                    'quantity' => (string) $l->quantity,
                    'unit_cost' => (string) $l->unit_cost,
                    'amount' => bcmul((string) $l->quantity, (string) $l->unit_cost, 2),
                    'received_quantity' => (string) $l->received_quantity,
                    'outstanding' => $l->outstanding(),
                ])->values(),
                'receipts' => $purchaseOrder->movements->map(fn ($m) => [
                    'id' => $m->id,
                    'date' => $m->date?->toDateString(),
                    'item' => $m->item?->name,
                    'unit' => $m->item?->unit,
                    'quantity' => (string) $m->quantity,
                    'unit_cost' => (string) $m->unit_cost,
                    'user' => $m->user?->name,
                ])->values(),
            ],
            'can' => [
                'approve' => $purchaseOrder->status === 'draft' && $user->can('inventory.manage') && $purchaseOrder->created_by !== $user->id,
                'self_created' => $purchaseOrder->created_by === $user->id,
            ],
        ]);
    }

    public function edit(PurchaseOrder $purchaseOrder): Response|RedirectResponse
    {
        if ($purchaseOrder->status !== 'draft') {
            $this->toast('Only draft purchase orders can be edited.', 'error');

            return to_route('inventory.purchase-orders.show', $purchaseOrder);
        }

        return Inertia::render('inventory/purchase-orders/form', $this->formData($purchaseOrder));
    }

    public function update(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        if ($purchaseOrder->status !== 'draft') {
            $this->toast('Only draft purchase orders can be edited.', 'error');

            return back();
        }

        $data = $this->validated($request);
        DB::transaction(function () use ($purchaseOrder, $data) {
            $purchaseOrder->update([
                'supplier_id' => $data['supplier_id'],
                'order_date' => $data['order_date'],
                'expected_date' => $data['expected_date'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);
            $purchaseOrder->items()->delete();
            $this->syncLines($purchaseOrder, $data['lines']);
        });

        $this->audit('updated', $purchaseOrder, "Purchase order {$purchaseOrder->po_no} updated", 'inventory');
        $this->toast('Purchase order updated.');

        return to_route('inventory.purchase-orders.show', $purchaseOrder);
    }

    public function approve(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        if ($purchaseOrder->status !== 'draft') {
            $this->toast('Only draft purchase orders can be approved.', 'error');

            return back();
        }
        if ($purchaseOrder->created_by === $request->user()->id) {
            $this->toast('Segregation of duties: a purchase order must be approved by someone other than its creator.', 'error');

            return back();
        }

        $purchaseOrder->update(['status' => 'approved', 'approved_by' => $request->user()->id]);
        $this->audit('approved', $purchaseOrder, "Purchase order {$purchaseOrder->po_no} approved (TZS {$purchaseOrder->total})", 'inventory', ['status' => 'draft'], ['status' => 'approved']);
        $this->toast('Purchase order approved. Goods can now be received.');

        return back();
    }

    public function cancel(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        if (! in_array($purchaseOrder->status, ['draft', 'approved'], true)) {
            $this->toast('This purchase order cannot be cancelled.', 'error');

            return back();
        }
        if ($purchaseOrder->items()->where('received_quantity', '>', 0)->exists()) {
            $this->toast('Goods have already been received against this order; it cannot be cancelled.', 'error');

            return back();
        }

        $old = $purchaseOrder->status;
        $purchaseOrder->update(['status' => 'cancelled', 'notes' => trim(($purchaseOrder->notes ? $purchaseOrder->notes.' | ' : '').'Cancelled: '.$data['reason'])]);
        $this->audit('cancelled', $purchaseOrder, "Purchase order {$purchaseOrder->po_no} cancelled: {$data['reason']}", 'inventory', ['status' => $old], ['status' => 'cancelled']);
        $this->toast('Purchase order cancelled.');

        return back();
    }

    /** Goods received note: full or partial quantities per line. */
    public function receive(Request $request, PurchaseOrder $purchaseOrder, StockService $stock): RedirectResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array'],
            'lines.*' => ['nullable', 'numeric', 'min:0'],
        ]);

        $movements = $stock->receivePurchaseOrder($purchaseOrder, $data['lines'], $data['date'], $data['notes'] ?? null);
        $purchaseOrder->refresh();

        $this->audit('received', $purchaseOrder, "Goods received on {$purchaseOrder->po_no}: ".count($movements).' line(s)'.($purchaseOrder->status === 'received' ? ' — order complete' : ' — partial'), 'inventory');

        if ($stock->ledgerWarning) {
            $this->toast("Goods received, but the ledger entry was not posted: {$stock->ledgerWarning}", 'warning');
        } else {
            $this->toast($purchaseOrder->status === 'received' ? 'All goods received. Order complete.' : 'Partial delivery recorded.');
        }

        return back();
    }

    public function destroy(PurchaseOrder $purchaseOrder): RedirectResponse
    {
        if ($purchaseOrder->status !== 'draft') {
            $this->toast('Only draft purchase orders can be deleted. Cancel it instead.', 'error');

            return back();
        }

        $this->audit('deleted', $purchaseOrder, "Draft purchase order {$purchaseOrder->po_no} deleted", 'inventory');
        $purchaseOrder->delete();
        $this->toast('Draft purchase order deleted.');

        return to_route('inventory.purchase-orders.index');
    }

    /** @return array<string, mixed> */
    private function formData(?PurchaseOrder $order): array
    {
        $order?->load('items');

        return [
            'order' => $order ? [
                'id' => $order->id,
                'po_no' => $order->po_no,
                'supplier_id' => $order->supplier_id,
                'order_date' => $order->order_date?->toDateString(),
                'expected_date' => $order->expected_date?->toDateString() ?? '',
                'notes' => $order->notes ?? '',
                'lines' => $order->items->map(fn ($l) => ['inventory_item_id' => $l->inventory_item_id, 'quantity' => (string) $l->quantity, 'unit_cost' => (string) $l->unit_cost])->values(),
            ] : null,
            'suppliers' => Supplier::where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['value' => $s->id, 'label' => $s->name]),
            'items' => InventoryItem::where('is_active', true)->orderBy('name')->get(['id', 'name', 'sku', 'unit', 'unit_cost', 'quantity', 'reorder_level'])
                ->map(fn ($i) => [
                    'value' => $i->id,
                    'label' => $i->name.($i->sku ? " ({$i->sku})" : ''),
                    'unit' => $i->unit,
                    'unit_cost' => (string) $i->unit_cost,
                    'quantity' => (string) $i->quantity,
                    'low' => bccomp((string) $i->quantity, (string) $i->reorder_level, 2) <= 0,
                ]),
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $school = $this->tenancy()->schoolId();

        return $request->validate([
            'supplier_id' => ['required', Rule::exists('suppliers', 'id')->where('school_id', $school)],
            'order_date' => ['required', 'date'],
            'expected_date' => ['nullable', 'date', 'after_or_equal:order_date'],
            'notes' => ['nullable', 'string', 'max:255'],
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*.inventory_item_id' => ['required', 'distinct', Rule::exists('inventory_items', 'id')->where('school_id', $school)],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:100000000'],
            'lines.*.unit_cost' => ['required', 'numeric', 'min:0', 'max:1000000000'],
        ], [
            'lines.required' => 'Add at least one item.',
            'lines.*.inventory_item_id.distinct' => 'Each item can appear only once.',
            'lines.*.inventory_item_id.required' => 'Select an item.',
        ]);
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    private function syncLines(PurchaseOrder $order, array $lines): void
    {
        $total = '0.00';
        foreach ($lines as $line) {
            $qty = number_format((float) $line['quantity'], 2, '.', '');
            $cost = number_format((float) $line['unit_cost'], 2, '.', '');
            $order->items()->create(['inventory_item_id' => $line['inventory_item_id'], 'quantity' => $qty, 'unit_cost' => $cost, 'received_quantity' => 0]);
            $total = bcadd($total, bcmul($qty, $cost, 2), 2);
        }
        $order->update(['total' => $total]);
    }

    private function progress(PurchaseOrder $po): int
    {
        $ordered = $po->items->reduce(fn ($c, $l) => bcadd($c, (string) $l->quantity, 2), '0');
        $received = $po->items->reduce(fn ($c, $l) => bcadd($c, (string) $l->received_quantity, 2), '0');

        return bccomp($ordered, '0', 2) > 0 ? (int) round((float) bcdiv(bcmul($received, '100', 2), $ordered, 2)) : 0;
    }
}
