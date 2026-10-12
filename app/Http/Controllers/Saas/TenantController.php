<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Admin\SubscriptionController as TenantSubscription;
use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\Tenant;
use App\Notifications\SchoolNotification;
use App\Services\SchoolProvisioner;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Tenant lifecycle: provisioning, plan changes, trials, suspension and reactivation (SRS 3.1, 3.4, 4.24). */
class TenantController extends Controller
{
    public const STATUSES = ['trial', 'active', 'grace', 'suspended', 'cancelled'];

    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'plan' => ''], $request->only(['search', 'status', 'plan']));

        $tenants = Tenant::query()
            ->with('plan:id,name')
            ->withCount(['schools', 'users'])
            ->addSelect(['students_count' => DB::table('students')->selectRaw('COUNT(*)')->whereColumn('students.tenant_id', 'tenants.id')->whereNull('deleted_at')->where('status', 'active')])
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('name', 'like', "%{$v}%")->orWhere('email', 'like', "%{$v}%")->orWhere('phone', 'like', "%{$v}%")))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['plan'], fn ($q, $v) => $q->where('plan_id', $v))
            ->latest()
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Tenant $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'email' => $t->email,
                'phone' => $t->phone,
                'plan' => $t->plan?->name,
                'status' => $t->status,
                'schools_count' => $t->schools_count,
                'users_count' => $t->users_count,
                'students_count' => (int) $t->students_count,
                'trial_ends_at' => $t->trial_ends_at?->toDateString(),
                'subscription_ends_at' => $t->subscription_ends_at?->toDateString(),
                'created_at' => $t->created_at?->toIso8601String(),
            ]);

        $byStatus = Tenant::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('saas/tenants/index', [
            'tenants' => $tenants,
            'filters' => $filters,
            'plans' => Plan::orderBy('price')->get(['id', 'name'])->map(fn ($p) => ['value' => $p->id, 'label' => $p->name]),
            'statuses' => collect(self::STATUSES)->map(fn ($s) => ['value' => $s, 'label' => ucfirst($s)]),
            'stats' => [
                'total' => (int) $byStatus->sum(),
                'active' => (int) ($byStatus['active'] ?? 0),
                'trial' => (int) ($byStatus['trial'] ?? 0),
                'suspended' => (int) (($byStatus['suspended'] ?? 0) + ($byStatus['cancelled'] ?? 0)),
            ],
        ]);
    }

    public function store(Request $request, SchoolProvisioner $provisioner): RedirectResponse
    {
        $data = $request->validate([
            'school_name' => ['required', 'string', 'max:150'],
            'admin_name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:30'],
            'level' => ['required', Rule::in(['nursery', 'primary', 'secondary', 'combined'])],
            'residence_type' => ['required', Rule::in(['day', 'boarding', 'mixed'])],
            'region' => ['nullable', 'string', 'max:60'],
            'plan_id' => ['required', Rule::exists('plans', 'id')],
            'trial_days' => ['nullable', 'integer', 'min:0', 'max:365'],
        ]);

        $password = Str::password(10, symbols: false);
        $result = $provisioner->provision([...$data, 'password' => $password], Plan::find($data['plan_id']));

        $tenant = $result['tenant'];
        if (isset($data['trial_days']) && (int) $data['trial_days'] !== 30) {
            $tenant->update(['trial_ends_at' => now()->addDays((int) $data['trial_days'])]);
        }

        $this->audit('tenant_created', $tenant, "Provisioned tenant {$tenant->name} ({$tenant->email})", 'saas');
        $this->toast("Tenant {$tenant->name} provisioned with default roles, chart of accounts and calendar.");

        return to_route('saas.tenants.show', $tenant)->with('credentials', ['name' => $data['admin_name'], 'email' => $data['email'], 'password' => $password]);
    }

    public function show(Tenant $tenant): Response
    {
        $tenant->load(['plan', 'schools' => fn ($q) => $q->orderBy('id')]);

        $studentsBySchool = DB::table('students')->where('tenant_id', $tenant->id)->whereNull('deleted_at')->where('status', 'active')
            ->groupBy('school_id')->selectRaw('school_id, COUNT(*) as total')->pluck('total', 'school_id');
        $usersBySchool = DB::table('users')->where('tenant_id', $tenant->id)->groupBy('school_id')->selectRaw('school_id, COUNT(*) as total')->pluck('total', 'school_id');

        $admins = DB::table('users')
            ->join('roles', 'roles.id', '=', 'users.role_id')
            ->where('users.tenant_id', $tenant->id)->where('roles.slug', 'school-admin')
            ->get(['users.id', 'users.name', 'users.email', 'users.phone', 'users.status', 'users.last_login_at']);

        return Inertia::render('saas/tenants/show', [
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'email' => $tenant->email,
                'phone' => $tenant->phone,
                'country' => $tenant->country,
                'status' => $tenant->status,
                'plan_id' => $tenant->plan_id,
                'plan' => $tenant->plan ? TenantSubscription::planArray($tenant->plan) : null,
                'trial_ends_at' => $tenant->trial_ends_at?->toDateString(),
                'subscription_ends_at' => $tenant->subscription_ends_at?->toDateString(),
                'created_at' => $tenant->created_at?->toIso8601String(),
            ],
            'schools' => $tenant->schools->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->name, 'code' => $s->code, 'level' => $s->level, 'region' => $s->region,
                'is_active' => $s->is_active, 'students' => (int) ($studentsBySchool[$s->id] ?? 0), 'users' => (int) ($usersBySchool[$s->id] ?? 0),
            ]),
            'admins' => $admins,
            'usage' => TenantSubscription::usage($tenant->id),
            'subscriptions' => $tenant->subscriptions()->with('plan:id,name')->latest('starts_at')->get()->map(fn ($s) => [
                'id' => $s->id, 'plan' => $s->plan?->name, 'starts_at' => $s->starts_at?->toDateString(), 'ends_at' => $s->ends_at?->toDateString(),
                'amount' => (string) $s->amount, 'status' => $s->status, 'reference' => $s->reference, 'paid_at' => $s->paid_at?->toDateString(),
            ]),
            'tickets' => \App\Models\SupportTicket::where('tenant_id', $tenant->id)->latest()->limit(10)->get(['id', 'subject', 'priority', 'status', 'created_at']),
            'activity' => DB::table('audit_logs')
                ->leftJoin('users', 'users.id', '=', 'audit_logs.user_id')
                ->where(fn ($q) => $q->where('audit_logs.tenant_id', $tenant->id)->orWhere(fn ($q) => $q->where('audit_logs.auditable_type', $tenant->getMorphClass())->where('audit_logs.auditable_id', $tenant->id)))
                ->where('audit_logs.module', 'saas')
                ->latest('audit_logs.id')->limit(15)
                ->get(['audit_logs.id', 'audit_logs.action', 'audit_logs.description', 'audit_logs.created_at', 'users.name as user']),
            'credentials' => session('credentials'),
            'plans' => Plan::orderBy('price')->get()->map(fn ($p) => ['value' => $p->id, 'label' => $p->name.' — TZS '.number_format((float) $p->price).' / '.$p->billing_interval]),
        ]);
    }

    public function update(Request $request, Tenant $tenant): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'country' => ['required', 'string', 'max:60'],
        ]);

        $old = $tenant->only(array_keys($data));
        $tenant->update($data);
        $this->audit('tenant_updated', $tenant, "Updated tenant details for {$tenant->name}", 'saas', $old, $data);
        $this->toast('Tenant details saved.');

        return back();
    }

    public function changePlan(Request $request, Tenant $tenant): RedirectResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', Rule::exists('plans', 'id')],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $old = $tenant->plan?->name;
        $tenant->update(['plan_id' => $data['plan_id']]);
        $new = $tenant->fresh('plan')->plan?->name;

        $this->audit('plan_changed', $tenant, "Plan changed {$old} → {$new}: {$data['reason']}", 'saas', ['plan' => $old], ['plan' => $new]);
        $this->notifyAdmins($tenant, 'Subscription plan updated', "Your plan is now {$new}.");
        $this->toast("Plan changed to {$new}.");

        return back();
    }

    public function extendTrial(Request $request, Tenant $tenant): RedirectResponse
    {
        $data = $request->validate([
            'days' => ['required', 'integer', 'min:1', 'max:180'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $from = $tenant->trial_ends_at && $tenant->trial_ends_at->isFuture() ? $tenant->trial_ends_at : now();
        $old = $tenant->trial_ends_at?->toDateString();
        $tenant->update([
            'trial_ends_at' => $from->addDays((int) $data['days']),
            'status' => in_array($tenant->status, ['trial', 'suspended', 'grace'], true) ? 'trial' : $tenant->status,
        ]);

        $this->audit('trial_extended', $tenant, "Trial extended by {$data['days']} days: {$data['reason']}", 'saas', ['trial_ends_at' => $old], ['trial_ends_at' => $tenant->trial_ends_at->toDateString()]);
        $this->notifyAdmins($tenant, 'Trial extended', "Your trial now ends on {$tenant->trial_ends_at->format('d/m/Y')}.");
        $this->toast('Trial extended to '.$tenant->trial_ends_at->format('d/m/Y').'.');

        return back();
    }

    /** activate | suspend | reactivate | cancel | grace — every transition needs a reason and is audited. */
    public function changeStatus(Request $request, Tenant $tenant): RedirectResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['activate', 'suspend', 'reactivate', 'cancel', 'grace'])],
            'reason' => ['required', 'string', 'max:500'],
            'subscription_ends_at' => ['nullable', 'date', 'after:today'],
        ]);

        $allowed = [
            'activate' => ['trial', 'grace', 'suspended'],
            'suspend' => ['trial', 'active', 'grace'],
            'reactivate' => ['suspended', 'cancelled'],
            'cancel' => ['trial', 'active', 'grace', 'suspended'],
            'grace' => ['active'],
        ];

        if (! in_array($tenant->status, $allowed[$data['action']], true)) {
            $this->toast("Cannot {$data['action']} a tenant that is {$tenant->status}.", 'error');

            return back();
        }

        $old = $tenant->status;
        $new = match ($data['action']) {
            'activate', 'reactivate' => 'active',
            'suspend' => 'suspended',
            'cancel' => 'cancelled',
            'grace' => 'grace',
        };

        $updates = ['status' => $new];
        if ($new === 'active') {
            $updates['subscription_ends_at'] = $data['subscription_ends_at']
                ?? ($tenant->subscription_ends_at && $tenant->subscription_ends_at->isFuture() ? $tenant->subscription_ends_at : now()->addYear());
        }
        $tenant->update($updates);

        $this->audit('tenant_'.$data['action'], $tenant, ucfirst($data['action'])." tenant {$tenant->name} ({$old} → {$new}): {$data['reason']}", 'saas', ['status' => $old], ['status' => $new]);

        if (in_array($new, ['active', 'grace'], true)) {
            $this->notifyAdmins($tenant, 'Subscription status: '.ucfirst($new), $new === 'grace' ? 'Your subscription is in its grace period. Please renew to avoid suspension.' : 'Your school account is active.');
        }

        $this->toast("{$tenant->name} is now {$new}. Data is retained.");

        return back();
    }

    private function notifyAdmins(Tenant $tenant, string $title, string $message): void
    {
        $admins = $tenant->users()->whereHas('role', fn ($q) => $q->where('slug', 'school-admin'))->where('status', 'active')->get();
        Notification::send($admins, new SchoolNotification($title, $message, '/admin/subscription', 'info'));
    }
}
