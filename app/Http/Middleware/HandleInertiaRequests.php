<?php

namespace App\Http\Middleware;

use App\Models\School;
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
        $school = app(Tenancy::class)->school();

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
            'school' => $school ? [
                'id' => $school->id,
                'name' => $school->name,
                'motto' => $school->motto,
                'logo_url' => $school->logo_url,
                'currency' => $school->currency,
                'tenant' => $school->tenant?->name,
                'tenant_status' => $school->tenant?->status,
                'plan' => $school->tenant?->plan?->name,
            ] : null,
            'schools' => fn () => $user?->canSwitchSchools()
                ? School::query()
                    ->when(! $user->is_super_admin, fn ($q) => $q->where('tenant_id', $user->tenant_id))
                    ->orderBy('name')
                    ->get(['id', 'name'])
                : [],
            'notificationsCount' => fn () => $user?->unreadNotifications()->count() ?? 0,
        ];
    }
}
