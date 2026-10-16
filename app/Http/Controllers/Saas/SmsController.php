<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Communication\SmsCreditController;
use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Models\SmsOrder;
use App\Models\SmsPackage;
use App\Models\Tenant;
use App\Notifications\SchoolNotification;
use App\Services\Messaging\SmsCredits;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** SaaS console: SMS bundles for sale, schools' orders, payment confirmation and manual credit adjustments. */
class SmsController extends Controller
{
    public function __construct(private SmsCredits $credits) {}

    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => ''], $request->only(['search', 'status']));

        $orders = SmsOrder::query()
            ->with(['tenant:id,name', 'school:id,name', 'requester:id,name,phone', 'confirmer:id,name'])
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('reference', 'like', "%{$v}%")->orWhere('payment_reference', 'like', "%{$v}%")->orWhereHas('tenant', fn ($t) => $t->where('name', 'like', "%{$v}%"))))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->orderByRaw("FIELD(status, 'submitted', 'pending', 'paid', 'cancelled')")
            ->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (SmsOrder $o) => [
                'id' => $o->id,
                'reference' => $o->reference,
                'tenant' => $o->tenant?->name,
                'school' => $o->school?->name,
                'package_name' => $o->package_name,
                'credits' => $o->credits,
                'amount' => (string) $o->amount,
                'status' => $o->status,
                'payment_method' => $o->payment_method,
                'payment_reference' => $o->payment_reference,
                'payer_phone' => $o->payer_phone,
                'notes' => $o->notes,
                'cancel_reason' => $o->cancel_reason,
                'requested_by' => $o->requester?->name,
                'requester_phone' => $o->requester?->phone,
                'confirmed_by' => $o->confirmer?->name,
                'created_at' => $o->created_at?->toIso8601String(),
                'submitted_at' => $o->submitted_at?->toIso8601String(),
                'paid_at' => $o->paid_at?->toIso8601String(),
            ]);

        return Inertia::render('saas/sms', [
            'packages' => SmsPackage::orderBy('sort_order')->orderBy('credits')->get()->map(fn (SmsPackage $p) => [
                'id' => $p->id, 'name' => $p->name, 'credits' => $p->credits, 'price' => (string) $p->price, 'per_sms' => $p->pricePerSms(),
                'description' => $p->description, 'is_popular' => $p->is_popular, 'is_active' => $p->is_active, 'sort_order' => $p->sort_order,
                'orders_count' => SmsOrder::where('sms_package_id', $p->id)->where('status', 'paid')->count(),
            ]),
            'orders' => $orders,
            'filters' => $filters,
            'tenants' => Tenant::with('plan:id,name,sms_credits')->orderBy('name')->get()->map(fn (Tenant $t) => [
                'value' => $t->id,
                'label' => $t->name,
                'balance' => $this->credits->balance($t),
            ]),
            'payment' => SmsCreditController::paymentSettings(),
            'stats' => [
                'awaiting' => SmsOrder::where('status', 'submitted')->count(),
                'unpaid' => SmsOrder::where('status', 'pending')->count(),
                'revenue_month' => (string) SmsOrder::where('status', 'paid')->where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
                'credits_sold_month' => (int) SmsOrder::where('status', 'paid')->where('paid_at', '>=', now()->startOfMonth())->sum('credits'),
            ],
        ]);
    }

    public function storePackage(Request $request): RedirectResponse
    {
        $package = SmsPackage::create($this->validatedPackage($request));
        $this->audit('sms_package_created', $package, "Created SMS package {$package->name} ({$package->credits} SMS)", 'saas');
        $this->toast("Package {$package->name} created.");

        return back();
    }

    public function updatePackage(Request $request, SmsPackage $package): RedirectResponse
    {
        $data = $this->validatedPackage($request);
        $old = $package->only(array_keys($data));
        $package->update($data);
        $this->audit('sms_package_updated', $package, "Updated SMS package {$package->name}", 'saas', $old, $data);
        $this->toast("Package {$package->name} saved.");

        return back();
    }

    public function destroyPackage(SmsPackage $package): RedirectResponse
    {
        if (SmsOrder::where('sms_package_id', $package->id)->exists()) {
            $package->update(['is_active' => false]);
            $this->toast('This package has orders, so it was deactivated instead of deleted.', 'warning');

            return back();
        }

        $this->audit('sms_package_deleted', $package, "Deleted SMS package {$package->name}", 'saas');
        $package->delete();
        $this->toast('Package deleted.');

        return back();
    }

    /** Payment verified: add the credits to the school's account. */
    public function confirm(Request $request, SmsOrder $order): RedirectResponse
    {
        $data = $request->validate([
            'payment_reference' => ['nullable', 'string', 'max:100'],
            'payment_method' => ['nullable', Rule::in(SmsCreditController::PAYMENT_METHODS)],
        ]);

        $confirmed = DB::transaction(function () use ($order, $data) {
            $order = SmsOrder::lockForUpdate()->findOrFail($order->id);
            if (! $order->isOpen()) {
                return null;
            }

            $order->update([
                'status' => 'paid',
                'paid_at' => now(),
                'confirmed_by' => auth()->id(),
                'payment_reference' => ($data['payment_reference'] ?? null) ?: $order->payment_reference,
                'payment_method' => ($data['payment_method'] ?? null) ?: $order->payment_method,
            ]);
            $this->credits->credit($order->tenant, $order->credits, 'purchase', "Purchased {$order->package_name} ({$order->reference})", $order);

            return $order;
        });

        if (! $confirmed) {
            $this->toast('This order is already closed.', 'error');

            return back();
        }

        $this->audit('sms_order_paid', $confirmed, "Confirmed SMS order {$confirmed->reference}: +{$confirmed->credits} SMS to {$confirmed->tenant?->name}", 'saas');
        if ($confirmed->requester) {
            Notification::send($confirmed->requester, new SchoolNotification('SMS credits added', number_format($confirmed->credits)." SMS credits from order {$confirmed->reference} are now available.", '/communication/sms-credits', 'success'));
        }
        $this->toast(number_format($confirmed->credits)." SMS credited to {$confirmed->tenant?->name}.");

        return back();
    }

    public function cancel(Request $request, SmsOrder $order): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);
        abort_unless($order->isOpen(), 422, 'This order is already closed.');

        $order->update(['status' => 'cancelled', 'cancel_reason' => $data['reason']]);
        $this->audit('sms_order_cancelled', $order, "Cancelled SMS order {$order->reference}: {$data['reason']}", 'saas');
        if ($order->requester) {
            Notification::send($order->requester, new SchoolNotification('SMS order cancelled', "Order {$order->reference} was cancelled: {$data['reason']}", '/communication/sms-credits', 'warning'));
        }
        $this->toast('Order cancelled.');

        return back();
    }

    /** Free / corrective top-up (or deduction) outside an order. */
    public function adjust(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', Rule::exists('tenants', 'id')],
            'credits' => ['required', 'integer', 'not_in:0', 'between:-1000000,1000000'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $tenant = Tenant::findOrFail($data['tenant_id']);
        $entry = $this->credits->credit($tenant, (int) $data['credits'], 'adjustment', $data['reason']);
        $this->audit('sms_credits_adjusted', $tenant, "Adjusted SMS credits for {$tenant->name} by {$data['credits']}: {$data['reason']}", 'saas');
        $this->toast("{$tenant->name}: purchased balance is now ".number_format($entry->balance_after).' SMS.');

        return back();
    }

    public function updatePayment(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'instructions' => ['required', 'string', 'max:2000'],
            'account_name' => ['nullable', 'string', 'max:120'],
        ]);

        PlatformSetting::put('sms_payment', $data);
        $this->audit('sms_payment_updated', null, 'Updated SMS bundle payment instructions', 'saas');
        $this->toast('Payment instructions saved.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validatedPackage(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'credits' => ['required', 'integer', 'min:1', 'max:10000000'],
            'price' => ['required', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:255'],
            'is_popular' => ['boolean'],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        $data['sort_order'] ??= 0;

        return $data;
    }
}
