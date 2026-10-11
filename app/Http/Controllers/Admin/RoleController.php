<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Roles and the module × view/manage permission matrix (SRS 4.22, 9). */
class RoleController extends Controller
{
    public const PORTAL_PERMISSIONS = ['portal.parent', 'portal.student'];

    public function index(): Response
    {
        $roles = Role::where('tenant_id', $this->tenancy()->tenantId())
            ->withCount('users')
            ->orderByDesc('is_system')->orderBy('name')
            ->get()
            ->map(fn (Role $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'slug' => $r->slug,
                'description' => $r->description,
                'permissions' => array_values($r->permissions ?? []),
                'is_system' => $r->is_system,
                'users_count' => $r->users_count,
                'is_portal' => collect($r->permissions ?? [])->isNotEmpty() && collect($r->permissions)->every(fn ($p) => str_starts_with($p, 'portal.')),
            ]);

        return Inertia::render('admin/roles', [
            'roles' => $roles,
            'modules' => collect(config('permissions.modules'))->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'portalPermissions' => self::PORTAL_PERMISSIONS,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $role = new Role([
            'name' => $data['name'],
            'slug' => $this->uniqueSlug($data['name']),
            'description' => $data['description'] ?? null,
            'permissions' => $data['permissions'],
            'is_system' => false,
        ]);
        $role->tenant_id = $this->tenancy()->tenantId();
        $role->save();

        $this->audit('role_created', $role, "Created role {$role->name}", 'administration', null, ['permissions' => $role->permissions]);
        $this->toast("Role {$role->name} created.");

        return back();
    }

    public function update(Request $request, Role $role): RedirectResponse
    {
        $this->authorizeRole($role);
        $data = $this->validated($request, $role);

        // Guard against an administrator locking everyone out of Administration.
        if ($request->user()->role_id === $role->id && ! in_array('administration.manage', $data['permissions'], true) && ! $request->user()->is_super_admin) {
            $this->toast('You cannot remove "Administration — manage" from your own role.', 'error');

            return back();
        }

        $old = ['name' => $role->name, 'permissions' => $role->permissions];
        $role->update([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'permissions' => $data['permissions'],
        ]);

        $added = array_values(array_diff($data['permissions'], $old['permissions'] ?? []));
        $removed = array_values(array_diff($old['permissions'] ?? [], $data['permissions']));

        $this->audit('role_changed', $role, "Updated role {$role->name}".($added ? ' +['.implode(', ', $added).']' : '').($removed ? ' -['.implode(', ', $removed).']' : ''), 'administration', $old, ['name' => $role->name, 'permissions' => $role->permissions]);
        $this->toast("Role {$role->name} saved.");

        return back();
    }

    public function destroy(Role $role): RedirectResponse
    {
        $this->authorizeRole($role);

        if ($role->is_system) {
            $this->toast('System roles cannot be deleted.', 'error');

            return back();
        }

        if ($role->users()->exists()) {
            $this->toast('Reassign the users of this role before deleting it.', 'error');

            return back();
        }

        $role->delete();
        $this->audit('role_deleted', $role, "Deleted role {$role->name}", 'administration', ['permissions' => $role->permissions]);
        $this->toast('Role deleted.');

        return back();
    }

    private function authorizeRole(Role $role): void
    {
        abort_unless($role->tenant_id === $this->tenancy()->tenantId(), 404);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'role';
        $slug = $base;
        $i = 2;
        while (Role::where('tenant_id', $this->tenancy()->tenantId())->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    /** @return array{name: string, description: ?string, permissions: array<int, string>} */
    private function validated(Request $request, ?Role $role = null): array
    {
        $allowed = collect(array_keys(config('permissions.modules')))
            ->flatMap(fn ($m) => ["$m.view", "$m.manage"])
            ->merge(self::PORTAL_PERMISSIONS)
            ->all();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('roles', 'name')->where('tenant_id', $this->tenancy()->tenantId())->ignore($role?->id)],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::in($allowed)],
        ]);

        $data['permissions'] = array_values(array_unique($data['permissions']));

        return $data;
    }
}
