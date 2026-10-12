<?php

namespace App\Services\Payroll;

/**
 * Statutory payroll rule pack (Tanzania mainland, monthly).
 *
 * IMPORTANT: statutory rates change with each Finance Act. These values are a
 * configurable baseline and MUST be verified by the school's payroll officer /
 * tax advisor before use. The exact rules used are snapshotted on every payroll
 * run (payroll_runs.rules_snapshot) so a run can always be reproduced.
 */
class PayrollRules
{
    public const VERSION = 'TZ-MAINLAND-2026.1';

    /**
     * @return array{
     *   version: string, country: string, currency: string, frequency: string,
     *   paye_bands: array<int, array{from: string, to: string|null, rate: string, base_tax: string}>,
     *   paye_taxable: string, statutory_gross_codes: array<int, string>,
     *   employer_expense_accounts: array<string, string>, default_employer_expense_account: string,
     *   salaries_expense_account: string, net_payable_account: string, fallback_liability_account: string,
     *   working_days_per_month: int, notice: string
     * }
     */
    /**
     * Rules for a pay period: the built-in pack overlaid with the school's PAYE
     * table in force on the period end date (editable under Payroll → Statutory Rules).
     *
     * @return array<string, mixed>
     */
    public static function forPeriod(string $periodEnd): array
    {
        $rules = static::current();
        $table = \App\Models\TaxTable::inForce($periodEnd);

        if ($table && $table->bands->isNotEmpty()) {
            $rules['paye_bands'] = $table->toRuleBands();
            $rules['paye_taxable'] = $table->taxable_base === 'gross' ? 'gross' : 'gross_less_nssf_employee';
            $rules['secondary_rate'] = (string) $table->secondary_rate;
            $rules['non_resident_rate'] = (string) $table->non_resident_rate;
            $rules['tax_table'] = [
                'id' => $table->id,
                'name' => $table->name,
                'effective_from' => $table->effective_from->toDateString(),
                'jurisdiction' => $table->jurisdiction,
            ];
            $rules['version'] = self::VERSION.'+T'.$table->id.'@'.$table->updated_at?->format('YmdHis');
        }

        return $rules;
    }

    public static function current(): array
    {
        return [
            'version' => self::VERSION,
            'country' => 'Tanzania (mainland)',
            'currency' => 'TZS',
            'frequency' => 'monthly',
            // Monthly PAYE bands for resident individuals: tax = base_tax + rate × (taxable − from)
            'paye_bands' => [
                ['from' => '0', 'to' => '270000', 'rate' => '0', 'base_tax' => '0'],
                ['from' => '270000', 'to' => '520000', 'rate' => '0.08', 'base_tax' => '0'],
                ['from' => '520000', 'to' => '760000', 'rate' => '0.20', 'base_tax' => '20000'],
                ['from' => '760000', 'to' => '1000000', 'rate' => '0.25', 'base_tax' => '68000'],
                ['from' => '1000000', 'to' => null, 'rate' => '0.30', 'base_tax' => '128000'],
            ],
            // PAYE is charged on gross pay less the employee pension (NSSF) contribution.
            'paye_taxable' => 'gross_less_nssf_employee',
            // Flat PAYE rates (%) for secondary employment and non-resident employees.
            'secondary_rate' => '30',
            'non_resident_rate' => '15',
            // Statutory percentage components computed on GROSS pay instead of basic.
            'statutory_gross_codes' => ['NSSF_EE', 'NSSF_ER', 'WCF', 'SDL'],
            // Employer contribution expense accounts (Dr) by component code; liability (Cr) is the component's GL account.
            'employer_expense_accounts' => ['NSSF_ER' => '6110', 'WCF' => '6120', 'SDL' => '6130'],
            'default_employer_expense_account' => '6100',
            'salaries_expense_account' => '6100',
            'net_payable_account' => '2500',
            'fallback_liability_account' => '2200',
            // Used to pro-rate unpaid leave.
            'working_days_per_month' => 22,
            'notice' => 'Statutory rates (PAYE, NSSF, WCF, SDL) are configurable defaults and must be verified against current TRA/NSSF/WCF regulations before approval.',
        ];
    }
}
