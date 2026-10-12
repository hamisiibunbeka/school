<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\ComplianceObligation;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\PayrollRun;
use App\Models\SalaryComponent;
use App\Models\TaxTable;
use App\Services\Payroll\PayrollCalculator;
use App\Services\Payroll\PayrollRules;
use App\Services\Payroll\PayrollService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StatutoryTest extends TestCase
{
    use RefreshDatabase;

    private $school;

    private $admin;

    protected function setUp(): void
    {
        parent::setUp();
        ['school' => $this->school, 'admin' => $this->admin] = $this->makeSchool();
        app(Tenancy::class)->setSchool($this->school);
        $this->actingAs($this->admin);
    }

    private function employee(int $n, string $salary, array $extra = []): Employee
    {
        return Employee::create(array_merge([
            'employee_no' => 'E'.$n, 'first_name' => 'Staff', 'last_name' => (string) $n, 'basic_salary' => $salary, 'status' => 'active',
        ], $extra));
    }

    public function test_paye_matches_tra_published_bands(): void
    {
        $calc = app(PayrollCalculator::class);
        $rules = PayrollRules::forPeriod(now()->toDateString());

        foreach (['250000' => '0.00', '400000' => '10400.00', '520000' => '20000.00', '760000' => '68000.00', '1500000' => '278000.00'] as $taxable => $expected) {
            [$tax] = $calc->payeFor('primary', $taxable, $rules);
            $this->assertSame($expected, $tax, "PAYE on {$taxable}");
        }

        [$secondary] = $calc->payeFor('secondary', '400000', $rules);
        [$nonResident] = $calc->payeFor('non_resident', '400000', $rules);
        [$exempt] = $calc->payeFor('exempt', '400000', $rules);
        $this->assertSame(['120000.00', '60000.00', '0.00'], [$secondary, $nonResident, $exempt]);
    }

    public function test_sdl_only_applies_from_ten_employees_and_probation_skips_nssf(): void
    {
        SalaryComponent::whereIn('code', ['NSSF_EE', 'NSSF_ER'])->update(['exclude_on_probation' => true]);

        $probationer = $this->employee(1, '1000000', ['probation_end_date' => now()->addMonths(3)->toDateString()]);
        foreach (range(2, 9) as $n) {
            $this->employee($n, '800000');
        }

        $run = app(PayrollService::class)->createRun(now()->format('Y-m'));
        $slip = $run->payslips()->where('employee_id', $probationer->id)->first();
        $codes = fn ($slip) => collect([...$slip->breakdown['deductions'], ...$slip->breakdown['employer']])->pluck('code')->all();

        $this->assertNotContains('SDL', $codes($slip), '9 employees: SDL not payable');
        $this->assertNotContains('NSSF_EE', $codes($slip), 'On probation: no NSSF');
        $this->assertContains('On probation', collect($slip->breakdown['skipped'])->pluck('reason')->all());
        // No NSSF → PAYE is charged on full gross: 128,000 + 30% × 0 = 128,000
        $this->assertSame('128000.00', (string) $slip->paye);

        // Tenth employee: SDL becomes payable on recalculation.
        $this->employee(10, '800000');
        app(PayrollService::class)->calculate($run->fresh());
        $slip = $run->payslips()->where('employee_id', '!=', $probationer->id)->first();
        $this->assertContains('SDL', $codes($slip));
    }

    public function test_individual_exclusion_is_respected(): void
    {
        $employee = $this->employee(1, '600000');
        $wcf = SalaryComponent::where('code', 'WCF')->first();
        EmployeeSalaryComponent::create(['employee_id' => $employee->id, 'salary_component_id' => $wcf->id, 'is_excluded' => true]);

        $run = app(PayrollService::class)->createRun(now()->format('Y-m'));
        $codes = collect($run->payslips->first()->breakdown['employer'])->pluck('code');

        $this->assertNotContains('WCF', $codes);
        $this->assertContains('NSSF_ER', $codes);
    }

    public function test_admin_can_edit_bands_and_payroll_uses_them(): void
    {
        $table = TaxTable::first();

        $this->put("/payroll/statutory/tables/{$table->id}", [
            'name' => 'Edited', 'jurisdiction' => 'Tanzania Mainland', 'effective_from' => '2021-07-01', 'is_active' => true,
            'taxable_base' => 'gross_less_pension', 'secondary_rate' => 30, 'non_resident_rate' => 15, 'auto_base_tax' => true,
            'bands' => [
                ['lower_limit' => 0, 'upper_limit' => 300000, 'rate' => 0],
                ['lower_limit' => 300000, 'upper_limit' => null, 'rate' => 10],
            ],
        ])->assertSessionHasNoErrors();

        [$tax] = app(PayrollCalculator::class)->payeFor('primary', '500000', PayrollRules::forPeriod(now()->toDateString()));
        $this->assertSame('20000.00', $tax);
    }

    public function test_band_gaps_are_rejected(): void
    {
        $table = TaxTable::first();

        $this->put("/payroll/statutory/tables/{$table->id}", [
            'name' => 'Bad', 'jurisdiction' => 'TZ', 'effective_from' => '2021-07-01', 'taxable_base' => 'gross', 'secondary_rate' => 30,
            'non_resident_rate' => 15, 'auto_base_tax' => true,
            'bands' => [
                ['lower_limit' => 0, 'upper_limit' => 300000, 'rate' => 0],
                ['lower_limit' => 350000, 'upper_limit' => null, 'rate' => 10],
            ],
        ])->assertSessionHasErrors('bands');
    }

    public function test_teacher_can_view_but_not_edit_statutory_rules(): void
    {
        $bursar = $this->makeUserWithRole($this->school, 'bursar'); // payroll.manage
        $auditor = $this->makeUserWithRole($this->school, 'auditor'); // payroll.view only

        $this->actingAs($auditor)->get('/payroll/statutory')->assertOk();
        $this->actingAs($auditor)->put('/payroll/statutory/tables/'.TaxTable::first()->id, [])->assertForbidden();
        $this->actingAs($bursar)->get('/payroll/statutory')->assertOk();
    }

    public function test_service_levy_payment_posts_to_ledger(): void
    {
        $levy = ComplianceObligation::where('name', 'Service Levy')->firstOrFail();
        $bank = Account::byCode('1200');

        $this->post("/accounting/compliance/{$levy->id}/pay", [
            'period_start' => now()->startOfMonth()->toDateString(), 'period_end' => now()->endOfMonth()->toDateString(),
            'base_amount' => 10000000, 'amount' => 30000, 'paid_on' => now()->toDateString(), 'reference' => 'LGA-123',
            'payment_account_id' => $bank->id,
        ])->assertSessionHasNoErrors();

        $payment = $levy->payments()->first();
        $this->assertNotNull($payment->journal_id);
        $this->assertSame('-30000.00', app(\App\Services\Accounting\LedgerService::class)->balance($bank));
        $this->assertSame('30000.00', app(\App\Services\Accounting\LedgerService::class)->balance(Account::byCode('6140')));
        $this->get('/accounting/compliance')->assertOk();
    }
}
