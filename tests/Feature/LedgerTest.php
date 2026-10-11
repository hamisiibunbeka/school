<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\FiscalYear;
use App\Services\Accounting\LedgerService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** SRS 5.3 / 5.5: balanced journals, immutability via reversal, closed periods. */
class LedgerTest extends TestCase
{
    use RefreshDatabase;

    private LedgerService $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        app(Tenancy::class)->setSchool($school);
        $this->actingAs($admin);
        $this->ledger = app(LedgerService::class);
    }

    public function test_balanced_journal_posts_and_updates_balances(): void
    {
        $cash = Account::byCode('1100');
        $tuition = Account::byCode('4100');

        $journal = $this->ledger->record(['date' => now()->toDateString(), 'narration' => 'Cash fees'], [
            ['account_id' => $cash->id, 'debit' => '150000.50'],
            ['account_id' => $tuition->id, 'credit' => '150000.50'],
        ]);

        $this->assertSame('posted', $journal->status);
        $this->assertSame('150000.50', $this->ledger->balance($cash));
        $this->assertSame('150000.50', $this->ledger->balance($tuition));
    }

    public function test_unbalanced_journal_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        $this->ledger->record(['date' => now()->toDateString(), 'narration' => 'Bad'], [
            ['account_id' => Account::byCode('1100')->id, 'debit' => '100'],
            ['account_id' => Account::byCode('4100')->id, 'credit' => '99.99'],
        ]);
    }

    public function test_reversal_nets_balances_to_zero_and_keeps_original(): void
    {
        $cash = Account::byCode('1100');
        $journal = $this->ledger->record(['date' => now()->toDateString(), 'narration' => 'Mistake'], [
            ['account_id' => $cash->id, 'debit' => '5000'],
            ['account_id' => Account::byCode('4900')->id, 'credit' => '5000'],
        ]);

        $reversal = $this->ledger->reverse($journal, 'Entered twice');

        $this->assertSame('reversed', $journal->fresh()->status);
        $this->assertSame($journal->id, $reversal->reversal_of_id);
        $this->assertSame('0.00', $this->ledger->balance($cash));
    }

    public function test_posting_into_a_closed_fiscal_year_is_blocked(): void
    {
        FiscalYear::query()->update(['status' => 'closed']);

        $this->expectException(ValidationException::class);

        $this->ledger->record(['date' => now()->toDateString(), 'narration' => 'Late'], [
            ['account_id' => Account::byCode('1100')->id, 'debit' => '10'],
            ['account_id' => Account::byCode('4900')->id, 'credit' => '10'],
        ]);
    }
}
