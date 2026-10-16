<?php

namespace App\Http\Middleware;

use App\Models\School;
use App\Services\Messaging\SmsCredits;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'avatar_url' => $user->avatar_url,
                    'is_super_admin' => $user->is_super_admin,
                    'role' => $user->role?->name ?? ($user->is_super_admin ? 'Super Administrator' : null),
                    'role_slug' => $user->role?->slug,
                    'two_factor_enabled' => ! is_null($user->two_factor_confirmed_at),
                ] : null,
                'permissions' => $user?->permissionList() ?? [],
            ],
            // Lazy: resolved after route middleware (platform pages clear the school context).
            'school' => function () {
                $school = app(Tenancy::class)->school();

                return $school ? [
                    'id' => $school->id,
                    'name' => $school->name,
                    'motto' => $school->motto,
                    'logo_url' => $school->logo_url,
                    'currency' => $school->currency,
                    'tenant' => $school->tenant?->name,
                    'tenant_status' => $school->tenant?->status,
                    'plan' => $school->tenant?->plan?->name,
                ] : null;
            },
            // Header school switcher:
            //  - tenant admins: their own tenant's schools;
            //  - platform admins: every school (grouped by tenant), but only while inside a school —
            //    on the platform console they enter schools via SaaS Console → Tenants.
            'schools' => function () use ($user) {
                if (! $user?->canSwitchSchools()) {
                    return [];
                }

                if ($user->is_super_admin) {
                    if (! app(Tenancy::class)->hasSchool()) {
                        return [];
                    }

                    return School::query()
                        ->join('tenants', 'tenants.id', '=', 'schools.tenant_id')
                        ->orderBy('tenants.name')->orderBy('schools.name')
                        ->get(['schools.id', 'schools.name', 'tenants.name as tenant', 'tenants.status as tenant_status'])
                        ->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'tenant' => $s->tenant, 'tenant_status' => $s->tenant_status])
                        ->all();
                }

                return School::query()->where('tenant_id', $user->tenant_id)->orderBy('name')->get(['id', 'name'])->all();
            },
            'notificationsCount' => fn () => $user?->unreadNotifications()->count() ?? 0,
            // Header SMS balance badge (account-wide wallet: plan allowance + purchased bundles).
            'smsBalance' => function () use ($user) {
                $tenant = app(Tenancy::class)->tenant();
                if (! $tenant || ! $user?->hasPermission('communication.view')) {
                    return null;
                }

                $balance = app(SmsCredits::class)->balance($tenant);

                return ['total' => $balance['total'], 'low' => $balance['total'] < max(100, (int) ($balance['plan_limit'] * 0.1))];
            },
        ];
    }
}
