<?php

namespace Tests\Feature;

use App\Models\MessageLog;
use App\Models\School;
use App\Models\User;
use App\Services\Messaging\Beem\BeemClient;
use App\Services\Messaging\Beem\BeemSmsGateway;
use App\Services\Messaging\GsmText;
use App\Services\Messaging\MessageDispatcher;
use App\Services\Messaging\SmsGateway;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BeemSmsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.sms.driver' => 'beem',
            'services.beem.api_key' => 'test-key',
            'services.beem.secret_key' => 'test-secret',
            'services.beem.sender_id' => 'INFO',
        ]);
    }

    private function sendAs(School $school, string $to, string $text): MessageLog
    {
        return app(Tenancy::class)->runAs($school, fn () => app(SmsGateway::class)->send('sms', $to, $text, ['credits' => 1]));
    }

    public function test_gsm_normalisation_and_segment_counting(): void
    {
        $this->assertSame('Karibu - "Term II" starts... it\'s 07:30', GsmText::normalize("Karibu — “Term II” starts… it’s 07:30 😀"));
        $this->assertSame(1, GsmText::segments(str_repeat('a', 160)));
        $this->assertSame(2, GsmText::segments(str_repeat('a', 161)));
        $this->assertSame(3, GsmText::segments(str_repeat('a', 307)));
        $this->assertSame(2, GsmText::length('€'));
    }

    public function test_the_beem_driver_is_bound_from_config(): void
    {
        $this->assertInstanceOf(BeemSmsGateway::class, app(SmsGateway::class));
        config(['services.sms.driver' => 'log']);
        $this->assertNotInstanceOf(BeemSmsGateway::class, app(SmsGateway::class));
    }

    public function test_successful_send_records_the_beem_request_id(): void
    {
        Http::fake(['apisms.beem.africa/v1/send' => Http::response(['successful' => true, 'request_id' => 4321, 'code' => 100, 'message' => 'Message Submitted Successfully', 'valid' => 1, 'invalid' => 0, 'duplicates' => 0])]);
        ['school' => $school] = $this->makeSchool();
        $school->update(['settings' => ['sms_sender_id' => 'MZENZISS']]);

        $log = $this->sendAs($school, '+255712345678', 'Dear parent — fees are due “today”.');

        $this->assertSame('sent', $log->status);
        $this->assertSame('beem', $log->provider);
        $this->assertSame('4321', $log->provider_reference);
        $this->assertSame('Dear parent - fees are due "today".', $log->message);

        Http::assertSent(function (Request $request) {
            return $request->url() === 'https://apisms.beem.africa/v1/send'
                && $request->hasHeader('Authorization', 'Basic '.base64_encode('test-key:test-secret'))
                && $request['source_addr'] === 'MZENZISS'
                && $request['encoding'] === 0
                && $request['recipients'] === [['recipient_id' => 1, 'dest_addr' => '255712345678']];
        });
    }

    public function test_default_sender_is_used_when_the_school_has_none(): void
    {
        Http::fake(['*/v1/send' => Http::response(['successful' => true, 'request_id' => 1, 'code' => 100, 'valid' => 1])]);
        ['school' => $school] = $this->makeSchool();

        $this->sendAs($school, '0712345678', 'Hello');

        Http::assertSent(fn (Request $r) => $r['source_addr'] === 'INFO' && $r['recipients'][0]['dest_addr'] === '255712345678');
    }

    public function test_beem_errors_are_recorded_in_plain_language(): void
    {
        ['school' => $school] = $this->makeSchool();

        Http::fake(['*/v1/send' => Http::sequence()
            ->push(['code' => 111, 'message' => 'Invalid Sender ID'], 400)
            ->push(['code' => 120, 'message' => 'Invalid Authentication Parameters'], 401)]);

        $log = $this->sendAs($school, '0712345678', 'Hello');
        $this->assertSame('failed', $log->status);
        $this->assertStringContainsString('sender ID is not registered', $log->error);

        $this->assertStringContainsString('rejected the API key', $this->sendAs($school, '0712345678', 'Hello')->error);
    }

    public function test_invalid_numbers_fail_without_calling_beem(): void
    {
        Http::fake();
        ['school' => $school] = $this->makeSchool();

        $log = $this->sendAs($school, '12', 'Hello');

        $this->assertSame('failed', $log->status);
        Http::assertNothingSent();
    }

    public function test_email_does_not_go_to_beem(): void
    {
        Http::fake();
        ['school' => $school] = $this->makeSchool();

        $log = app(Tenancy::class)->runAs($school, fn () => app(SmsGateway::class)->send('email', 'parent@example.com', 'Hello'));

        $this->assertSame('sent', $log->status);
        Http::assertNothingSent();
    }

    public function test_queued_messages_such_as_fee_reminders_are_sent(): void
    {
        Http::fake(['*/v1/send' => Http::response(['successful' => true, 'request_id' => 77, 'code' => 100, 'valid' => 1])]);
        ['school' => $school] = $this->makeSchool();
        $log = app(Tenancy::class)->runAs($school, fn () => MessageLog::create(['channel' => 'sms', 'recipient' => '+255754000111', 'message' => 'Fee reminder', 'status' => 'queued', 'credits' => 1]));

        $this->assertSame(1, app(MessageDispatcher::class)->sendQueued());

        $log = MessageLog::withoutGlobalScopes()->find($log->id);
        $this->assertSame('sent', $log->status);
        $this->assertSame('77', $log->provider_reference);
    }

    public function test_delivery_reports_update_message_status(): void
    {
        ['school' => $school] = $this->makeSchool();
        [$a, $b, $c] = app(Tenancy::class)->runAs($school, fn () => collect(['+255700000001', '+255700000002', '+255700000003'])
            ->map(fn ($n, $i) => MessageLog::create(['channel' => 'sms', 'recipient' => $n, 'message' => 'Hi', 'status' => 'sent', 'provider' => 'beem', 'provider_reference' => (string) (100 + $i), 'credits' => 1]))->all());
        MessageLog::withoutGlobalScopes()->whereKey([$a->id, $b->id, $c->id])->update(['created_at' => now()->subMinutes(20)]);

        Http::fake(function (Request $request) {
            $status = ['255700000001' => 'DELIVERED', '255700000002' => 'UNDELIVERED', '255700000003' => 'PENDING'][$request['dest_addr']];

            return Http::response([['dest_addr' => $request['dest_addr'], 'status' => $status, 'request_id' => $request['request_id']]]);
        });

        $stats = app(MessageDispatcher::class)->syncBeemDelivery(BeemClient::fromConfig());

        $this->assertSame(['checked' => 3, 'delivered' => 1, 'undelivered' => 1, 'pending' => 1], $stats);
        $this->assertSame('delivered', $a->fresh()?->status ?? MessageLog::withoutGlobalScopes()->find($a->id)->status);
        $this->assertSame('failed', MessageLog::withoutGlobalScopes()->find($b->id)->status);
        $this->assertSame('sent', MessageLog::withoutGlobalScopes()->find($c->id)->status);
        Http::assertSent(fn (Request $r) => str_starts_with($r->url(), 'https://dlrapi.beem.africa/public/v1/delivery-reports'));
    }

    public function test_platform_admin_can_check_beem_status(): void
    {
        Http::fake([
            '*/public/v1/vendors/balance' => Http::response(['data' => ['credit_balance' => 1520.5]]),
            '*/public/v1/sender-names*' => Http::response(['data' => [['senderid' => 'MZENZISS', 'status' => 'active']], 'pagination' => []]),
        ]);
        $admin = new User(['name' => 'Platform Admin', 'email' => 'root@platform.test', 'password' => 'password']);
        $admin->is_super_admin = true;
        $admin->save();

        $this->actingAs($admin)->getJson('/saas/settings/sms-status')
            ->assertOk()
            ->assertJson(['ok' => true, 'balance' => 1520.5, 'senders' => [['senderid' => 'MZENZISS', 'status' => 'active']]]);

        ['admin' => $schoolAdmin] = $this->makeSchool();
        $this->actingAs($schoolAdmin)->getJson('/saas/settings/sms-status')->assertForbidden();
    }
}
