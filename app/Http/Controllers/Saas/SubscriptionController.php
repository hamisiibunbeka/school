<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Tenant;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Subscription invoices and payments across tenants (SRS 3.4). */
class SubscriptionController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'plan' => ''], $request->only(['search', 'status', 'plan']));

        $subscriptions = Subscription::query()
            ->with(['tenant:id,name,status', 'plan:id,name'])
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('reference', 'like', "%{$v}%")->orWhereHas('tenant', fn ($t) => $t->where('name', 'like', "%{$v}%"))))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['plan'], fn ($q, $v) => $q->where('plan_id', $v))
            ->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Subscription $s) => [
                'id' => $s->id,
                'tenant_id' => $s->tenant_id,
                'tenant' => $s->tenant?->name,
                'tenant_status' => $s->tenant?->status,
                'plan' => $s->plan?->name,
                'starts_at' => $s->starts_at?->toDateString(),
                'ends_at' => $s->ends_at?->toDateString(),
                'amount' => (string) $s->amount,
                'status' => $s->status,
                'reference' => $s->reference,
                'paid_at' => $s->paid_at?->toDateString(),
            ]);

        return Inertia::render('saas/subscriptions', [
            'subscriptions' => $subscriptions,
            'filters' => $filters,
            'tenants' => Tenant::orderBy('name')->get(['id', 'name', 'plan_id', 'subscription_ends_at'])->map(fn ($t) => [
                'value' => $t->id, 'label' => $t->name, 'plan_id' => $t->plan_id, 'subscription_ends_at' => $t->subscription_ends_at?->toDateString(),
            ]),
            'plans' => Plan::where('is_active', true)->orderBy('price')->get(['id', 'name', 'price', 'billing_interval'])->map(fn ($p) => [
                'value' => $p->id, 'label' => $p->name, 'price' => (string) $p->price, 'billing_interval' => $p->billing_interval,
            ]),
            'stats' => [
                'collected_year' => (string) Subscription::whereNotNull('paid_at')->whereYear('paid_at', now()->year)->sum('amount'),
                'collected_month' => (string) Subscription::whereNotNull('paid_at')->where('paid_at', '>=', now()->startOfMonth())->sum('amount'),
                'pending' => (string) Subscription::where('status', 'pending')->sum('amount'),
                'pending_count' => Subscription::where('status', 'pending')->count(),
                'active' => Subscription::where('status', 'active')->whereDate('ends_at', '>=', now()->toDateString())->count(),
            ],
        ]);
    }

    /** Issue a subscription invoice, or record a payment that activates / extends the tenant. */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'tenant_id' => ['required', Rule::exists('tenants', 'id')],
            'plan_id' => ['required', Rule::exists('plans', 'id')],
            'periods' => ['required', 'integer', 'min:1', 'max:36'],
            'starts_at' => ['nullable', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'reference' => ['nullable', 'string', 'max:100'],
            'paid' => ['boolean'],
            'paid_at' => ['nullable', 'required_if:paid,true', 'date', 'before_or_equal:today'],
        ]);

        $tenant = Tenant::findOrFail($data['tenant_id']);
        $plan = Plan::findOrFail($data['plan_id']);

        $start = ! empty($data['starts_at'])
            ? CarbonImmutable::parse($data['starts_at'])
            : ($tenant->subscription_ends_at && $tenant->subscription_ends_at->isFuture() ? $tenant->subscription_ends_at->addDay() : now());
        $end = $this->periodEnd($start, $plan->billing_interval, (int) $data['periods']);
        $paid = $request->boolean('paid');

        $subscription = DB::transaction(function () use ($tenant, $plan, $start, $end, $data, $paid) {
            $subscription = $tenant->subscriptions()->create([
                'plan_id' => $plan->id,
                'starts_at' => $start->toDateString(),
                'ends_at' => $end->toDateString(),
                'amount' => $data['amount'],
                'status' => $paid ? 'active' : 'pending',
                'reference' => ($data['reference'] ?? null) ?: 'SUB-'.now()->format('ymd').'-'.str_pad((string) (Subscription::max('id') + 1), 4, '0', STR_PAD_LEFT),
                'paid_at' => $paid ? ($data['paid_at'] ?? now()->toDateString()) : null,
            ]);

            if ($paid) {
                $this->activate($tenant, $subscription);
            }

            return $subscription;
        });

        $this->audit($paid ? 'subscription_paid' : 'subscription_invoiced', $subscription, ($paid ? 'Recorded payment' : 'Issued subscription invoice')." {$subscription->reference} for {$tenant->name}: {$plan->name} ".$start->toDateString().' → '.$end->toDateString(), 'saas', null, ['amount' => $data['amount']]);
        $this->toast($paid ? "Payment recorded. {$tenant->name} is active until {$end->format('d M Y')}." : 'Subscription invoice issued.');

        return back();
    }

    public function markPaid(Request $request, Subscription $subscription): RedirectResponse
    {
        abort_unless($subscription->status === 'pending', 422);
        $data = $request->validate([
            'paid_at' => ['required', 'date', 'before_or_equal:today'],
            'reference' => ['nullable', 'string', 'max:100'],
        ]);

        DB::transaction(function () use ($subscription, $data) {
            $subscription->update(['status' => 'active', 'paid_at' => $data['paid_at'], 'reference' => ($data['reference'] ?? null) ?: $subscription->reference]);
            $this->activate($subscription->tenant, $subscription);
        });

        $this->audit('subscription_paid', $subscription, "Marked subscription {$subscription->reference} as paid", 'saas');
        $this->toast('Payment recorded and tenant activated.');

        return back();
    }

    public function cancel(Request $request, Subscription $subscription): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        abort_if($subscription->status === 'cancelled', 422);

        $subscription->update(['status' => 'cancelled']);
        $this->audit('subscription_cancelled', $subscription, "Cancelled subscription {$subscription->reference}: {$data['reason']}", 'saas');
        $this->toast('Subscription cancelled.');

        return back();
    }

    private function activate(Tenant $tenant, Subscription $subscription): void
    {
        // Older active periods that end before this one are superseded.
        $tenant->subscriptions()->where('id', '!=', $subscription->id)->where('status', 'active')
            ->whereDate('ends_at', '<', now()->toDateString())->update(['status' => 'expired']);

        $ends = $tenant->subscription_ends_at && $tenant->subscription_ends_at->greaterThan($subscription->ends_at) ? $tenant->subscription_ends_at : $subscription->ends_at;

        $tenant->update([
            'plan_id' => $subscription->plan_id,
            'status' => 'active',
            'subscription_ends_at' => $ends,
        ]);
    }

    private function periodEnd(CarbonInterface $start, string $interval, int $periods): CarbonInterface
    {
        $start = CarbonImmutable::parse($start);

        return match ($interval) {
            'monthly' => $start->addMonths($periods)->subDay(),
            'termly' => $start->addMonths(4 * $periods)->subDay(),
            default => $start->addYears($periods)->subDay(),
        };
    }
}
