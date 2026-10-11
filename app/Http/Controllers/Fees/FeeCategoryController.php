<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\FeeCategory;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class FeeCategoryController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'status']);
        $schoolId = $this->tenancy()->schoolId();

        $billed = DB::table('invoice_items')
            ->join('invoices', 'invoices.id', '=', 'invoice_items.invoice_id')
            ->where('invoices.school_id', $schoolId)
            ->whereNotIn('invoices.status', ['cancelled', 'draft'])
            ->groupBy('invoice_items.fee_category_id')
            ->selectRaw('invoice_items.fee_category_id, SUM(invoice_items.amount - invoice_items.discount) as billed, COUNT(*) as lines_count')
            ->get()->keyBy('fee_category_id');

        $categories = FeeCategory::with('incomeAccount:id,code,name')
            ->withCount('structures')
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('code', 'like', "%{$s}%")))
            ->when(($filters['status'] ?? '') !== '', fn ($q) => $q->where('is_active', ($filters['status'] ?? '') === 'active'))
            ->orderBy('name')
            ->get()
            ->map(fn (FeeCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'description' => $c->description,
                'is_active' => $c->is_active,
                'income_account_id' => $c->income_account_id,
                'income_account' => $c->incomeAccount ? "{$c->incomeAccount->code} · {$c->incomeAccount->name}" : null,
                'structures_count' => $c->structures_count,
                'billed' => (string) ($billed[$c->id]->billed ?? '0'),
            ]);

        return Inertia::render('fees/categories', [
            'categories' => $categories,
            'filters' => array_merge(['search' => '', 'status' => ''], $filters),
            'accounts' => Lookups::accounts('income'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $category = FeeCategory::create($this->validated($request));
        $this->audit('created', $category, "Created fee category {$category->name}", 'fees');
        $this->toast('Fee category created.');

        return back();
    }

    public function update(Request $request, FeeCategory $category): RedirectResponse
    {
        $old = $category->only(['name', 'code', 'income_account_id', 'is_active']);
        $category->update($this->validated($request, $category));
        $this->audit('updated', $category, "Updated fee category {$category->name}", 'fees', $old, $category->only(array_keys($old)));
        $this->toast('Fee category updated.');

        return back();
    }

    public function destroy(FeeCategory $category): RedirectResponse
    {
        $used = DB::table('invoice_items')->join('invoices', 'invoices.id', '=', 'invoice_items.invoice_id')
            ->where('invoices.school_id', $this->tenancy()->schoolId())
            ->where('invoice_items.fee_category_id', $category->id)->exists();

        if ($used || $category->structures()->exists()) {
            $category->update(['is_active' => false]);
            $this->toast('This category is already used on fee structures or invoices, so it was deactivated instead of deleted.', 'warning');

            return back();
        }

        $this->audit('deleted', $category, "Deleted fee category {$category->name}", 'fees');
        $category->delete();
        $this->toast('Fee category deleted.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?FeeCategory $category = null): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('fee_categories', 'name')->where('school_id', $schoolId)->ignore($category?->id)],
            'code' => ['nullable', 'string', 'max:20', Rule::unique('fee_categories', 'code')->where('school_id', $schoolId)->ignore($category?->id)],
            'income_account_id' => ['nullable', Rule::exists('accounts', 'id')->where('school_id', $schoolId)->where('type', 'income')->where('is_postable', true)],
            'description' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ]);
    }
}
