<?php

namespace App\Http\Controllers\Students;

use App\Http\Controllers\Controller;
use App\Models\Guardian;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class GuardianController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->string('search')->toString();

        $guardians = Guardian::query()
            ->withCount('students')
            ->with('students:id,first_name,last_name,admission_no')
            ->when($search, fn ($q) => $q->where(fn ($q) => $q
                ->where('first_name', 'like', "%{$search}%")
                ->orWhere('last_name', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")))
            ->orderBy('first_name')
            ->paginate($this->perPage())
            ->withQueryString();

        return Inertia::render('students/guardians', [
            'guardians' => $guardians,
            'filters' => ['search' => $search],
        ]);
    }

    /** JSON lookup used by the "link existing guardian" picker. */
    public function search(Request $request): JsonResponse
    {
        $term = $request->string('q')->toString();

        return response()->json(
            Guardian::query()
                ->where(fn ($q) => $q->where('first_name', 'like', "%{$term}%")->orWhere('last_name', 'like', "%{$term}%")->orWhere('phone', 'like', "%{$term}%"))
                ->limit(10)->get(['id', 'first_name', 'last_name', 'phone'])
                ->map(fn ($g) => ['value' => $g->id, 'label' => "{$g->full_name} · {$g->phone}"]),
        );
    }

    public function store(Request $request): RedirectResponse
    {
        Guardian::create($this->validated($request));
        $this->toast('Guardian added.');

        return back();
    }

    public function update(Request $request, Guardian $guardian): RedirectResponse
    {
        $guardian->update($this->validated($request));
        $this->toast('Guardian updated.');

        return back();
    }

    public function destroy(Guardian $guardian): RedirectResponse
    {
        if ($guardian->students()->exists()) {
            $this->toast('Unlink this guardian from all students before deleting.', 'error');

            return back();
        }

        $guardian->delete();
        $this->toast('Guardian deleted.');

        return back();
    }

    /** Create (or reset) a parent-portal login for the guardian (SRS 4.5). */
    public function portalAccess(Request $request, Guardian $guardian): RedirectResponse
    {
        $request->validate(['email' => ['required', 'email', Rule::unique('users', 'email')->ignore($guardian->user_id)]]);

        $password = Str::password(10, symbols: false);
        $role = Role::where('tenant_id', $this->tenancy()->tenantId())->where('slug', 'parent')->firstOrFail();

        $user = $guardian->user ?? new User;
        $user->fill([
            'name' => $guardian->full_name,
            'email' => $request->input('email'),
            'phone' => $guardian->phone,
            'password' => $password,
            'role_id' => $role->id,
            'school_id' => $this->tenancy()->schoolId(),
            'status' => 'active',
        ]);
        $user->tenant_id = $this->tenancy()->tenantId();
        $user->email_verified_at ??= now();
        $user->save();

        $guardian->update(['user_id' => $user->id, 'email' => $request->input('email')]);

        $this->audit('portal_access', $guardian, "Parent portal access issued to {$guardian->full_name}", 'students');
        $this->toast("Portal login created. Temporary password: {$password}", 'info');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'gender' => ['nullable', Rule::in(['male', 'female'])],
            'phone' => ['required', 'string', 'max:20'],
            'alt_phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:150'],
            'occupation' => ['nullable', 'string', 'max:100'],
            'national_id' => ['nullable', 'string', 'max:40'],
            'address' => ['nullable', 'string', 'max:255'],
            'preferred_channel' => ['nullable', Rule::in(['sms', 'email', 'whatsapp'])],
        ]);
    }
}
