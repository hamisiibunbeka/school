<?php

namespace App\Services;

use App\Models\Account;
use App\Models\ComplianceObligation;
use App\Models\SalaryComponent;
use App\Models\TaxTable;

/**
 * Tanzania Mainland statutory baseline (researched October 2026). Idempotent:
 * only creates what is missing and never overwrites values a school has edited.
 *
 * Sources (must be re-verified by the school's tax adviser after each Finance Act):
 *  - PAYE bands: TRA "Taxes and Duties at a Glance 2025/26" (in force since 1 July 2021).
 *  - SDL 3.5% of gross emoluments, employers with 10+ employees: TRA SDL page.
 *  - NSSF 10% employee + 10% employer: NSSF contribution rates.
 *  - WCF 0.5% employer (private sector): WCF / PwC tax summaries.
 *  - HESLB 15% of basic salary for loan beneficiaries: HESLB repayment obligations.
 *  - Service levy 0.3% of turnover (after VAT): Local Government Finances Act.
 */
class StatutoryDefaults
{
    public const PAYE_SOURCE = 'https://www.tra.go.tz/images/uploads/pages/TAXES_AND_DUTIES_AT_A_GLANCE_2025_2026.pdf';

    public function apply(): void
    {
        $this->ensureAccounts();
        $this->ensureTaxTable();
        $this->ensureComponents();
        $this->ensureObligations();
    }

    private function ensureAccounts(): void
    {
        $liabilities = Account::where('code', '2000')->first();
        $expenses = Account::where('code', '6000')->first();

        if ($liabilities) {
            Account::firstOrCreate(['code' => '2440'], [
                'parent_id' => $liabilities->id, 'name' => 'HESLB Loan Repayments Payable', 'type' => 'liability',
                'sub_type' => 'statutory', 'normal_balance' => 'credit', 'is_postable' => true,
            ]);
        }

        if ($expenses) {
            Account::firstOrCreate(['code' => '6140'], [
                'parent_id' => $expenses->id, 'name' => 'Statutory Levies, Licences & Permits', 'type' => 'expense',
                'sub_type' => 'operating_expense', 'normal_balance' => 'debit', 'is_postable' => true,
            ]);
        }
    }

    private function ensureTaxTable(): void
    {
        if (TaxTable::exists()) {
            return;
        }

        $table = TaxTable::create([
            'name' => 'PAYE — Resident individuals (monthly)',
            'jurisdiction' => 'Tanzania Mainland',
            'effective_from' => '2021-07-01',
            'is_active' => true,
            'taxable_base' => 'gross_less_pension',
            'secondary_rate' => 30,
            'non_resident_rate' => 15,
            'source_url' => self::PAYE_SOURCE,
            'notes' => 'Monthly bands per TRA Taxes and Duties at a Glance 2025/26. Taxable income = gross pay less the employee pension (NSSF) contribution. Secondary employment and non-resident employees are taxed at flat rates.',
        ]);

        foreach ([
            [0, 270000, 0, 0],
            [270000, 520000, 8, 0],
            [520000, 760000, 20, 20000],
            [760000, 1000000, 25, 68000],
            [1000000, null, 30, 128000],
        ] as $i => [$from, $to, $rate, $base]) {
            $table->bands()->create(['lower_limit' => $from, 'upper_limit' => $to, 'rate' => $rate, 'base_tax' => $base, 'sort' => $i]);
        }
    }

    private function ensureComponents(): void
    {
        $acc = fn (string $code) => Account::where('code', $code)->value('id');

        $meta = [
            'PAYE' => ['authority' => 'TRA', 'base' => 'gross', 'description' => 'Pay As You Earn on taxable income (gross less NSSF) using the PAYE table in force.'],
            'NSSF_EE' => ['authority' => 'NSSF', 'base' => 'gross', 'description' => 'Employee social security contribution (10% of gross).'],
            'NSSF_ER' => ['authority' => 'NSSF', 'base' => 'gross', 'description' => 'Employer social security contribution (10% of gross).'],
            'WCF' => ['authority' => 'WCF', 'base' => 'gross', 'description' => "Workers' Compensation Fund, employer only (0.5% of gross, private sector)."],
            'SDL' => ['authority' => 'TRA', 'base' => 'gross', 'min_employees' => 10, 'description' => 'Skills Development Levy (3.5% of gross emoluments) — only payable when the school has 10 or more employees.'],
        ];

        foreach ($meta as $code => $values) {
            $component = SalaryComponent::where('code', $code)->first();
            if ($component && ! $component->authority) {
                $component->forceFill($values)->save();
            }
        }

        if (! SalaryComponent::where('code', 'HESLB')->exists()) {
            SalaryComponent::create([
                'name' => 'HESLB Loan Repayment',
                'code' => 'HESLB',
                'authority' => 'HESLB',
                'type' => 'deduction',
                'calculation' => 'percent_of_basic',
                'base' => 'basic',
                'value' => 15,
                'is_statutory' => true,
                'applies_to_all' => false,
                'account_id' => $acc('2440'),
                'is_active' => true,
                'description' => 'Higher Education Students\' Loans Board repayment (15% of basic salary). Assign only to staff who are loan beneficiaries.',
            ]);
        }
    }

    private function ensureObligations(): void
    {
        if (ComplianceObligation::exists()) {
            return;
        }

        $levies = Account::where('code', '6140')->value('id');

        foreach ([
            ['Service Levy', 'Local Government Authority (Municipal/District Council)', 'percent_of_turnover', 0.3, null, 'monthly', 20,
                'https://media.tanzlii.org/media/legislation/332533/source_file/c50e6f30fbcb1aba/2021-182.pdf',
                '0.3% of turnover after VAT and excise duty, paid to the council where the school operates. Confirm with your council whether fee income of the school is levied or exempt.'],
            ['Fire & Rescue Compliance Certificate', 'Tanzania Fire and Rescue Force', 'fixed', null, 0, 'annual', null, null,
                'Annual fire safety inspection fee. Enter the amount assessed for your premises.'],
            ['OSHA Workplace Compliance Licence', 'Occupational Safety and Health Authority (OSHA)', 'fixed', null, 0, 'annual', null, null,
                'Workplace registration / compliance licence. Enter the amount on your OSHA assessment.'],
            ['Property Tax', 'Local Government Authority / TRA', 'fixed', null, 0, 'annual', null, null,
                'Annual property rates on school buildings, if not exempt. Enter the assessed amount.'],
        ] as [$name, $authority, $basis, $rate, $amount, $frequency, $dueDay, $url, $notes]) {
            ComplianceObligation::create([
                'name' => $name, 'authority' => $authority, 'basis' => $basis, 'rate' => $rate, 'amount' => $amount,
                'frequency' => $frequency, 'due_day' => $dueDay, 'expense_account_id' => $levies, 'is_active' => true,
                'source_url' => $url, 'notes' => $notes,
            ]);
        }
    }
}
