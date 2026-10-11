<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_page_renders(): void
    {
        $this->get('/login')->assertOk()->assertInertia(fn (Assert $page) => $page->component('auth/login'));
    }

    public function test_school_admin_can_log_in_and_reach_dashboard(): void
    {
        ['admin' => $admin] = $this->makeSchool();

        $this->post('/login', ['email' => $admin->email, 'password' => 'password'])->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($admin);

        $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->component('dashboard')->has('students'));
    }

    public function test_wrong_password_is_rejected(): void
    {
        ['admin' => $admin] = $this->makeSchool();

        $this->post('/login', ['email' => $admin->email, 'password' => 'wrong'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_disabled_user_cannot_log_in(): void
    {
        ['admin' => $admin] = $this->makeSchool();
        $admin->update(['status' => 'disabled']);

        $this->post('/login', ['email' => $admin->email, 'password' => 'password']);
        $this->assertGuest();
    }

    public function test_registration_provisions_a_new_school_tenant(): void
    {
        $this->post('/register', [
            'school_name' => 'Uhuru Academy',
            'name' => 'Neema Mushi',
            'email' => 'neema@uhuru.test',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertRedirect('/dashboard');

        $user = User::where('email', 'neema@uhuru.test')->firstOrFail();
        $school = School::findOrFail($user->school_id);

        $this->assertSame('Uhuru Academy', $school->name);
        $this->assertSame('school-admin', $user->role->slug);
        $this->assertSame('trial', $school->tenant->status);
        $this->assertDatabaseHas('accounts', ['school_id' => $school->id, 'code' => '1300']);
    }

    public function test_suspended_tenant_is_redirected(): void
    {
        ['admin' => $admin, 'school' => $school] = $this->makeSchool();
        $school->tenant->update(['status' => 'suspended']);

        $this->actingAs($admin)->get('/dashboard')->assertRedirect(route('subscription.suspended'));
    }
}
