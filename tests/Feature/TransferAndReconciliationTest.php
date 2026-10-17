<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\BankReconciliation;
use App\Models\FundTransfer;
use App\Models\JournalLine;
use App\Models\School;
use App\Models\User;
use App\Services\Accounting\LedgerService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TransferAndReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    private User $admin;

    private User $bursar;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
        $this->bursar = $this->makeUserWithRole($this->school, 'bursar');

        // Opening balances: CRDB 10,000,000, M-Pesa 500,000.
        $this->in(fn () => app(LedgerService::class)->record(['date' => now()->startOfYear()->toDateString(), 'type' => 'opening', 'narration' => 'Opening'], [
            ['account_id' => $this->acc('1200')->id, 'debit' => '10000000'],
            ['account_id' => $this->acc('1250')->id, 'debit' => '500000'],
            ['account_id' => $this->acc('3100')->id, 'credit' => '10500000'],
        ]));
    }

    private function in(callable $fn): mixed
    {
        return app(Tenancy::class)->runAs($this->school, $fn);
    }

    private function acc(string $code): Account
    {
        return $this->in(fn () => Account::byCode($code));
    }

    private function balance(string $code, ?string $to = null): string
    {
        return $this->in(fn () => app(LedgerService::class)->balance(Account::byCode($code), null, $to));
    }

    private function raise(array $data = []): FundTransfer
    {
        $this->actingAs($this->bursar)->post('/accounting/transfers', array_merge([
            'date' => now()->toDateString(),
            'from_account_id' => $this->acc('1200')->id,
            'to_account_id' => $this->acc('1210')->id,
            'amount' => 3000000,
            'charges' => 5000,
            'charge_account_id' => $this->acc('6600')->id,
            'method' => 'bank_transfer',
            'reference' => 'TT2610001',
            'description' => 'Move funds to NMB',
        ], $data))->assertSessionHasNoErrors();

        return $this->in(fn () => FundTransfer::latest('id')->firstOrFail());
    }

    // ---------------------------------------------------------------- transfers

    public function test_transfer_needs_a_different_approver_and_posts_charges(): void
    {
        $t = $this->raise();
        $this->assertSame('pending', $t->status);
        $this->assertSame('10000000.00', $this->balance('1200'), 'Nothing posts before approval.');

        $this->actingAs($this->bursar)->post("/accounting/transfers/{$t->id}/approve")->assertSessionHasErrors('approval');

        $this->actingAs($this->admin)->post("/accounting/transfers/{$t->id}/approve")->assertSessionHasNoErrors();
        $t->refresh();
        $this->assertSame('posted', $t->status);
        $this->assertSame('6995000.00', $this->balance('1200')); // 3,000,000 + 5,000 charge out
        $this->assertSame('3000000.00', $this->balance('1210'));
        $this->assertSame('5000.00', $this->balance('6600'));
        $this->assertSame('transfer', $t->journal->type);
    }

    public function test_transfer_validation(): void
    {
        $base = ['date' => now()->toDateString(), 'amount' => 1000, 'method' => 'bank_transfer', 'description' => 'x'];

        $this->actingAs($this->bursar)->post('/accounting/transfers', $base + ['from_account_id' => $this->acc('1200')->id, 'to_account_id' => $this->acc('1200')->id])
            ->assertSessionHasErrors('to_account_id');
        $this->actingAs($this->bursar)->post('/accounting/transfers', $base + ['from_account_id' => $this->acc('1200')->id, 'to_account_id' => $this->acc('6600')->id])
            ->assertSessionHasErrors('to_account_id');
        $this->actingAs($this->bursar)->post('/accounting/transfers', ['date' => now()->addDay()->toDateString()] + $base + ['from_account_id' => $this->acc('1200')->id, 'to_account_id' => $this->acc('1210')->id])
            ->assertSessionHasErrors('date');
        $this->actingAs($this->bursar)->post('/accounting/transfers', $base + ['from_account_id' => $this->acc('1200')->id, 'to_account_id' => $this->acc('1210')->id, 'charges' => 500])
            ->assertSessionHasErrors('charge_account_id');
    }

    public function test_mobile_money_cannot_be_overdrawn_but_bank_can(): void
    {
        $t = $this->raise(['from_account_id' => $this->acc('1250')->id, 'to_account_id' => $this->acc('1200')->id, 'amount' => 600000, 'charges' => 0]);
        $this->actingAs($this->admin)->post("/accounting/transfers/{$t->id}/approve")->assertSessionHasErrors('approval');
        $this->assertSame('pending', $t->fresh()->status);

        $bank = $this->raise(['amount' => 15000000, 'charges' => 0]);
        $this->actingAs($this->admin)->post("/accounting/transfers/{$bank->id}/approve")->assertSessionHasNoErrors();
        $this->assertSame('-5000000.00', $this->balance('1200'), 'Bank overdraft is allowed.');
    }

    public function test_void_reverses_the_transfer(): void
    {
        $t = $this->raise();
        $this->actingAs($this->admin)->post("/accounting/transfers/{$t->id}/approve");
        $this->actingAs($this->admin)->post("/accounting/transfers/{$t->id}/void", ['reason' => 'Wrong account'])->assertSessionHasNoErrors();

        $this->assertSame('void', $t->fresh()->status);
        $this->assertSame('10000000.00', $this->balance('1200'));
        $this->assertSame('0.00', $this->balance('1210'));
    }

    // ---------------------------------------------------------- reconciliation

    public function test_full_reconciliation_cycle(): void
    {
        // Books: transfer out 3,005,000 (cleared) and a second transfer of 1,000,000 not yet on the statement.
        $t1 = $this->raise();
        $this->actingAs($this->admin)->post("/accounting/transfers/{$t1->id}/approve");
        $t2 = $this->raise(['amount' => 1000000, 'charges' => 0, 'reference' => 'CHQ 100221']);
        $this->actingAs($this->admin)->post("/accounting/transfers/{$t2->id}/approve");

        $crdb = $this->acc('1200');
        $statementDate = now()->toDateString();

        $this->actingAs($this->bursar)->get('/accounting/reconciliations')->assertInertia(fn (Assert $p) => $p
            ->component('accounting/reconciliations/index')
            ->where('accounts.0.code', '1200')
            ->where('accounts.0.suggested_opening', '10000000.00'));

        // Statement: opening 10,000,000; transfer 3,005,000 out; bank charge 2,500 the books don't have → closing 6,992,500.
        $this->actingAs($this->bursar)->post('/accounting/reconciliations', [
            'account_id' => $crdb->id, 'statement_date' => $statementDate, 'opening_balance' => 10000000, 'closing_balance' => 6992500,
        ])->assertSessionHasNoErrors();
        $rec = $this->in(fn () => BankReconciliation::firstOrFail());

        $line1 = $this->in(fn () => JournalLine::where('journal_id', $t1->fresh()->journal_id)->where('account_id', $crdb->id)->value('id'));

        // Cannot complete while there is a difference.
        $this->actingAs($this->bursar)->post("/accounting/reconciliations/{$rec->id}/complete", ['line_ids' => [$line1]])->assertSessionHasErrors('reconciliation');

        // Post the bank's charge from the reconciliation (auto-ticked).
        $this->actingAs($this->bursar)->post("/accounting/reconciliations/{$rec->id}/adjustment", [
            'direction' => 'out', 'date' => $statementDate, 'amount' => 2500, 'account_id' => $this->acc('6600')->id, 'description' => 'Monthly ledger fee',
        ])->assertSessionHasNoErrors();

        $ticked = $this->in(fn () => JournalLine::where('bank_reconciliation_id', $rec->id)->pluck('id')->all());
        $this->actingAs($this->bursar)->post("/accounting/reconciliations/{$rec->id}/complete", ['line_ids' => [...$ticked, $line1]])->assertSessionHasNoErrors();

        $rec->refresh();
        $this->assertSame('completed', $rec->status);
        $this->actingAs($this->bursar)->get("/accounting/reconciliations/{$rec->id}")->assertInertia(fn (Assert $p) => $p
            ->where('summary.difference', '0.00')
            ->where('summary.unpresented', '1000000.00')     // the cheque not yet on the statement
            ->where('summary.book_balance', '5992500.00')
            ->where('summary.unexplained', '0.00')
            ->has('outstanding', 1));

        // Locked: no more ticking, and the maker cannot sign off their own work.
        $this->actingAs($this->bursar)->put("/accounting/reconciliations/{$rec->id}/lines", ['line_ids' => []])->assertSessionHasErrors('reconciliation');
        $this->actingAs($this->bursar)->post("/accounting/reconciliations/{$rec->id}/review")->assertSessionHasErrors('approval');
        $this->actingAs($this->admin)->post("/accounting/reconciliations/{$rec->id}/review")->assertSessionHasNoErrors();
        $this->assertSame($this->admin->id, $rec->fresh()->reviewed_by);

        // Next month starts from this closing; cleared lines no longer appear, the outstanding cheque still does.
        $this->actingAs($this->bursar)->get('/accounting/reconciliations')->assertInertia(fn (Assert $p) => $p->where('accounts.0.suggested_opening', '6992500.00'));
        $this->actingAs($this->bursar)->post('/accounting/reconciliations', [
            'account_id' => $crdb->id, 'statement_date' => $statementDate, 'opening_balance' => 6992500, 'closing_balance' => 5992500,
        ])->assertSessionHasErrors('statement_date');
    }

    public function test_reopen_only_the_latest_and_draft_delete_releases_lines(): void
    {
        $crdb = $this->acc('1200');
        $this->actingAs($this->bursar)->post('/accounting/reconciliations', [
            'account_id' => $crdb->id, 'statement_date' => now()->subDays(10)->toDateString(), 'opening_balance' => 10000000, 'closing_balance' => 10000000,
        ]);
        $first = $this->in(fn () => BankReconciliation::firstOrFail());
        $this->actingAs($this->bursar)->post("/accounting/reconciliations/{$first->id}/complete", ['line_ids' => []])->assertSessionHasNoErrors();

        $t = $this->raise(['charges' => 0]);
        $this->actingAs($this->admin)->post("/accounting/transfers/{$t->id}/approve");
        $this->actingAs($this->bursar)->post('/accounting/reconciliations', [
            'account_id' => $crdb->id, 'statement_date' => now()->toDateString(), 'opening_balance' => 10000000, 'closing_balance' => 7000000,
        ]);
        $second = $this->in(fn () => BankReconciliation::latest('id')->firstOrFail());
        $line = $this->in(fn () => JournalLine::where('journal_id', $t->fresh()->journal_id)->where('account_id', $crdb->id)->value('id'));
        $this->actingAs($this->bursar)->put("/accounting/reconciliations/{$second->id}/lines", ['line_ids' => [$line]])->assertSessionHasNoErrors();

        $this->actingAs($this->admin)->post("/accounting/reconciliations/{$first->id}/reopen", ['reason' => 'x']);
        $this->assertSame('completed', $first->fresh()->status, 'An earlier period cannot be reopened while a later one exists.');

        $this->actingAs($this->bursar)->delete("/accounting/reconciliations/{$second->id}")->assertRedirect();
        $this->assertNull($this->in(fn () => JournalLine::find($line)->bank_reconciliation_id));

        $this->actingAs($this->admin)->post("/accounting/reconciliations/{$first->id}/reopen", ['reason' => 'Typo in closing'])->assertSessionHasNoErrors();
        $this->assertSame('draft', $first->fresh()->status);
    }

    public function test_only_bank_and_mobile_money_accounts_are_reconciled(): void
    {
        $this->actingAs($this->bursar)->post('/accounting/reconciliations', [
            'account_id' => $this->acc('1100')->id, 'statement_date' => now()->toDateString(), 'opening_balance' => 0, 'closing_balance' => 0,
        ])->assertSessionHasErrors('account_id');
    }

    public function test_pages_render(): void
    {
        $t = $this->raise();
        $this->actingAs($this->bursar)->get('/accounting/transfers')->assertInertia(fn (Assert $p) => $p->component('accounting/transfers/index')->where('transfers.total', 1));
        $this->actingAs($this->bursar)->get("/accounting/transfers/{$t->id}")->assertInertia(fn (Assert $p) => $p->component('accounting/transfers/show'));
    }
}
