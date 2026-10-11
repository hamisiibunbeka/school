<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Budget;
use App\Models\Expense;
use App\Models\FiscalYear;
use App\Models\Journal;
use App\Models\User;
use App\Services\Accounting\LedgerService;
use App\Services\AuditLogger;
use App\Services\DocumentNumber;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;

/**
 * Demo accounting data for the demo school (runs inside its tenancy context):
 * opening balances, ~60 payment vouchers (Jan–Oct), depreciation, grants,
 * loan repayments, asset purchase, petty-cash top-ups, workflow examples and budgets.
 * Every posting goes through LedgerService so the statements always balance.
 */
class AccountingDemoSeeder extends Seeder
{
    private LedgerService $ledger;

    /** @var array<string, int> */
    private array $acc = [];

    private int $makerId;

    private int $checkerId;

    public function run(): void
    {
        if (Journal::where('type', 'opening')->where('reference', 'OB-'.now()->format('Y'))->exists()) {
            return; // already seeded
        }

        mt_srand(2026);
        $this->ledger = app(LedgerService::class);
        $this->acc = Account::pluck('id', 'code')->all();

        $maker = User::where('email', 'bursar@mzenzi.test')->first() ?? User::where('school_id', app(\App\Support\Tenancy::class)->schoolId())->first();
        $checker = User::where('email', 'admin@mzenzi.test')->first() ?? $maker;
        if (! $maker) {
            return;
        }
        $this->makerId = $maker->id;
        $this->checkerId = $checker->id;

        Auth::setUser($maker);

        try {
            $year = (int) now()->format('Y');
            FiscalYear::firstOrCreate(['name' => "FY $year"], ['start_date' => "$year-01-01", 'end_date' => "$year-12-31", 'status' => 'open']);

            $this->openingBalances($year);
            $this->vouchers($year);
            $this->generalJournals($year);
            $this->workflowExamples($year);
            $this->budgets($year);
        } finally {
            Auth::forgetUser();
        }
    }

    // ------------------------------------------------------------------

    private function openingBalances(int $year): void
    {
        $debits = [
            '1500' => '850000000', '1510' => '65000000', '1520' => '180000000', '1530' => '35000000',
            '1200' => '42000000', '1210' => '18500000', '1100' => '2500000', '1400' => '6000000',
        ];
        $credits = ['1590' => '120000000', '2600' => '150000000', '2100' => '8500000'];

        $dr = array_reduce($debits, fn ($c, $v) => bcadd($c, $v, 2), '0');
        $cr = array_reduce($credits, fn ($c, $v) => bcadd($c, $v, 2), '0');
        $credits['3100'] = bcsub($dr, $cr, 2); // capital = balancing figure (920,500,000)

        $lines = [];
        foreach ($debits as $code => $amount) {
            $lines[] = ['account_id' => $this->acc[$code], 'debit' => $amount, 'narration' => 'Balance b/f'];
        }
        foreach ($credits as $code => $amount) {
            $lines[] = ['account_id' => $this->acc[$code], 'credit' => $amount, 'narration' => 'Balance b/f'];
        }

        $this->post([
            'date' => "$year-01-01",
            'type' => 'opening',
            'reference' => "OB-$year",
            'narration' => "Opening balances brought forward as at 1 January $year",
        ], $lines);
    }

