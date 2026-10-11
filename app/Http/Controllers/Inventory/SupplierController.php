<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => ''], $request->only(['search', 'status']));
        $school = $this->tenancy()->schoolId();

        $spend = DB::table('purchase_orders')
            ->where('school_id', $school)->whereIn('status', ['approved', 'received'])
            ->groupBy('supplier_id')
            ->selectRaw('supplier_id, SUM(total) as total, COUNT(*) as orders, MAX(order_date) as last_order')
            ->get()->keyBy('supplier_id');

        $suppliers = Supplier::query()
            ->when($filters['status'] === 'active', fn ($q) => $q->where('is_active', true))
            ->when($filters['status'] === 'inactive', fn ($q) => $q->where('is_active', false))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%{$s}%")->orWhere('contact_person', 'like', "%{$s}%")
                ->orWhere('phone', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")->orWhere('tin', 'like', "%{$s}%")))
            ->orderBy('name')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Supplier $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'contact_person' => $s->contact_person,
                'phone' => $s->phone,
                'email' => $s->email,
                'address' => $s->address,
                'tin' => $s->tin,
                'is_active' => (bool) $s->is_active,
                'orders' => (int) ($spend[$s->id]->orders ?? 0),
                'spend' => (string) ($spend[$s->id]->total ?? '0'),
                'last_order' => isset($spend[$s->id]) ? substr((string) $spend[$s->id]->last_order, 0, 10) : null,
            ]);

        return Inertia::render('inventory/suppliers', [
            'suppliers' => $suppliers,
            'filters' => $filters,
            'stats' => [
                'total' => Supplier::count(),
                'active' => Supplier::where('is_active', true)->count(),
                'spend_year' => (string) PurchaseOrder::whereIn('status', ['approved', 'received'])->where('order_date', '>=', now()->startOfYear()->toDateString())->sum('total'),
                'open_orders' => PurchaseOrder::whereIn('status', ['draft', 'approved'])->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $supplier = Supplier::create($this->validated($request));
        $this->audit('created', $supplier, "Supplier {$supplier->name} added", 'inventory');
        $this->toast('Supplier added.');

        return back();
    }

    public function update(Request $request, Supplier $supplier): RedirectResponse
    {
        $data = $this->validated($request);
        $old = $supplier->only(array_keys($data));
        $supplier->update($data);
        $this->audit('updated', $supplier, "Supplier {$supplier->name} updated", 'inventory', $old, $data);
        $this->toast('Supplier updated.');

        return back();
    }

    public function destroy(Supplier $supplier): RedirectResponse
    {
        if (PurchaseOrder::where('supplier_id', $supplier->id)->exists() || DB::table('expenses')->where('school_id', $this->tenancy()->schoolId())->where('supplier_id', $supplier->id)->exists()) {
            $supplier->update(['is_active' => false]);
            $this->toast('Supplier has transactions, so it was deactivated instead of deleted.', 'info');

            return back();
        }

        $this->audit('deleted', $supplier, "Supplier {$supplier->name} deleted", 'inventory');
        $supplier->delete();
        $this->toast('Supplier deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'tin' => ['nullable', 'string', 'max:30'],
            'is_active' => ['boolean'],
        ]);
        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        return $data;
    }
}
