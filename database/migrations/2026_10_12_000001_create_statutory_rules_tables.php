<?php

use App\Models\School;
use App\Services\StatutoryDefaults;
use App\Support\Tenancy;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Configurable statutory rules (Tanzania baseline):
 *  - versioned PAYE tax tables with editable bands,
 *  - richer statutory component settings (base, thresholds, caps, probation exclusion),
 *  - per-employee exclusions and tax status,
 *  - a register of non-payroll government levies (service levy, licences...).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_tables', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');                       // e.g. "PAYE Mainland FY 2025/26"
            $table->string('jurisdiction')->default('Tanzania Mainland');
            $table->date('effective_from');
            $table->boolean('is_active')->default(true);
            $table->string('taxable_base')->default('gross_less_pension'); // gross | gross_less_pension
            $table->decimal('secondary_rate', 6, 3)->default(30);    // % flat, secondary employment
            $table->decimal('non_resident_rate', 6, 3)->default(15); // % flat, non-resident employees
            $table->string('source_url')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('tax_bands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tax_table_id')->constrained()->cascadeOnDelete();
            $table->decimal('lower_limit', 15, 2);           // exclusive lower bound
            $table->decimal('upper_limit', 15, 2)->nullable(); // inclusive upper bound, null = no limit
            $table->decimal('rate', 6, 3);                    // percent on the excess over lower_limit
            $table->decimal('base_tax', 15, 2)->default(0);   // tax on everything below lower_limit
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::table('salary_components', function (Blueprint $table) {
            $table->string('base')->default('basic')->after('calculation');          // basic | gross
            $table->string('authority')->nullable()->after('name');                  // TRA, NSSF, WCF, HESLB ...
            $table->unsignedInteger('min_employees')->nullable()->after('value');    // e.g. SDL: 10
            $table->decimal('cap_amount', 15, 2)->nullable()->after('min_employees'); // max per employee per month
            $table->boolean('exclude_on_probation')->default(false)->after('applies_to_all');
            $table->string('description')->nullable();
        });

        Schema::table('employee_salary_components', function (Blueprint $table) {
            $table->boolean('is_excluded')->default(false)->after('amount');
            $table->string('reason')->nullable()->after('is_excluded');
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->date('probation_end_date')->nullable()->after('hire_date');
            // primary (resident bands) | secondary (flat) | non_resident (flat) | exempt
            $table->string('tax_status')->default('primary')->after('tin');
        });

        Schema::create('compliance_obligations', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('authority');                     // Local Government Authority, TRA, OSHA ...
            $table->string('basis')->default('fixed');      // fixed | percent_of_turnover | percent_of_payroll
            $table->decimal('rate', 8, 4)->nullable();       // % when percentage based
            $table->decimal('amount', 15, 2)->nullable();    // fixed amount
            $table->string('frequency')->default('annual'); // monthly | quarterly | semi_annual | annual
            $table->unsignedTinyInteger('due_day')->nullable();   // day of month after period end
            $table->foreignId('expense_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->string('source_url')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('compliance_payments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('compliance_obligation_id')->constrained()->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('base_amount', 15, 2)->nullable(); // turnover / payroll used
            $table->decimal('amount', 15, 2);
            $table->date('paid_on');
            $table->string('reference')->nullable();
            $table->foreignId('payment_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->foreignId('journal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Existing data: computed statutory items run on gross pay; then seed defaults per school.
        DB::table('salary_components')->whereIn('code', ['NSSF_EE', 'NSSF_ER', 'WCF', 'SDL'])->update(['base' => 'gross']);

        foreach (School::all() as $school) {
            app(Tenancy::class)->runAs($school, fn () => app(StatutoryDefaults::class)->apply());
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('compliance_payments');
        Schema::dropIfExists('compliance_obligations');
        Schema::table('employees', fn (Blueprint $t) => $t->dropColumn(['probation_end_date', 'tax_status']));
        Schema::table('employee_salary_components', fn (Blueprint $t) => $t->dropColumn(['is_excluded', 'reason']));
        Schema::table('salary_components', fn (Blueprint $t) => $t->dropColumn(['base', 'authority', 'min_employees', 'cap_amount', 'exclude_on_probation', 'description']));
        Schema::dropIfExists('tax_bands');
        Schema::dropIfExists('tax_tables');
    }
};
