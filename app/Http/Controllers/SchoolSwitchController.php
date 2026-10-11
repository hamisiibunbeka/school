<?php

namespace App\Http\Controllers;

use App\Models\School;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** Lets tenant owners/admins (and platform admins, for support) switch the active school. */
class SchoolSwitchController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $user = $request->user();
        abort_unless($user->canSwitchSchools(), 403);

        $data = $request->validate(['school_id' => ['nullable', 'integer']]);

        if (empty($data['school_id'])) {
            $request->session()->forget('school_id');

            return redirect($user->is_super_admin ? '/saas' : '/dashboard');
        }

        $school = School::query()
            ->when(! $user->is_super_admin, fn ($q) => $q->where('tenant_id', $user->tenant_id))
            ->findOrFail($data['school_id']);

        $request->session()->put('school_id', $school->id);

        app(\App\Support\Tenancy::class)->setSchool($school);
        $this->audit('switched_school', $school, "Switched into {$school->name}", 'security');
        $this->toast("Now working in {$school->name}");

        return redirect('/dashboard');
    }
}
