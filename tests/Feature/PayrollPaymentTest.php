<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Employee;
use App\Services\Accounting\LedgerService;
use App\Services\Payroll\PayrollService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Pay some employees now, withhold others with a reason, settle the rest later. */
class PayrollPaymentTest extends TestCase
{
    use RefreshDatabase;

    public function test_partial_payment_then_pay_remaining(): void
    {
        ['school' => $school, 'admin' => $admin] = $this->makeSchool();
        app(Tenancy::class)->setSchool($school);
        $preparer = $this->makeUserWithRole($school, 'hr-officer');
        $bursar = $this->makeUserWithRole($school, 'bursar');

        foreach ([1, 2, 3] as $n) {
            Employee::create(['employee_no' => "E{$n}", 'first_name' => 'Staff', 'last_name' => (string) $n, 'basic_salary' => 800000, 'status' => 'active', 'bank_name' => 'CRDB', 'bank_account' => "0150{$n}"]);
        }

        $this->actingAs($preparer);
        $run = app(PayrollService::class)->createRun(now()->format('Y-m'));
        app(PayrollService::class)->approve($run->fresh(), $admin);

        [$a, $b, $c] = $run->payslips()->orderBy('id')->get()->all();
        $bank = Account::byCode('1200');
        $ledger = app(LedgerService::class);

        // Missing reason for an unticked employee is rejected.
        $this->actingAs($bursar)->post("/payroll/{$run->id}/pay", [
            'account_id' => $bank->id, 'payment_date' => now()->toDateString(), 'payslip_ids' => [$a->id, $b->id], 'withheld' => [],
        ])->assertSessionHasErrors('withheld');

        // Pay two, withhold one.
        $this->post("/payroll/{$run->id}/pay", [
            'account_id' => $bank->id, 'payment_date' => now()->toDateString(),
            'payslip_ids' => [$a->id, $b->id], 'withheld' => [$c->id => 'Bank details missing'],
        ])->assertSessionHasNoErrors();

        $run->refresh();
        $this->assertSame('partially_paid', $run->status);
        $this->assertSame('withheld', $c->fresh()->payment_status);
        $this->assertSame('Bank details missing', $c->fresh()->withheld_reason);
        $paidNow = bcadd((string) $a->net_pay, (string) $b->net_pay, 2);
        $this->assertSame('-'.$paidNow, $ledger->balance($bank));
        // The withheld salary is still owed.
        $this->assertSame((string) $c->net_pay, $ledger->balance(Account::byCode('2500')));

        // Pay the remaining employee later.
        $this->post("/payroll/{$run->id}/pay", [
            'account_id' => $bank->id, 'payment_date' => now()->toDateString(), 'payslip_ids' => [$c->id], 'withheld' => [],
        ])->assertSessionHasNoErrors();

        $this->assertSame('paid', $run->fresh()->status);
        $this->assertSame('0.00', $ledger->balance(Account::byCode('2500')));
        $this->assertSame(0, $run->payslips()->where('payment_status', '!=', 'paid')->count());

        // Paying an already-paid payslip again is refused.
        $this->post("/payroll/{$run->id}/pay", [
            'account_id' => $bank->id, 'payment_date' => now()->toDateString(), 'payslip_ids' => [$a->id], 'withheld' => [],
        ])->assertSessionHasErrors('status');
    }
}
