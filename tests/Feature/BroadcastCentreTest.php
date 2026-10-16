<?php

namespace Tests\Feature;

use App\Mail\BroadcastMail;
use App\Models\AdmissionApplication;
use App\Models\Broadcast;
use App\Models\ContactGroup;
use App\Models\Employee;
use App\Models\Guardian;
use App\Models\MessageLog;
use App\Models\Plan;
use App\Models\School;
use App\Models\SmsOrder;
use App\Models\SmsPackage;
use App\Models\User;
use App\Services\Messaging\SmsCredits;
use App\Services\Messaging\SmsGateway;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BroadcastCentreTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
    }

    private function in(callable $fn): mixed
    {
        return app(Tenancy::class)->runAs($this->school, $fn);
    }

    private function parent(string $phone, ?string $email = null, array $student = []): Guardian
    {
        $s = $this->makeStudent($this->school, $student);

        return $this->in(function () use ($s, $phone, $email) {
            $g = Guardian::create(['first_name' => 'Mama', 'last_name' => fake()->lastName(), 'phone' => $phone, 'email' => $email]);
            $g->students()->attach($s->id, ['is_primary' => true]);

            return $g;
        });
    }

    private function broadcast(array $data): TestResponse
    {
        return $this->actingAs($this->admin)->post('/communication/broadcasts', array_merge([
            'action' => 'send',
            'title' => 'Closing day',
            'channel' => 'sms',
            'body' => 'Dear {name}, school closes on Friday.',
            'audiences' => [['type' => 'guardians']],
        ], $data));
    }

    public function test_sms_is_blocked_without_credits_and_metered_with_them(): void
    {
        $this->parent('0754000111');

        $this->broadcast([])->assertRedirect();
        $this->assertSame(0, MessageLog::withoutGlobalScopes()->count(), 'Nothing is sent when the balance cannot cover the broadcast.');

        $this->giveSmsCredits($this->school, 10);
        $this->broadcast([])->assertSessionHasNoErrors();

        $this->assertSame(1, MessageLog::withoutGlobalScopes()->where('status', 'sent')->count());
        $this->assertSame(9, app(SmsCredits::class)->balance($this->school->tenant)['total']);
    }

    public function test_gateway_refuses_sms_when_the_wallet_is_empty(): void
    {
        $log = $this->in(fn () => app(SmsGateway::class)->send('sms', '+255754000111', 'Hello'));

        $this->assertSame('failed', $log->status);
        $this->assertStringContainsString('Insufficient SMS credits', $log->error);
    }

    public function test_plan_allowance_is_spent_before_purchased_credits_and_resets_monthly(): void
    {
        $plan = Plan::create(['name' => 'Test', 'code' => 'test-'.uniqid(), 'price' => 0, 'sms_credits' => 2]);
        $tenant = $this->school->tenant;
        $tenant->update(['plan_id' => $plan->id]);
        $this->giveSmsCredits($this->school, 5);
        $credits = app(SmsCredits::class);

        $this->assertSame(['plan' => 2, 'purchased' => 5, 'total' => 7, 'plan_limit' => 2], $credits->balance($tenant->fresh()));
        $this->assertSame(['plan' => 2, 'purchased' => 1], $credits->consume($tenant->id, 3));
        $this->assertNull($credits->consume($tenant->id, 5), 'Cannot overspend.');
        $this->assertSame(4, $credits->balance($tenant->fresh())['total']);

        $this->travel(1)->months();
        $this->assertSame(['plan' => 2, 'purchased' => 4, 'total' => 6, 'plan_limit' => 2], $credits->balance($tenant->fresh()));
    }

    public function test_multiple_audiences_are_merged_without_duplicates(): void
    {
        $this->giveSmsCredits($this->school);
        $this->parent('0754000111');
        $this->parent('0754000222');
        $this->in(function () {
            Employee::create(['employee_no' => 'E1', 'first_name' => 'Juma', 'last_name' => 'Ali', 'phone' => '0713000333', 'category' => 'non_teaching']);
            Employee::create(['employee_no' => 'E2', 'first_name' => 'Neema', 'last_name' => 'Mosha', 'phone' => '0713000444', 'category' => 'teaching']);
            $group = ContactGroup::create(['name' => 'Board']);
            $group->members()->create(['name' => 'Chair', 'phone' => '+255754000111']); // also a parent
        });
        $group = $this->in(fn () => ContactGroup::first());

        $this->broadcast(['audiences' => [
            ['type' => 'guardians'],
            ['type' => 'staff', 'category' => 'non_teaching'],
            ['type' => 'group', 'contact_group_id' => $group->id],
            ['type' => 'custom', 'numbers' => '0754 000 222, 0700 999 888'],
        ]])->assertSessionHasNoErrors();

        $broadcast = $this->in(fn () => Broadcast::firstOrFail());
        $this->assertSame('completed', $broadcast->status);
        $this->assertSame(4, $broadcast->sent); // 2 parents + 1 non-teaching staff + 1 new custom number
        $this->assertEqualsCanonicalizing(
            ['+255754000111', '+255754000222', '+255713000333', '+255700999888'],
            MessageLog::withoutGlobalScopes()->pluck('recipient')->all(),
        );
        $this->assertSame(1, MessageLog::withoutGlobalScopes()->where('recipient', '+255713000333')->where('message', 'Dear Juma Ali, school closes on Friday.')->count());
    }

    public function test_email_broadcasts_are_really_mailed_and_use_no_credits(): void
    {
        Mail::fake();
        $this->parent('0754000111', 'mama@example.com');
        $this->in(fn () => AdmissionApplication::create([
            'application_no' => 'APP-1', 'first_name' => 'New', 'last_name' => 'Kid', 'gender' => 'male',
            'guardian_name' => 'Baba Kid', 'guardian_phone' => '0754999000', 'guardian_email' => 'baba@example.com', 'status' => 'accepted',
        ]));

        $this->broadcast([
            'channel' => 'email',
            'subject' => 'Welcome {name}',
            'audiences' => [['type' => 'guardians'], ['type' => 'applicants', 'status' => ['accepted']]],
        ])->assertSessionHasNoErrors();

        Mail::assertSent(BroadcastMail::class, 2);
        Mail::assertSent(BroadcastMail::class, fn ($m) => $m->hasTo('baba@example.com') && $m->mailSubject === 'Welcome Baba Kid');
        $this->assertSame(0, (int) MessageLog::withoutGlobalScopes()->sum('credits'));
    }

    public function test_scheduled_broadcast_is_sent_by_the_scheduler_when_due(): void
    {
        $this->giveSmsCredits($this->school);
        $this->parent('0754000111');

        $this->broadcast(['action' => 'schedule', 'scheduled_at' => now()->addHour()->format('Y-m-d\TH:i')])->assertSessionHasNoErrors();
        $broadcast = $this->in(fn () => Broadcast::firstOrFail());
        $this->assertSame('scheduled', $broadcast->status);

        $this->artisan('broadcasts:dispatch');
        $this->assertSame('scheduled', $broadcast->fresh()->status, 'Not yet due.');

        $this->travel(2)->hours();
        $this->artisan('broadcasts:dispatch');
        $this->assertSame('completed', $broadcast->fresh()->status);
        $this->assertSame(1, $broadcast->fresh()->sent);
    }

    public function test_sms_purchase_flow_credits_the_account_once(): void
    {
        $package = SmsPackage::create(['name' => 'Standard', 'credits' => 5000, 'price' => 100000]);

        $this->actingAs($this->admin)->post('/communication/sms-credits/orders', ['sms_package_id' => $package->id])->assertSessionHasNoErrors();
        $order = SmsOrder::firstOrFail();
        $this->assertSame('pending', $order->status);

        $this->actingAs($this->admin)->post("/communication/sms-credits/orders/{$order->id}/payment", [
            'payment_method' => 'mobile_money', 'payment_reference' => 'QJK7ABC123',
        ])->assertSessionHasNoErrors();
        $this->assertSame('submitted', $order->fresh()->status);

        $super = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($super)->post("/saas/sms/orders/{$order->id}/confirm")->assertSessionHasNoErrors();
        $this->actingAs($super)->post("/saas/sms/orders/{$order->id}/confirm");

        $this->assertSame('paid', $order->fresh()->status);
        $this->assertSame(5000, $this->school->tenant->fresh()->sms_balance);
        $this->assertDatabaseCount('sms_credit_transactions', 1);
    }

    public function test_schools_cannot_touch_other_accounts_orders(): void
    {
        $package = SmsPackage::create(['name' => 'Standard', 'credits' => 5000, 'price' => 100000]);
        ['admin' => $other] = $this->makeSchool('Other School');
        $this->actingAs($other)->post('/communication/sms-credits/orders', ['sms_package_id' => $package->id]);
        $order = SmsOrder::firstOrFail();

        $this->actingAs($this->admin)->post("/communication/sms-credits/orders/{$order->id}/payment", ['payment_method' => 'cash', 'payment_reference' => 'X'])->assertNotFound();
        $this->actingAs($this->admin)->post('/saas/sms/orders/'.$order->id.'/confirm')->assertForbidden();
        $this->assertSame('pending', $order->fresh()->status);
    }

    public function test_header_balance_and_pages_render(): void
    {
        $this->giveSmsCredits($this->school, 250);
        SmsPackage::create(['name' => 'Starter', 'credits' => 1000, 'price' => 25000]);

        $this->actingAs($this->admin)->get('/communication/broadcasts')->assertInertia(fn (Assert $p) => $p
            ->component('communication/broadcasts/index')
            ->where('smsBalance.total', 250)
            ->where('balance.total', 250));
        $this->actingAs($this->admin)->get('/communication/broadcasts/create')->assertInertia(fn (Assert $p) => $p->component('communication/broadcasts/create'));
        $this->actingAs($this->admin)->get('/communication/sms-credits')->assertInertia(fn (Assert $p) => $p->component('communication/sms-credits')->has('packages', 1));
        $this->actingAs($this->admin)->get('/communication/groups')->assertOk();
        $this->actingAs($this->admin)->get('/communication/messages')->assertOk();

        $super = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($super)->get('/saas/sms')->assertInertia(fn (Assert $p) => $p->component('saas/sms')->has('packages', 1));
    }

    public function test_preview_reports_counts_credits_and_shortfall(): void
    {
        $this->parent('0754000111');
        $this->parent('0754000222');

        $this->actingAs($this->admin)->postJson('/communication/broadcasts/preview', [
            'channel' => 'sms',
            'body' => str_repeat('a', 170), // 2 SMS parts
            'audiences' => [['type' => 'guardians']],
        ])->assertOk()->assertJson(['sms' => 2, 'credits' => 4, 'balance' => 0, 'enough' => false]);
    }
}
