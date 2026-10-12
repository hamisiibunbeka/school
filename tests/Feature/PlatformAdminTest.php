<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/** Platform administrators work in the SaaS console and enter schools only via Tenants. */
class PlatformAdminTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(): User
    {
        $user = new User(['name' => 'Platform Admin', 'email' => 'root@platform.test', 'password' => 'password']);
        $user->is_super_admin = true;
        $user->save();

        return $user;
    }

    public function test_login_lands_on_platform_without_school_context(): void
    {
        $this->superAdmin();
        $this->makeSchool('Alpha School');

        $this->post('/login', ['email' => 'root@platform.test', 'password' => 'password'])->assertRedirect('/dashboard');
        $this->get('/dashboard')->assertRedirect(route('saas.dashboard'));

        $this->get('/saas')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('school', null)
            ->where('schools', []));
    }

    public function test_enter_school_via_tenant_and_switch_back_to_platform(): void
    {
        $admin = $this->superAdmin();
        ['school' => $school] = $this->makeSchool('Alpha School');

        $this->actingAs($admin)->post('/switch-school', ['school_id' => $school->id])->assertRedirect('/dashboard');
        $this->get('/students')->assertOk()->assertInertia(fn (Assert $page) => $page->where('school.id', $school->id));

        // Platform pages always run without the school context, even mid-session.
        $this->get('/saas')->assertOk()->assertInertia(fn (Assert $page) => $page->where('school', null));

        // "Back to platform"
        $this->post('/switch-school', ['school_id' => null])->assertRedirect('/saas');
        $this->get('/students')->assertRedirect(route('saas.dashboard'));
    }

    public function test_inside_a_school_the_switcher_lists_every_tenants_schools(): void
    {
        $admin = $this->superAdmin();
        ['school' => $alpha] = $this->makeSchool('Alpha School');
        ['school' => $beta] = $this->makeSchool('Beta Academy');

        $this->actingAs($admin)->post('/switch-school', ['school_id' => $alpha->id]);

        $this->get('/students')->assertInertia(fn (Assert $page) => $page
            ->has('schools', 2)
            ->where('schools.0.name', 'Alpha School')
            ->where('schools.0.tenant', 'Alpha School')
            ->where('schools.1.name', 'Beta Academy'));

        // Jump straight to another tenant's school from the header.
        $this->post('/switch-school', ['school_id' => $beta->id])->assertRedirect('/dashboard');
        $this->get('/students')->assertInertia(fn (Assert $page) => $page->where('school.id', $beta->id));
    }

    public function test_school_admin_cannot_reach_platform(): void
    {
        ['admin' => $admin] = $this->makeSchool();

        $this->actingAs($admin)->get('/saas')->assertForbidden();
    }
}
