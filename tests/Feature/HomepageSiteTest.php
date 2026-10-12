<?php

namespace Tests\Feature;

use App\Models\PlatformSetting;
use App\Models\School;
use App\Models\SchoolWebsite;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class HomepageSiteTest extends TestCase
{
    use RefreshDatabase;

    private function website(School $school): SchoolWebsite
    {
        return app(Tenancy::class)->runAs($school, fn () => SchoolWebsite::firstOrFail());
    }

    private function superAdmin(): User
    {
        $user = new User(['name' => 'Platform Admin', 'email' => 'root@platform.test', 'password' => 'password']);
        $user->is_super_admin = true;
        $user->save();

        return $user;
    }

    public function test_home_redirects_to_login_when_feature_is_off(): void
    {
        ['admin' => $admin] = $this->makeSchool();

        $this->get('/')->assertRedirect('/login');
        $this->actingAs($admin)->get('/')->assertRedirect('/dashboard');
    }

    public function test_home_loads_the_chosen_school_website(): void
    {
        ['school' => $school] = $this->makeSchool('Uhuru Secondary School');
        $this->website($school)->forceFill(['is_published' => true])->save();
        PlatformSetting::put('homepage', ['enabled' => true, 'school_id' => $school->id]);

        $this->get('/')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('site/home')
            ->where('site.name', 'Uhuru Secondary School')
            ->where('site.nav.0.href', '/')
            ->where('site.nav', fn ($nav) => collect($nav)->contains(fn ($n) => $n['href'] === '/login' && ($n['portal'] ?? false))));

        // Other pages keep working under the school's path and link Home back to "/".
        $this->get("/sites/{$school->slug}/about")->assertInertia(fn (Assert $page) => $page->where('site.nav.0.href', '/'));
    }

    public function test_home_falls_back_to_login_when_site_is_unpublished_or_suspended(): void
    {
        ['school' => $school] = $this->makeSchool();
        PlatformSetting::put('homepage', ['enabled' => true, 'school_id' => $school->id]);

        $this->get('/')->assertRedirect('/login'); // not published yet

        $this->website($school)->forceFill(['is_published' => true])->save();
        $this->get('/')->assertOk();

        $school->tenant->update(['status' => 'suspended']);
        $this->get('/')->assertRedirect('/login');
    }

    public function test_custom_domain_serves_its_school_site_at_root(): void
    {
        ['school' => $school] = $this->makeSchool('Alpha Academy');
        $plan = \App\Models\Plan::create(['name' => 'Enterprise', 'code' => 'enterprise', 'price' => 3500000, 'billing_interval' => 'yearly', 'max_schools' => 10, 'sms_credits' => 0, 'modules' => ['website']]);
        $school->tenant->update(['plan_id' => $plan->id]);
        $this->website($school)->forceFill(['is_published' => true, 'custom_domain' => 'alpha.ac.tz'])->save();

        $this->get('http://www.alpha.ac.tz/')->assertOk()->assertInertia(fn (Assert $page) => $page->where('site.name', 'Alpha Academy'));
        $this->get('http://localhost/')->assertRedirect('/login');
    }

    public function test_only_platform_admins_manage_the_setting(): void
    {
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();

        $this->actingAs($admin)->put('/saas/settings', ['enabled' => true, 'school_id' => $school->id])->assertForbidden();

        $this->actingAs($this->superAdmin())->get('/saas/settings')->assertOk()->assertInertia(fn (Assert $page) => $page->component('saas/settings')->has('schools', 1));
        $this->put('/saas/settings', ['enabled' => true])->assertSessionHasErrors('school_id');
        $this->put('/saas/settings', ['enabled' => true, 'school_id' => $school->id])->assertSessionHasNoErrors();

        $this->assertSame(['enabled' => true, 'school_id' => $school->id], PlatformSetting::get('homepage'));
    }
}