    /** ~60 payment vouchers spread January → October. */
    private function vouchers(int $year): void
    {
        $months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        $today = CarbonImmutable::now();
        $lastMonth = $today->year === $year ? min(10, $today->month) : 10;

        // [expense code, payee, description, min, max, pay-from code, method]
        $core = [
            ['6200', 'TANESCO', 'Electricity — LUKU tokens for %s', 1800000, 2600000, '1200', 'bank_transfer'],
            ['5100', 'Tandale Grain Suppliers', 'Maize flour, rice & beans for the dining hall — %s', 2500000, 4800000, '1200', 'bank_transfer'],
            ['6310', 'Puma Energy Mbezi', 'Diesel for school buses — %s', 900000, 1600000, '1200', 'bank_transfer'],
            ['6600', 'CRDB Bank PLC', 'Bank charges & SimBanking fees — %s', 45000, 120000, '1200', 'bank_transfer'],
            ['6210', 'Vodacom Tanzania', 'Internet bundles & staff airtime — %s', 280000, 450000, '1250', 'mobile_money'],
        ];
        $rotating = [
            ['6200', 'DAWASA', 'Water bill — %s', 450000, 750000, '1200', 'bank_transfer'],
            ['6300', 'Mwakyusa Builders & Repairs', 'Repair of classroom roofing & plumbing — %s', 600000, 3500000, '1200', 'cheque'],
            ['6400', 'Kariakoo Stationers Ltd', 'Exam paper, toner & printing supplies — %s', 350000, 1200000, '1100', 'cash'],
            ['6800', 'Dar Sports Centre', 'Football kits & inter-school games transport — %s', 300000, 1500000, '1100', 'cash'],
            ['6500', 'Office sundries (various)', 'Office refreshments, courier & postage — %s', 150000, 450000, '1110', 'cash'],
            ['5120', 'Mkuki na Nyota Publishers', 'Textbooks & laboratory consumables — %s', 800000, 2400000, '1200', 'cheque'],
        ];
        $rejectReasons = [
            'Quotation not attached — obtain three quotations first.',
            'Amount exceeds the approved budget line; resubmit after reallocation.',
            'Duplicate of an invoice already paid.',
        ];

        $n = 0;
        for ($m = 1; $m <= $lastMonth; $m++) {
            $set = [...$core, $rotating[($m - 1) % count($rotating)]];
            foreach ($set as $k => [$code, $payee, $desc, $min, $max, $payFrom, $method]) {
                $n++;
                $maxDay = ($year === $today->year && $m === $today->month) ? max(1, $today->day - 1) : CarbonImmutable::create($year, $m, 1)->daysInMonth;
                $date = CarbonImmutable::create($year, $m, mt_rand(1, $maxDay))->toDateString();
                $amount = (string) (round(mt_rand($min, $max) / 1000) * 1000);

                $expense = new Expense([
                    'voucher_no' => DocumentNumber::next('expense'),
                    'date' => $date,
                    'expense_account_id' => $this->acc[$code],
                    'payment_account_id' => $this->acc[$payFrom],
                    'payee' => $payee,
                    'amount' => $amount,
                    'description' => sprintf($desc, "{$months[$m - 1]} $year"),
                    'reference' => $method === 'cheque' ? 'CHQ '.mt_rand(100200, 100999) : ($method === 'bank_transfer' ? 'TRF'.mt_rand(10000000, 99999999) : null),
                    'payment_method' => $method,
                    'status' => 'pending',
                    'created_by' => $this->makerId,
                ]);
                $expense->created_at = $date.' 09:'.str_pad((string) mt_rand(0, 59), 2, '0', STR_PAD_LEFT).':00';
                $expense->save();

                // A few rejected, and the most recent month partly awaiting approval.
                if (in_array($n, [8, 27, 44], true)) {
                    $expense->update(['status' => 'rejected', 'approved_by' => $this->checkerId]);
                    $reason = $rejectReasons[array_search($n, [8, 27, 44], true)];
                    AuditLogger::log('rejected', $expense, "Payment voucher {$expense->voucher_no} rejected: $reason", null, ['reason' => $reason], 'accounting');

                    continue;
                }
                if ($m === $lastMonth && in_array($k, [2, 4, 5], true)) {
                    AuditLogger::log('created', $expense, "Payment voucher {$expense->voucher_no} raised", null, null, 'accounting');

                    continue; // pending
                }

                $journal = $this->post([
                    'date' => $date,
                    'type' => 'expense',
                    'reference' => $expense->voucher_no,
                    'narration' => "{$expense->voucher_no}: {$expense->description} — {$payee}",
                ], [
                    ['account_id' => $expense->expense_account_id, 'debit' => $amount, 'narration' => $expense->description],
                    ['account_id' => $expense->payment_account_id, 'credit' => $amount, 'narration' => "Paid to $payee"],
                ], $expense);

                $expense->update(['status' => 'paid', 'approved_by' => $this->checkerId, 'journal_id' => $journal->id]);
            }
        }
    }

