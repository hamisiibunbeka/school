<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\FeeCategory;
use App\Models\FeeDiscount;
use App\Support\Lookups;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class FeeDiscountController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'status', 'category', 'type', 'class']);

        $query = FeeDiscount::query()
            ->with(['student:id,first_name,middle_name,last_name,admission_no,school_class_id,residence_type', 'student.schoolClass:id,name', 'feeCategory:id,name', 'approver:id,name'])
            ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhereHas('student', fn ($st) => $st->search($s))))
            ->when(($filters['status'] ?? '') !== '', fn ($q) => $q->where('is_active', ($filters['status'] ?? '') === 'active'))
            ->when($filters['category'] ?? null, fn ($q, $c) => $c === 'all' ? $q->whereNull('fee_category_id') : $q->where('fee_category_id', $c))
            ->when($filters['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when($filters['class'] ?? null, fn ($q, $c) => $q->whereHas('student', fn ($st) => $st->where('school_class_id', $c)));

        $discounts = (clone $query)->latest()
            ->paginate($this->perPage())->withQueryString()
            ->through(fn (FeeDiscount $d) => [
                'id' => $d->id,
                'student_id' => $d->student_id,
                'student' => $d->student?->full_name,
                'admission_no' => $d->student?->admission_no,
                'class' => $d->student?->schoolClass?->name,
                'fee_category_id' => $d->fee_category_id,
                'category' => $d->feeCategory?->name,
                'name' => $d->name,
                'type' => $d->type,
                'value' => (string) $d->value,
                'reason' => $d->reason,
                'is_active' => $d->is_active,
                'approved_by' => $d->approver?->name,
                'created_at' => $d->created_at?->toDateString(),
            ]);

        $schoolId = $this->tenancy()->schoolId();
        $granted = \Illuminate\Support\Facades\DB::table('invoices')->where('school_id', $schoolId)
            ->whereNotIn('status', ['cancelled', 'draft'])->sum('discount');

        return Inertia::render('fees/discounts', [
            'discounts' => $discounts,
            'filters' => array_merge(['search' => '', 'status' => '', 'category' => '', 'type' => '', 'class' => ''], $filters),
            'categories' => FeeCategory::orderBy('name')->get(['id', 'name'])->map(fn ($c) => ['value' => $c->id, 'label' => $c->name]),
            'classes' => Lookups::classes(),
            'stats' => [
                'active' => FeeDiscount::active()->count(),
                'students' => FeeDiscount::active()->distinct('student_id')->count('student_id'),
                'scholarships' => FeeDiscount::active()->where('type', 'percent')->where('value', '>=', 50)->count(),
                'granted' => (string) $granted,
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $discount = FeeDiscount::create($data + ['approved_by' => $request->user()->id]);
        $discount->load('student');
        $this->audit('approved', $discount, "Approved {$discount->name} ({$discount->type} {$discount->value}) for {$discount->student?->full_name}", 'fees', null, $data);
        $this->toast('Discount approved and recorded. It applies to invoices generated from now on.');

        return back();
    }

    public function update(Request $request, FeeDiscount $discount): RedirectResponse
    {
        $old = $discount->only(['name', 'type', 'value', 'fee_category_id', 'is_active', 'reason']);
        $discount->update($this->validated($request) + ['approved_by' => $request->user()->id]);
        $this->audit('updated', $discount, "Updated discount {$discount->name}", 'fees', $old, $discount->only(array_keys($old)));
        $this->toast('Discount updated.');

        return back();
    }

    public function destroy(FeeDiscount $discount): RedirectResponse
    {
        $this->audit('deleted', $discount, "Removed discount {$discount->name}", 'fees', $discount->toArray());
        $discount->delete();
        $this->toast('Discount removed. Invoices already issued keep their discount.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $schoolId = $this->tenancy()->schoolId();

        return $request->validate([
            'student_id' => ['required', Rule::exists('students', 'id')->where('school_id', $schoolId)],
            'fee_category_id' => ['nullable', Rule::exists('fee_categories', 'id')->where('school_id', $schoolId)],
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(FeeDiscount::TYPES)],
            'value' => ['required', 'numeric', 'gt:0', $request->input('type') === 'percent' ? 'max:100' : 'max:9999999999'],
            'reason' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ]);
    }
}
