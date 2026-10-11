<?php

namespace App\Services;

use App\Models\AcademicYear;
use App\Models\Account;
use App\Models\Department;
use App\Models\FiscalYear;
use App\Models\GradeScale;
use App\Models\Plan;
use App\Models\Role;
use App\Models\School;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Provisions a new tenant (SRS 3.1): tenant record, default roles, school,
 * administrator and the starter configuration a school needs on day one.
 */
class SchoolProvisioner
{
    /**
     * @param  array{school_name: string, admin_name: string, email: string, password: string, phone?: string|null, level?: string, residence_type?: string, region?: string|null}  $data
     * @return array{tenant: Tenant, school: School, admin: User}
     */
    public function provision(array $data, ?Plan $plan = null): array
    {
        return DB::transaction(function () use ($data, $plan) {
            $plan ??= Plan::where('code', 'trial')->first() ?? Plan::orderBy('price')->first();

            $tenant = Tenant::create([
                'name' => $data['school_name'],
                'slug' => Str::slug($data['school_name']).'-'.Str::lower(Str::random(4)),
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'plan_id' => $plan?->id,
                'status' => 'trial',
                'trial_ends_at' => now()->addDays(30),
            ]);

            Role::seedDefaultsFor($tenant);

            $school = new School([
                'name' => $data['school_name'],
                'code' => strtoupper(Str::substr(preg_replace('/[^A-Za-z]/', '', $data['school_name']), 0, 4)),
                'level' => $data['level'] ?? 'secondary',
                'residence_type' => $data['residence_type'] ?? 'mixed',
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'region' => $data['region'] ?? null,
                'currency' => 'TZS',
                'timezone' => 'Africa/Dar_es_Salaam',
            ]);
            $school->tenant_id = $tenant->id;
            $school->save();

            $admin = new User([
                'name' => $data['admin_name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'phone' => $data['phone'] ?? null,
                'school_id' => $school->id,
                'role_id' => $tenant->roles()->where('slug', 'school-admin')->value('id'),
            ]);
            $admin->tenant_id = $tenant->id;
            $admin->email_verified_at = now();
            $admin->save();

            app(Tenancy::class)->runAs($school, fn () => $this->seedSchoolDefaults());

            return compact('tenant', 'school', 'admin');
        });
    }

    /** Starter configuration for the school currently in context. */
    public function seedSchoolDefaults(): void
    {
        $this->seedChartOfAccounts();
        $this->seedAcademicCalendar();
        $this->seedGradeScale();
        $this->seedDepartments();
        $this->seedFinanceDefaults();
    }

    public function seedChartOfAccounts(): void
    {
        $chart = [
            ['1000', 'Assets', 'asset', null, false, [
                ['1100', 'Cash on Hand', 'cash'],
                ['1110', 'Petty Cash', 'cash'],
                ['1200', 'CRDB Bank - Operations', 'bank'],
                ['1210', 'NMB Bank - Fees Collection', 'bank'],
                ['1250', 'Mobile Money Float (M-Pesa/Tigo/Airtel)', 'mobile_money'],
                ['1300', 'Student Fees Receivable', 'receivable', true],
                ['1310', 'Staff Advances & Loans', 'current_asset'],
                ['1400', 'Inventory - Stores', 'inventory'],
                ['1450', 'Prepaid Expenses', 'current_asset'],
                ['1500', 'Land & Buildings', 'fixed_asset'],
                ['1510', 'Furniture & Equipment', 'fixed_asset'],
                ['1520', 'Motor Vehicles', 'fixed_asset'],
                ['1530', 'Computers & ICT Equipment', 'fixed_asset'],
                ['1590', 'Accumulated Depreciation', 'contra_asset', false, 'credit'],
            ]],
            ['2000', 'Liabilities', 'liability', null, false, [
                ['2100', 'Accounts Payable - Suppliers', 'payable', true],
                ['2200', 'Accrued Expenses', 'current_liability'],
                ['2300', 'Fees Received in Advance', 'deferred_income'],
                ['2400', 'PAYE Payable', 'statutory'],
                ['2410', 'NSSF Payable', 'statutory'],
                ['2420', 'WCF Payable', 'statutory'],
                ['2430', 'SDL Payable', 'statutory'],
                ['2500', 'Net Salaries Payable', 'salaries_payable'],
                ['2600', 'Loans Payable', 'long_term_liability'],
            ]],
            ['3000', 'Equity & Funds', 'equity', null, false, [
                ['3100', 'Capital / Fund Balance', 'capital'],
                ['3200', 'Accumulated Surplus', 'retained_earnings'],
                ['3900', 'Opening Balance Equity', 'opening_balance'],
            ]],
            ['4000', 'Income', 'income', null, false, [
                ['4100', 'Tuition Fees', 'fee_income'],
                ['4110', 'Boarding Fees', 'fee_income'],
                ['4120', 'Transport Fees', 'fee_income'],
                ['4130', 'Examination Fees', 'fee_income'],
                ['4140', 'Meals & Catering Fees', 'fee_income'],
                ['4150', 'Uniform & Shop Sales', 'sales'],
                ['4160', 'Admission & Registration Fees', 'fee_income'],
                ['4200', 'Grants & Donations', 'other_income'],
                ['4900', 'Other Income', 'other_income'],
            ]],
            ['5000', 'Direct Costs', 'expense', null, false, [
                ['5100', 'Food & Catering Costs', 'direct_cost'],
                ['5110', 'Cost of Uniforms & Shop Goods Sold', 'cost_of_sales'],
                ['5120', 'Teaching & Learning Materials', 'direct_cost'],
            ]],
            ['6000', 'Operating Expenses', 'expense', null, false, [
                ['6100', 'Salaries & Wages', 'payroll_expense'],
                ['6110', 'Employer NSSF Contribution', 'payroll_expense'],
                ['6120', 'WCF Contribution', 'payroll_expense'],
                ['6130', 'Skills Development Levy (SDL)', 'payroll_expense'],
                ['6200', 'Electricity & Water', 'operating_expense'],
                ['6210', 'Communication & Internet', 'operating_expense'],
                ['6300', 'Repairs & Maintenance', 'operating_expense'],
                ['6310', 'Vehicle Fuel & Maintenance', 'operating_expense'],
                ['6400', 'Stationery & Printing', 'operating_expense'],
                ['6500', 'Administrative Expenses', 'operating_expense'],
                ['6600', 'Bank Charges', 'operating_expense'],
                ['6700', 'Depreciation Expense', 'operating_expense'],
                ['6800', 'Sports & Co-curricular', 'operating_expense'],
                ['6900', 'Miscellaneous Expenses', 'operating_expense'],
            ]],
        ];

        $normal = fn (string $type) => in_array($type, ['asset', 'expense'], true) ? 'debit' : 'credit';

        foreach ($chart as [$code, $name, $type, $sub, $postable, $children]) {
            $parent = Account::firstOrCreate(['code' => $code], [
                'name' => $name, 'type' => $type, 'sub_type' => 'header',
                'normal_balance' => $normal($type), 'is_postable' => false,
            ]);

            foreach ($children as $child) {
                Account::firstOrCreate(['code' => $child[0]], [
                    'parent_id' => $parent->id,
                    'name' => $child[1],
                    'type' => $type,
                    'sub_type' => $child[2],
                    'is_control' => $child[3] ?? false,
                    'normal_balance' => $child[4] ?? $normal($type),
                    'is_postable' => true,
                ]);
            }
        }
    }

    public function seedAcademicCalendar(): void
    {
        $year = (int) now()->format('Y');

        $academicYear = AcademicYear::firstOrCreate(['name' => (string) $year], [
            'start_date' => "$year-01-08",
            'end_date' => "$year-12-06",
            'is_current' => true,
        ]);

        $termOneCurrent = now()->month <= 6;

        $academicYear->terms()->firstOrCreate(['name' => 'Term I'], [
            'start_date' => "$year-01-08", 'end_date' => "$year-06-07", 'is_current' => $termOneCurrent,
        ]);
        $academicYear->terms()->firstOrCreate(['name' => 'Term II'], [
            'start_date' => "$year-07-01", 'end_date' => "$year-12-06", 'is_current' => ! $termOneCurrent,
        ]);

        FiscalYear::firstOrCreate(['name' => "FY $year"], [
            'start_date' => "$year-01-01", 'end_date' => "$year-12-31", 'status' => 'open',
        ]);
    }

    /** NECTA-style default grading; fully editable per school. */
    public function seedGradeScale(): void
    {
        if (GradeScale::exists()) {
            return;
        }

        foreach ([
            ['A', 75, 100, 1, 'Excellent'],
            ['B', 65, 74.99, 2, 'Very Good'],
            ['C', 45, 64.99, 3, 'Good'],
            ['D', 30, 44.99, 4, 'Satisfactory'],
            ['F', 0, 29.99, 5, 'Fail'],
        ] as [$grade, $min, $max, $points, $remark]) {
            GradeScale::create(['grade' => $grade, 'min_score' => $min, 'max_score' => $max, 'points' => $points, 'remark' => $remark]);
        }
    }

    public function seedDepartments(): void
    {
        foreach (['Sciences', 'Languages', 'Humanities', 'Mathematics', 'Administration', 'Support Services'] as $name) {
            Department::firstOrCreate(['name' => $name]);
        }
    }

    /** Fee categories, leave types and statutory payroll components (rates must be verified locally). */
    public function seedFinanceDefaults(): void
    {
        $acc = fn (string $code) => Account::where('code', $code)->value('id');

        foreach ([
            ['Tuition Fee', 'TUI', '4100'],
            ['Boarding Fee', 'BRD', '4110'],
            ['Transport Fee', 'TRN', '4120'],
            ['Examination Fee', 'EXM', '4130'],
            ['Meals Fee', 'MEL', '4140'],
            ['Admission Fee', 'ADM', '4160'],
        ] as [$name, $code, $account]) {
            DB::table('fee_categories')->updateOrInsert(
                ['school_id' => app(Tenancy::class)->schoolId(), 'code' => $code],
                [
                    'tenant_id' => app(Tenancy::class)->tenantId(),
                    'name' => $name,
                    'income_account_id' => $acc($account),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        foreach ([['Annual Leave', 28], ['Sick Leave', 14], ['Maternity Leave', 84], ['Paternity Leave', 3], ['Compassionate Leave', 4]] as [$name, $days]) {
            DB::table('leave_types')->updateOrInsert(
                ['school_id' => app(Tenancy::class)->schoolId(), 'name' => $name],
                ['tenant_id' => app(Tenancy::class)->tenantId(), 'days_per_year' => $days, 'is_paid' => true, 'created_at' => now(), 'updated_at' => now()],
            );
        }

        foreach ([
            ['PAYE', 'PAYE', 'deduction', 'paye', 0, '2400'],
            ['NSSF (Employee 10%)', 'NSSF_EE', 'deduction', 'percent_of_basic', 10, '2410'],
            ['NSSF (Employer 10%)', 'NSSF_ER', 'employer_contribution', 'percent_of_basic', 10, '2410'],
            ['WCF (Employer 0.5%)', 'WCF', 'employer_contribution', 'percent_of_basic', 0.5, '2420'],
            ['SDL (Employer 3.5%)', 'SDL', 'employer_contribution', 'percent_of_basic', 3.5, '2430'],
        ] as [$name, $code, $type, $calc, $value, $account]) {
            DB::table('salary_components')->updateOrInsert(
                ['school_id' => app(Tenancy::class)->schoolId(), 'code' => $code],
                [
                    'tenant_id' => app(Tenancy::class)->tenantId(),
                    'name' => $name,
                    'type' => $type,
                    'calculation' => $calc,
                    'value' => $value,
                    'is_statutory' => true,
                    'applies_to_all' => true,
                    'account_id' => $acc($account),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }
    }
}
