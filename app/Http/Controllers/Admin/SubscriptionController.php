<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\Role;
use App\Models\SupportTicket;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** The tenant's own view of its plan, usage meters and subscription history (SRS 3.4). */
class SubscriptionController extends Controller
{
    public function show(): Response
    {
        $tenant = $this->tenancy()->tenant()->load('plan');
        $plan = $tenant->plan;
        $usage = self::usage($tenant->id);

        return Inertia::render('admin/subscription', [
            'tenant' => [
                'name' => $tenant->name,
                'status' => $tenant->status,
                'trial_ends_at' => $tenant->trial_ends_at?->toDateString(),
                'subscription_ends_at' => $tenant->subscription_ends_at?->toDateString(),
                'days_left' => ($end = $tenant->status === 'trial' ? $tenant->trial_ends_at : $tenant->subscription_ends_at) ? (int) now()->startOfDay()->diffInDays($end, false) : null,
            ],
            'plan' => $plan ? self::planArray($plan) : null,
            'usage' => $usage,
            'history' => $tenant->subscriptions()->with('plan:id,name')->latest('starts_at')->get()->map(fn ($s) => [
                'id' => $s->id,
                'plan' => $s->plan?->name,
                'starts_at' => $s->starts_at?->toDateString(),
                'ends_at' => $s->ends_at?->toDateString(),
                'amount' => (string) $s->amount,
                'status' => $s->status,
                'reference' => $s->reference,
                'paid_at' => $s->paid_at?->toDateString(),
            ]),
            'plans' => Plan::where('is_active', true)->orderBy('price')->get()->map(fn ($p) => self::planArray($p)),
            'tickets' => SupportTicket::where('tenant_id', $tenant->id)->latest()->limit(5)->get(['id', 'subject', 'status', 'priority', 'created_at']),
        ]);
    }

    /** "Request upgrade" raises a support ticket for the platform team. */
    public function requestUpgrade(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', Rule::exists('plans', 'id')->where('is_active', true)],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $tenant = $this->tenancy()->tenant();
        $plan = Plan::findOrFail($data['plan_id']);

        $ticket = SupportTicket::create([
            'tenant_id' => $tenant->id,
            'created_by' => $request->user()->id,
            'subject' => "Plan change request: {$tenant->plan?->name} → {$plan->name}",
            'description' => "School: {$this->tenancy()->school()->name}\nRequested by: {$request->user()->name} ({$request->user()->email})\nRequested plan: {$plan->name} (".number_format((float) $plan->price)." / {$plan->billing_interval})\n\n".($data['notes'] ?? ''),
            'priority' => 'high',
            'status' => 'open',
        ]);

        $this->audit('upgrade_requested', $ticket, "Requested plan change to {$plan->name}", 'administration');
        $this->toast('Upgrade request sent. Our team will contact you shortly.');

        return back();
    }

    /**
     * Usage meters for a tenant across all of its schools.
     *
     * @return array{students: int, users: int, schools: int, sms: int}
     */
    public static function usage(int $tenantId): array
    {
        $portalRoles = Role::where('tenant_id', $tenantId)->get()
            ->filter(fn ($r) => collect($r->permissions ?? [])->isNotEmpty() && collect($r->permissions)->every(fn ($p) => str_starts_with($p, 'portal.')))
            ->pluck('id');

        return [
            'students' => DB::table('students')->where('tenant_id', $tenantId)->whereNull('deleted_at')->where('status', 'active')->count(),
            'users' => DB::table('users')->where('tenant_id', $tenantId)->where('is_super_admin', false)
                ->where(fn ($q) => $q->whereNotIn('role_id', $portalRoles)->orWhereNull('role_id'))->count(),
            'schools' => DB::table('schools')->where('tenant_id', $tenantId)->count(),
            'sms' => (int) DB::table('message_logs')->where('tenant_id', $tenantId)->where('channel', 'sms')
                ->where('status', '!=', 'failed')->where('created_at', '>=', now()->startOfMonth())->sum('credits'),
        ];
    }

    /** @return array<string, mixed> */
    public static function planArray(Plan $p): array
    {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'code' => $p->code,
            'price' => (string) $p->price,
            'billing_interval' => $p->billing_interval,
            'max_students' => $p->max_students,
            'max_users' => $p->max_users,
            'max_schools' => $p->max_schools,
            'sms_credits' => $p->sms_credits,
            'modules' => $p->modules ?? [],
            'is_active' => $p->is_active,
        ];
    }
}
