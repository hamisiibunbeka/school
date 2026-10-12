<?php

namespace Tests\Feature;

use App\Models\AdmissionApplication;
use App\Models\School;
use App\Models\SchoolClass;
use App\Models\SchoolWebsite;
use App\Models\WebsitePost;
use App\Support\HtmlSanitizer;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class WebsiteTest extends TestCase
{
    use RefreshDatabase;

    private function website(School $school): SchoolWebsite
    {
        return app(Tenancy::class)->runAs($school, fn () => SchoolWebsite::firstOrFail());
    }

    private function publish(School $school): void
    {
        $this->website($school)->forceFill(['is_published' => true])->save();
    }

    public function test_new_school_gets_an_unpublished_website(): void
    {
        ['school' => $school] = $this->makeSchool('Kilimani Academy');

        $this->assertNotEmpty($school->slug);
        $this->assertFalse($this->website($school)->is_published);

        $this->get("/sites/{$school->slug}")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('site/unavailable')->where('reason', 'coming_soon'));
    }

    public function test_staff_can_preview_an_unpublished_site(): void
    {
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();

        $this->actingAs($admin)->get("/sites/{$school->slug}")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('site/home')->where('site.is_preview', true));
    }

    public function test_published_site_renders_every_public_page(): void
    {
        ['school' => $school] = $this->makeSchool('Uhuru Secondary School');
        $this->publish($school);

        $this->get("/sites/{$school->slug}")->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('site/home')->where('site.name', 'Uhuru Secondary School')->has('home.hero'));

        foreach (['about', 'academics', 'news', 'contact', 'admissions'] as $path) {
            $this->get("/sites/{$school->slug}/{$path}")->assertOk();
        }
        $this->get('/sites/no-such-school')->assertNotFound();
    }

    public function test_suspended_school_site_is_unavailable(): void
    {
        ['school' => $school] = $this->makeSchool();
        $this->publish($school);
        $school->tenant->update(['status' => 'suspended']);

        $this->get("/sites/{$school->slug}")->assertStatus(503)
            ->assertInertia(fn (Assert $page) => $page->component('site/unavailable')->where('reason', 'suspended'));
    }

    public function test_online_application_lands_in_the_admissions_list(): void
    {
        Storage::fake('local');
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        $this->publish($school);
        $class = app(Tenancy::class)->runAs($school, fn () => SchoolClass::create(['name' => 'Form One', 'level' => 1]));

        $response = $this->post("/sites/{$school->slug}/admissions", [
            'first_name' => 'Neema',
            'last_name' => 'Mushi',
            'gender' => 'female',
            'date_of_birth' => now()->subYears(13)->toDateString(),
            'school_class_id' => $class->id,
            'residence_type' => 'day',
            'guardian_name' => 'Grace Mushi',
            'guardian_relationship' => 'Mother',
            'guardian_phone' => '0712 345 678',
            'guardian_occupation' => 'Nurse',
            'consent' => '1',
            'documents' => [UploadedFile::fake()->create('birth-certificate.pdf', 120, 'application/pdf')],
        ]);

        $application = app(Tenancy::class)->runAs($school, fn () => AdmissionApplication::where('source', 'online')->firstOrFail());
        $response->assertRedirect("/sites/{$school->slug}/admissions/submitted/{$application->tracking_code}");
        $this->assertSame('submitted', $application->status);
        $this->assertSame('Nurse', $application->guardian_occupation);

        $this->actingAs($admin)->get('/admissions?source=online')->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('admissions/index')
                ->where('applications.data.0.source', 'online')
                ->where('sourceCounts.online', 1));

        // Parents can track it with the code + phone; a wrong phone reveals nothing.
        $this->get("/sites/{$school->slug}/admissions/track?reference={$application->tracking_code}&phone=+255712345678")
            ->assertInertia(fn (Assert $page) => $page->where('application.name', 'Neema Mushi'));
        $this->get("/sites/{$school->slug}/admissions/track?reference={$application->tracking_code}&phone=0799999999")
            ->assertInertia(fn (Assert $page) => $page->where('application', null)->where('notFound', true));
    }

    public function test_honeypot_submissions_are_dropped(): void
    {
        ['school' => $school] = $this->makeSchool();
        $this->publish($school);

        $this->post("/sites/{$school->slug}/admissions", ['first_name' => 'Bot', 'website' => 'http://spam.test']);

        $this->assertSame(0, app(Tenancy::class)->runAs($school, fn () => AdmissionApplication::count()));
    }

    public function test_plan_restricts_templates(): void
    {
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        $plan = \App\Services\Website\WebsiteEntitlements::for($school);
        $locked = collect(array_keys(config('website.templates')))->first(fn ($t) => ! $plan->allowsTemplate($t));

        if ($locked === null) {
            $this->markTestSkipped('Every template is available on the default plan.');
        }

        $this->actingAs($admin)->put('/website', ['template' => $locked])->assertSessionHasErrors('template');
        $this->assertNotSame($locked, $this->website($school)->template);

        $allowed = $plan->templates()[0];
        $this->actingAs($admin)->put('/website', ['template' => $allowed])->assertSessionHasNoErrors();
        $this->assertSame($allowed, $this->website($school)->fresh()->template);
    }

    public function test_custom_plans_inherit_a_tier_and_can_override_features(): void
    {
        $this->seed(\Database\Seeders\PlatformSeeder::class);
        $premium = \App\Models\Plan::create(['name' => 'PREMIUM', 'code' => 'PR', 'price' => 9000000, 'billing_interval' => 'yearly', 'max_schools' => 1, 'sms_credits' => 0, 'modules' => ['website']]);

        // A custom plan priced above Enterprise gets Enterprise website features…
        $this->assertSame('enterprise', \App\Services\Website\WebsiteEntitlements::tierFor($premium));
        $this->assertTrue(\App\Services\Website\WebsiteEntitlements::resolve($premium)['custom_domain']);

        // …and the platform admin can override them per plan.
        $premium->update(['website_features' => ['templates' => ['classic'], 'custom_domain' => false]]);
        $features = \App\Services\Website\WebsiteEntitlements::resolve($premium->fresh());
        $this->assertSame(['classic'], $features['templates']);
        $this->assertFalse($features['custom_domain']);
        $this->assertTrue($features['online_admission']);

        // A plan without the website module takes the public site offline.
        ['school' => $school] = $this->makeSchool();
        $this->publish($school);
        $school->tenant->update(['plan_id' => $premium->id]);
        $premium->update(['modules' => ['dashboard']]);
        $this->get("/sites/{$school->slug}")->assertStatus(503);
    }

    public function test_cms_content_is_sanitised_and_published(): void
    {
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        $this->publish($school);

        $this->actingAs($admin)->put('/website', [
            'about_body' => '<p onclick="steal()">Hello <strong>world</strong></p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
            'hero_title' => 'Karibu!',
        ])->assertSessionHasNoErrors();

        $body = $this->website($school)->about_body;
        $this->assertStringContainsString('<strong>world</strong>', $body);
        $this->assertStringNotContainsString('script', $body);
        $this->assertStringNotContainsString('onclick', $body);
        $this->assertStringNotContainsString('javascript:', $body);

        auth()->logout();
        $this->get("/sites/{$school->slug}")->assertInertia(fn (Assert $page) => $page->where('home.hero.title', 'Karibu!'));
        $this->assertSame('<p>ok</p>', HtmlSanitizer::clean('<p style="x">ok</p>'));
    }

    public function test_sites_are_isolated_between_schools(): void
    {
        ['school' => $a, 'admin' => $adminA] = $this->makeSchool('Alpha School');
        ['school' => $b] = $this->makeSchool('Beta School');
        $this->publish($a);
        $this->publish($b);

        $this->actingAs($adminA)->post('/website/posts', ['type' => 'news', 'title' => 'Alpha wins the cup', 'status' => 'published'])->assertSessionHasNoErrors();
        $slug = app(Tenancy::class)->runAs($a, fn () => WebsitePost::firstOrFail()->slug);
        auth()->logout();

        $this->get("/sites/{$a->slug}/news/{$slug}")->assertOk();
        $this->get("/sites/{$b->slug}/news/{$slug}")->assertNotFound();
        $this->get("/sites/{$b->slug}/news")->assertInertia(fn (Assert $page) => $page->where('posts.data', []));
    }

    public function test_viewer_without_manage_permission_cannot_edit(): void
    {
        ['school' => $school] = $this->makeSchool();
        $officer = $this->makeUserWithRole($school, 'admissions-officer');

        $this->actingAs($officer)->get('/website')->assertOk();
        $this->actingAs($officer)->put('/website', ['hero_title' => 'Hacked'])->assertForbidden();
    }
}
