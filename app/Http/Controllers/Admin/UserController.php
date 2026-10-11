<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** School user accounts: create, edit, enable/disable and password resets (SRS 4.2, 9). */
class UserController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'role' => '', 'status' => '', 'type' => ''], $request->only(['search', 'role', 'status', 'type']));
        $roles = $this->roles();
        $portalRoleIds = $roles->filter(fn ($r) => $r['is_portal'])->pluck('value')->all();

        $users = $this->schoolUsers()
            ->with('role:id,name,slug')
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('name', 'like', "%{$v}%")->orWhere('email', 'like', "%{$v}%")->orWhere('phone', 'like', "%{$v}%")))
            ->when($filters['role'], fn ($q, $v) => $q->where('role_id', $v))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['type'] === 'staff', fn ($q) => $q->where(fn ($q) => $q->whereNotIn('role_id', $portalRoleIds)->orWhereNull('role_id')))
            ->when($filters['type'] === 'portal', fn ($q) => $q->whereIn('role_id', $portalRoleIds))
            ->orderBy('name')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'phone' => $u->phone,
                'avatar_url' => $u->avatar_url,
                'role_id' => $u->role_id,
                'role' => $u->role?->name,
                'role_slug' => $u->role?->slug,
                'is_portal' => in_array($u->role_id, $portalRoleIds, true),
                'status' => $u->status,
                'two_factor' => ! is_null($u->two_factor_confirmed_at),
                'last_login_at' => $u->last_login_at?->toIso8601String(),
                'created_at' => $u->created_at?->toIso8601String(),
            ]);

        $base = $this->schoolUsers();
        $plan = $this->tenancy()->tenant()?->plan;

        return Inertia::render('admin/users', [
            'users' => $users,
            'filters' => $filters,
            'roles' => $roles->values(),
            'credentials' => session('credentials'),
            'limit' => ['max' => $plan?->max_users, 'used' => $this->staffUserCount()],
            'stats' => [
                'total' => (clone $base)->count(),
                'active' => (clone $base)->where('status', 'active')->count(),
                'disabled' => (clone $base)->where('status', 'disabled')->count(),
                'portal' => (clone $base)->whereIn('role_id', $portalRoleIds)->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $plan = $this->tenancy()->tenant()?->plan;
        $role = Role::find($data['role_id']);
        if ($plan?->max_users && ! $this->isPortalRole($role) && $this->staffUserCount() >= $plan->max_users) {
            $this->toast("Your {$plan->name} plan allows {$plan->max_users} staff users. Upgrade the subscription to add more.", 'error');

            return back();
        }

        $password = Str::password(10, symbols: false);
        $user = new User([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role_id' => $data['role_id'],
            'school_id' => $this->tenancy()->schoolId(),
            'status' => 'active',
            'password' => $password,
        ]);
        $user->tenant_id = $this->tenancy()->tenantId();
        $user->email_verified_at = now();
        $user->save();

        $this->audit('created', $user, "Created user {$user->name} ({$user->email}) with role {$role?->name}", 'administration', null, ['email' => $user->email, 'role' => $role?->name]);
        $this->toast("User {$user->name} created.");

        return back()->with('credentials', ['name' => $user->name, 'email' => $user->email, 'password' => $password]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $this->authorizeUser($user);
        $data = $this->validated($request, $user);

        if ($user->id === $request->user()->id && (int) $data['role_id'] !== (int) $user->role_id) {
            $this->toast('You cannot change your own role. Ask another administrator.', 'error');

            return back();
        }

        $oldRole = $user->role?->name;
        $old = $user->only(['name', 'email', 'phone', 'role_id']);
        $user->fill(collect($data)->only(['name', 'email', 'phone', 'role_id'])->all())->save();
        $user->load('role');

        if ((int) $old['role_id'] !== (int) $user->role_id) {
            $this->audit('role_changed', $user, "Changed role of {$user->name} from {$oldRole} to {$user->role?->name}", 'administration', ['role' => $oldRole], ['role' => $user->role?->name]);
        }
        $this->audit('updated', $user, "Updated user {$user->name}", 'administration', $old, $user->only(array_keys($old)));
        $this->toast('User updated.');

        return back();
    }

    public function toggleStatus(Request $request, User $user): RedirectResponse
    {
        $this->authorizeUser($user);

        if ($user->id === $request->user()->id) {
            $this->toast('You cannot disable your own account.', 'error');

            return back();
        }

        $new = $user->status === 'active' ? 'disabled' : 'active';
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:300']])['reason'] ?? null;
        $user->forceFill(['status' => $new])->save();

        $this->audit($new === 'active' ? 'enabled' : 'disabled', $user, ucfirst($new === 'active' ? 'enabled' : 'disabled')." user {$user->name}".($reason ? ": {$reason}" : ''), 'administration', ['status' => $new === 'active' ? 'disabled' : 'active'], ['status' => $new]);
        $this->toast($new === 'active' ? "{$user->name} can sign in again." : "{$user->name} has been disabled.");

        return back();
    }

    public function resetPassword(Request $request, User $user): RedirectResponse
    {
        $this->authorizeUser($user);

        $password = Str::password(10, symbols: false);
        $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();

        $this->audit('password_reset', $user, "Reset password for {$user->name}", 'administration');
        $this->toast('Temporary password generated.');

        return back()->with('credentials', ['name' => $user->name, 'email' => $user->email, 'password' => $password]);
    }

    /** Users that belong to the current school of the current tenant. */
    private function schoolUsers()
    {
        return User::query()
            ->where('tenant_id', $this->tenancy()->tenantId())
            ->where('school_id', $this->tenancy()->schoolId())
            ->where('is_super_admin', false);
    }

    private function staffUserCount(): int
    {
        $portal = Role::where('tenant_id', $this->tenancy()->tenantId())->get()->filter(fn ($r) => $this->isPortalRole($r))->pluck('id');

        return User::where('tenant_id', $this->tenancy()->tenantId())->where('is_super_admin', false)
            ->where(fn ($q) => $q->whereNotIn('role_id', $portal)->orWhereNull('role_id'))->count();
    }

    private function authorizeUser(User $user): void
    {
        abort_unless($user->tenant_id === $this->tenancy()->tenantId() && $user->school_id === $this->tenancy()->schoolId() && ! $user->is_super_admin, 404);
    }

    private function isPortalRole(?Role $role): bool
    {
        $perms = $role?->permissions ?? [];

        return $perms !== [] && collect($perms)->every(fn ($p) => str_starts_with($p, 'portal.'));
    }

    /** @return \Illuminate\Support\Collection<int, array{value:int,label:string,slug:string,is_portal:bool}> */
    private function roles()
    {
        return Role::where('tenant_id', $this->tenancy()->tenantId())->orderBy('name')->get()
            ->map(fn (Role $r) => ['value' => $r->id, 'label' => $r->name, 'slug' => $r->slug, 'is_portal' => $this->isPortalRole($r)]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?User $user = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($user?->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'role_id' => ['required', Rule::exists('roles', 'id')->where('tenant_id', $this->tenancy()->tenantId())],
            'allow_portal' => ['boolean'],
        ], [], ['role_id' => 'role']);

        $role = Role::find($data['role_id']);
        if ($this->isPortalRole($role) && ! $request->boolean('allow_portal') && (! $user || $user->role_id !== $role->id)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'role_id' => 'This is a portal-only role. Tick "This is a parent/student portal account" to assign it, or link guardians from the Guardians page.',
            ]);
        }

        return $data;
    }
}
