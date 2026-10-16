<?php

namespace Tests\Feature;

use App\Models\PocketMoneyAccount;
use App\Models\PocketMoneyCashCount;
use App\Models\PocketMoneyTransaction;
use App\Models\School;
use App\Models\Student;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PocketMoneyTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    private Student $boarder;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
        $this->boarder = $this->makeStudent($this->school, ['residence_type' => 'boarding', 'first_name' => 'Juma']);
    }

    private function deposit(int|string $amount, array $extra = []): TestResponse
    {
        return $this->actingAs($this->admin)->post('/boarding/pocket-money/deposit', array_merge([
            'student_id' => $this->boarder->id,
            'amount' => $amount,
            'method' => 'cash',
            'counterparty' => 'Mama Juma',
        ], $extra));
    }

    private function account(): PocketMoneyAccount
    {
        return app(Tenancy::class)->runAs($this->school, fn () => PocketMoneyAccount::where('student_id', $this->boarder->id)->firstOrFail());
    }

    private function withdraw(int|string $amount, array $extra = []): TestResponse
    {
        return $this->actingAs($this->admin)->post("/boarding/pocket-money/{$this->account()->id}/withdraw", array_merge([
            'amount' => $amount,
            'category' => 'canteen',
        ], $extra));
    }

    public function test_deposits_and_withdrawals_keep_a_numbered_running_balance(): void
    {
        $this->deposit(10000)->assertSessionHasNoErrors();
        $this->withdraw(2500)->assertSessionHasNoErrors();
        $this->withdraw(1500)->assertSessionHasNoErrors();

        $account = $this->account();
        $this->assertSame('6000.00', (string) $account->balance);
        $this->assertSame($this->admin->id, $account->custodian_id);

        $txns = PocketMoneyTransaction::withoutGlobalScopes()->orderBy('id')->get();
        $this->assertSame(['PM-00001', 'PM-00002', 'PM-00003'], $txns->pluck('reference')->all());
        $this->assertSame(['10000.00', '7500.00', '6000.00'], $txns->pluck('balance_after')->map(fn ($v) => (string) $v)->all());
        $this->assertSame('-2500.00', (string) $txns[1]->amount);
    }

    public function test_cannot_withdraw_more_than_the_balance(): void
    {
        $this->deposit(1000);
        $this->withdraw(1500)->assertSessionHasErrors('amount');
        $this->assertSame('1000.00', (string) $this->account()->balance);
    }

    public function test_only_boarders_can_have_pocket_money(): void
    {
        $day = $this->makeStudent($this->school, ['residence_type' => 'day']);
        $this->deposit(1000, ['student_id' => $day->id])->assertSessionHasErrors('student_id');
    }

    public function test_daily_limit_requires_a_reason_to_override(): void
    {
        $this->deposit(10000);
        $this->actingAs($this->admin)->put("/boarding/pocket-money/{$this->account()->id}", ['daily_limit' => 2000, 'custodian_id' => $this->admin->id])->assertSessionHasNoErrors();

        $this->withdraw(1500)->assertSessionHasNoErrors();
        $this->withdraw(1000)->assertSessionHasErrors('limit_override_reason');
        $this->withdraw(1000, ['category' => 'medical', 'limit_override_reason' => 'Clinic visit'])->assertSessionHasNoErrors();

        $last = PocketMoneyTransaction::withoutGlobalScopes()->latest('id')->first();
        $this->assertSame('Clinic visit', $last->limit_override_reason);
        $this->assertSame('7500.00', (string) $this->account()->balance);
    }

    public function test_pin_is_required_and_locks_after_repeated_failures(): void
    {
        $this->deposit(5000);
        $id = $this->account()->id;
        $this->actingAs($this->admin)->post("/boarding/pocket-money/{$id}/pin", ['pin' => '4321', 'pin_confirmation' => '4321'])->assertSessionHasNoErrors();

        $this->withdraw(500)->assertSessionHasErrors('pin');
        $this->withdraw(500, ['pin' => '4321'])->assertSessionHasNoErrors();
        $this->assertTrue(PocketMoneyTransaction::withoutGlobalScopes()->latest('id')->first()->pin_verified);

        for ($i = 0; $i < 5; $i++) {
            $this->withdraw(500, ['pin' => '0000'])->assertSessionHasErrors('pin');
        }
        // Locked: even the right PIN is refused until reset.
        $this->withdraw(500, ['pin' => '4321'])->assertSessionHasErrors('pin');
        $this->assertSame('4500.00', (string) $this->account()->balance);

        $this->actingAs($this->admin)->post("/boarding/pocket-money/{$id}/pin", ['pin' => '9999', 'pin_confirmation' => '9999']);
        $this->withdraw(500, ['pin' => '9999'])->assertSessionHasNoErrors();
    }

    public function test_reversal_corrects_without_deleting_and_cannot_be_repeated(): void
    {
        $this->deposit(3000);
        $this->withdraw(1000);
        $withdrawal = PocketMoneyTransaction::withoutGlobalScopes()->where('type', 'withdrawal')->first();

        $this->actingAs($this->admin)->post("/boarding/pocket-money/transactions/{$withdrawal->id}/reverse", ['reason' => 'Wrong student'])->assertSessionHasNoErrors();
        $this->assertSame('3000.00', (string) $this->account()->balance);
        $this->assertNotNull($withdrawal->fresh()->reversed_at);
        $this->assertSame(3, PocketMoneyTransaction::withoutGlobalScopes()->count());

        $this->actingAs($this->admin)->post("/boarding/pocket-money/transactions/{$withdrawal->id}/reverse", ['reason' => 'again'])->assertSessionHasErrors('reason');
        $this->assertSame('3000.00', (string) $this->account()->balance);
    }

    public function test_cannot_reverse_a_deposit_that_has_been_spent(): void
    {
        $this->deposit(2000);
        $this->withdraw(1500);
        $deposit = PocketMoneyTransaction::withoutGlobalScopes()->where('type', 'deposit')->first();

        $this->actingAs($this->admin)->post("/boarding/pocket-money/transactions/{$deposit->id}/reverse", ['reason' => 'typo'])->assertSessionHasErrors('reason');
        $this->assertSame('500.00', (string) $this->account()->balance);
    }

    public function test_closing_refunds_the_balance_and_blocks_further_use(): void
    {
        $this->deposit(4000);
        $id = $this->account()->id;

        $this->actingAs($this->admin)->post("/boarding/pocket-money/{$id}/close", [])->assertSessionHasErrors('counterparty');
        $this->actingAs($this->admin)->post("/boarding/pocket-money/{$id}/close", ['counterparty' => 'Mama Juma'])->assertRedirect();

        $account = $this->account();
        $this->assertSame('closed', $account->status);
        $this->assertSame('0.00', (string) $account->balance);
        $this->assertSame('refund', PocketMoneyTransaction::withoutGlobalScopes()->latest('id')->first()->category);

        $this->deposit(1000)->assertSessionHasErrors('amount');
    }

    public function test_cash_count_records_variance_and_hands_over_custody(): void
    {
        $this->deposit(8000);
        $matron = $this->makeUserWithRole($this->school, 'boarding-master');

        $this->actingAs($this->admin)->post('/boarding/pocket-money/cash-counts', [
            'custodian_id' => $this->admin->id,
            'counted' => 7500,
            'handed_over_to' => $matron->id,
            'notes' => 'Short 500',
        ])->assertSessionHasNoErrors();

        $count = app(Tenancy::class)->runAs($this->school, fn () => PocketMoneyCashCount::firstOrFail());
        $this->assertSame('8000.00', (string) $count->expected);
        $this->assertSame('-500.00', (string) $count->variance);
        $this->assertSame($matron->id, $this->account()->custodian_id);
    }

    public function test_pages_render(): void
    {
        $this->deposit(5000);
        $account = $this->account();
        $txn = PocketMoneyTransaction::withoutGlobalScopes()->first();

        $this->actingAs($this->admin)->get('/boarding/pocket-money')->assertInertia(fn (Assert $p) => $p
            ->component('boarding/pocket-money/index')
            ->where('accounts.total', 1)
            ->where('stats.held', '5000.00'));
        $this->actingAs($this->admin)->get("/boarding/pocket-money/{$account->id}")->assertInertia(fn (Assert $p) => $p
            ->component('boarding/pocket-money/show')
            ->has('transactions', 1)
            ->where('opening', '0.00'));
        $this->actingAs($this->admin)->get('/boarding/pocket-money/transactions')->assertInertia(fn (Assert $p) => $p
            ->component('boarding/pocket-money/transactions')
            ->where('totals.in', '5000.00'));
        $this->actingAs($this->admin)->get("/boarding/pocket-money/transactions/{$txn->id}/receipt")->assertOk();
        $this->actingAs($this->admin)->get('/boarding/pocket-money/cash-counts')->assertOk();
    }

    public function test_other_schools_cannot_touch_a_wallet(): void
    {
        $this->deposit(5000);
        ['admin' => $intruder] = $this->makeSchool('Other School');
        $id = $this->account()->id;

        $this->actingAs($intruder)->get("/boarding/pocket-money/{$id}")->assertNotFound();
        $this->actingAs($intruder)->post("/boarding/pocket-money/{$id}/withdraw", ['amount' => 100, 'category' => 'canteen'])->assertNotFound();
        $this->assertSame('5000.00', (string) $this->account()->balance);
    }
}