    /** Depreciation, grants, loan repayments, asset purchase, petty cash top-ups, supplier settlement. */
    private function generalJournals(int $year): void
    {
        $today = CarbonImmutable::now();

        // Straight-line depreciation: buildings 2%, furniture 10%, vehicles 20%, computers 33% → 71,050,000 p.a.
        $monthly = bcdiv('71050000', '12', 2); // 5,920,833.33
        for ($m = 1; $m <= 12; $m++) {
            $end = CarbonImmutable::create($year, $m, 1)->endOfMonth();
            if ($end->greaterThanOrEqualTo($today->startOfDay())) {
                break;
            }
            $this->post([
                'date' => $end->toDateString(),
                'type' => 'depreciation',
                'reference' => 'DEP-'.$end->format('Y-m'),
                'narration' => 'Monthly depreciation of fixed assets — '.$end->format('F Y'),
            ], [
                ['account_id' => $this->acc['6700'], 'debit' => $monthly],
                ['account_id' => $this->acc['1590'], 'credit' => $monthly],
            ]);
        }

        $dated = fn (string $md) => "$year-$md";
        $entries = [
            ['02-12', 'general', 'SUP-SETTLE', 'Settlement of opening supplier balances', [['2100', 8500000, 0], ['1200', 0, 8500000]]],
            ['03-16', 'general', 'GRANT-CG-Q1', 'Capitation grant received from the Government — Q1', [['1200', 25000000, 0], ['4200', 0, 25000000]]],
            ['06-15', 'general', 'GRANT-CG-Q2', 'Capitation grant received from the Government — Q2', [['1200', 25000000, 0], ['4200', 0, 25000000]]],
            ['09-15', 'general', 'GRANT-CG-Q3', 'Capitation grant received from the Government — Q3', [['1200', 25000000, 0], ['4200', 0, 25000000]]],
            ['07-21', 'general', 'DON-ALUMNI', 'Donation from Mzenzi Alumni Association towards the science laboratory', [['1200', 8500000, 0], ['4200', 0, 8500000]]],
            ['05-08', 'general', 'INV-ICT-0425', 'Purchase of 8 desktop computers for the computer laboratory', [['1530', 14400000, 0], ['1200', 0, 14400000]]],
            ['03-31', 'general', 'LOAN-Q1', 'Quarterly repayment of CRDB development loan (principal)', [['2600', 7500000, 0], ['1200', 0, 7500000]]],
            ['06-30', 'general', 'LOAN-Q2', 'Quarterly repayment of CRDB development loan (principal)', [['2600', 7500000, 0], ['1200', 0, 7500000]]],
            ['09-30', 'general', 'LOAN-Q3', 'Quarterly repayment of CRDB development loan (principal)', [['2600', 7500000, 0], ['1200', 0, 7500000]]],
            ['04-14', 'general', 'TRF-NMB-CRDB', 'Transfer of fees collections from NMB to CRDB operations account', [['1200', 10000000, 0], ['1210', 0, 10000000]]],
        ];
        for ($m = 1; $m <= min(10, $today->month); $m++) {
            $entries[] = [sprintf('%02d-03', $m), 'general', 'PC-'.sprintf('%02d', $m), 'Petty cash top-up for '.CarbonImmutable::create($year, $m, 1)->format('F Y'), [['1110', 500000, 0], ['1200', 0, 500000]]];
        }

        foreach ($entries as [$md, $type, $ref, $narration, $rows]) {
            if ($dated($md) >= $today->toDateString()) {
                continue;
            }
            $this->post(
                ['date' => $dated($md), 'type' => $type, 'reference' => $ref, 'narration' => $narration],
                array_map(fn ($r) => ['account_id' => $this->acc[$r[0]], 'debit' => (string) $r[1], 'credit' => (string) $r[2]], $rows),
            );
        }
    }

    /** Draft, submitted and rejected manual journals to demonstrate maker-checker. */
    private function workflowExamples(int $year): void
    {
        $recent = CarbonImmutable::now()->subDays(2)->toDateString();

        $submitted = $this->ledger->record([
            'date' => $recent, 'type' => 'accrual', 'reference' => 'ACR-ELEC',
            'narration' => 'Accrual of unbilled electricity consumption for the period',
        ], [
            ['account_id' => $this->acc['6200'], 'debit' => '1350000'],
            ['account_id' => $this->acc['2200'], 'credit' => '1350000'],
        ], null, false);
        $submitted->forceFill(['status' => 'submitted'])->save();
        AuditLogger::log('submitted', $submitted, "Journal {$submitted->journal_no} created and submitted for approval", module: 'accounting');

        $draft = $this->ledger->record([
            'date' => $recent, 'type' => 'prepayment', 'reference' => 'INS-2027',
            'narration' => 'Motor vehicle insurance paid in advance — reclassify to prepayments',
        ], [
            ['account_id' => $this->acc['1450'], 'debit' => '2400000'],
            ['account_id' => $this->acc['6310'], 'credit' => '2400000'],
        ], null, false);
        AuditLogger::log('created', $draft, "Journal {$draft->journal_no} saved as draft", module: 'accounting');

        $rejected = $this->ledger->record([
            'date' => CarbonImmutable::now()->subDays(6)->toDateString(), 'type' => 'adjustment', 'reference' => 'ADJ-STAT',
            'narration' => 'Reclassify stationery purchases to teaching materials',
        ], [
            ['account_id' => $this->acc['5120'], 'debit' => '850000'],
            ['account_id' => $this->acc['6400'], 'credit' => '850000'],
        ], null, false);
        $rejected->forceFill(['status' => 'rejected'])->save();
        $reason = 'Please attach the stores issue notes supporting the reclassification.';
        AuditLogger::log('rejected', $rejected, "Journal {$rejected->journal_no} rejected: $reason", null, ['reason' => $reason], 'accounting');
    }

    private function budgets(int $year): void
    {
        $fy = FiscalYear::forDate("$year-06-30");
        if (! $fy) {
            return;
        }

        $plan = [
            '4100' => 420000000, '4110' => 180000000, '4120' => 45000000, '4130' => 18000000, '4140' => 60000000,
            '4150' => 12000000, '4160' => 9000000, '4200' => 100000000,
            '5100' => 48000000, '5110' => 8000000, '5120' => 15000000,
            '6100' => 260000000, '6110' => 26000000, '6120' => 1300000, '6130' => 9100000,
            '6200' => 28000000, '6210' => 4500000, '6300' => 12000000, '6310' => 16000000, '6400' => 6000000,
            '6500' => 4000000, '6600' => 1200000, '6700' => 71050000, '6800' => 5000000, '6900' => 3000000,
        ];
        foreach ($plan as $code => $amount) {
            if (! isset($this->acc[$code])) {
                continue;
            }
            Budget::updateOrCreate(
                ['fiscal_year_id' => $fy->id, 'account_id' => $this->acc[$code]],
                ['amount' => $amount, 'notes' => 'Approved by the School Board'],
            );
        }
    }

    // ------------------------------------------------------------------

    /**
     * Record & post via the ledger, stamping maker (bursar) and checker (admin).
     *
     * @param  array<string, mixed>  $header
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function post(array $header, array $lines, ?\Illuminate\Database\Eloquent\Model $source = null): Journal
    {
        $journal = $this->ledger->record($header, $lines, $source, false);
        $journal->forceFill(['approved_by' => $this->checkerId])->save();
        $this->ledger->post($journal);
        $journal->forceFill(['posted_at' => CarbonImmutable::parse($header['date'])->setTime(16, 0)])->save();

        return $journal;
    }
}
