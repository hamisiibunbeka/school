<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------------- Accounting core ----------------
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('code', 20);
            $table->string('name');
            $table->string('type'); // asset | liability | equity | income | expense
            $table->string('sub_type')->nullable(); // cash | bank | receivable | payable | current_asset | fixed_asset | direct_cost | operating_expense | other_income ...
            $table->string('normal_balance', 6); // debit | credit
            $table->boolean('is_control')->default(false);
            $table->boolean('is_postable')->default(true);
            $table->boolean('is_active')->default(true);
            $table->string('description')->nullable();
            $table->timestamps();
            $table->unique(['school_id', 'code']);
        });

        Schema::create('fiscal_years', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status')->default('open'); // open | closed
            $table->timestamps();
        });

        Schema::create('journals', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('journal_no');
            $table->date('date');
            $table->string('type')->default('general'); // general | opening | fees | receipt | expense | payroll | inventory | reversal
            $table->string('reference')->nullable();
            $table->string('narration');
            $table->nullableMorphs('source');
            $table->decimal('total', 15, 2)->default(0);
            $table->string('status')->default('draft'); // draft | submitted | posted | rejected | reversed
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('reversal_of_id')->nullable()->constrained('journals')->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'journal_no']);
            $table->index(['school_id', 'status', 'date']);
        });

        Schema::create('journal_lines', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('journal_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained();
            $table->decimal('debit', 15, 2)->default(0);
            $table->decimal('credit', 15, 2)->default(0);
            $table->string('narration')->nullable();
            $table->string('cost_center')->nullable();
            $table->timestamps();
            $table->index(['account_id', 'journal_id']);
        });

        Schema::create('budgets', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('fiscal_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->string('notes')->nullable();
            $table->timestamps();
            $table->unique(['fiscal_year_id', 'account_id']);
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('contact_person')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('tin')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('voucher_no');
            $table->date('date');
            $table->foreignId('expense_account_id')->constrained('accounts');
            $table->foreignId('payment_account_id')->constrained('accounts'); // cash / bank
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('payee')->nullable();
            $table->decimal('amount', 15, 2);
            $table->string('description');
            $table->string('reference')->nullable();
            $table->string('payment_method')->default('cash');
            $table->string('status')->default('pending'); // pending | approved | paid | rejected | void
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('journal_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'voucher_no']);
        });

        // ---------------- Fees & billing ----------------
        Schema::create('fee_categories', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name'); // Tuition, Boarding, Transport, Exams, Uniform ...
            $table->string('code')->nullable();
            $table->foreignId('income_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('fee_structures', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('term_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $table->foreignId('fee_category_id')->constrained()->cascadeOnDelete();
            $table->string('residence_type')->default('all'); // all | day | boarding
            $table->decimal('amount', 15, 2);
            $table->date('due_date')->nullable();
            $table->timestamps();
        });

        Schema::create('fee_discounts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('fee_category_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name'); // Sibling discount, Scholarship ...
            $table->string('type')->default('percent'); // percent | fixed
            $table->decimal('value', 15, 2);
            $table->string('reason')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('invoice_no');
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('term_id')->nullable()->constrained()->nullOnDelete();
            $table->date('issue_date');
            $table->date('due_date')->nullable();
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('discount', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->decimal('paid', 15, 2)->default(0);
            $table->decimal('balance', 15, 2)->default(0);
            $table->string('status')->default('unpaid'); // draft | unpaid | partial | paid | cancelled
            $table->string('notes')->nullable();
            $table->foreignId('journal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'invoice_no']);
            $table->index(['school_id', 'status']);
        });

        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('fee_category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description');
            $table->decimal('amount', 15, 2);
            $table->decimal('discount', 15, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('receipt_no');
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->date('payment_date');
            $table->decimal('amount', 15, 2);
            $table->decimal('unallocated', 15, 2)->default(0);
            $table->string('method')->default('cash'); // cash | bank | mobile_money | cheque | card
            $table->string('reference')->nullable();
            $table->string('payer_name')->nullable();
            $table->foreignId('deposit_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('notes')->nullable();
            $table->string('status')->default('posted'); // posted | void
            $table->string('void_reason')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('journal_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'receipt_no']);
            $table->unique(['school_id', 'method', 'reference']);
        });

        Schema::create('payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2);
            $table->timestamps();
        });

        // ---------------- HR & payroll ----------------
        Schema::create('leave_types', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->unsignedSmallInteger('days_per_year')->default(0);
            $table->boolean('is_paid')->default(true);
            $table->timestamps();
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained()->cascadeOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedSmallInteger('days');
            $table->string('reason')->nullable();
            $table->string('status')->default('pending'); // pending | approved | rejected | cancelled
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('salary_components', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name'); // Housing allowance, NSSF, PAYE, Loan ...
            $table->string('code')->nullable();
            $table->string('type'); // allowance | deduction | employer_contribution
            $table->string('calculation')->default('fixed'); // fixed | percent_of_basic | paye
            $table->decimal('value', 15, 4)->default(0);
            $table->boolean('is_statutory')->default(false);
            $table->boolean('applies_to_all')->default(false);
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('employee_salary_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('salary_component_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 15, 2)->nullable(); // override
            $table->timestamps();
            $table->unique(['employee_id', 'salary_component_id'], 'emp_salary_component_unique');
        });

        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('period', 7); // YYYY-MM
            $table->date('payment_date')->nullable();
            $table->decimal('total_gross', 15, 2)->default(0);
            $table->decimal('total_deductions', 15, 2)->default(0);
            $table->decimal('total_net', 15, 2)->default(0);
            $table->decimal('total_employer', 15, 2)->default(0);
            $table->string('status')->default('draft'); // draft | approved | paid
            $table->json('rules_snapshot')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('journal_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'period']);
        });

        Schema::create('payslips', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('payroll_run_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->decimal('basic_salary', 15, 2);
            $table->decimal('allowances', 15, 2)->default(0);
            $table->decimal('gross_pay', 15, 2);
            $table->decimal('paye', 15, 2)->default(0);
            $table->decimal('nssf_employee', 15, 2)->default(0);
            $table->decimal('other_deductions', 15, 2)->default(0);
            $table->decimal('total_deductions', 15, 2)->default(0);
            $table->decimal('net_pay', 15, 2);
            $table->decimal('employer_contributions', 15, 2)->default(0);
            $table->json('breakdown')->nullable();
            $table->timestamps();
            $table->unique(['payroll_run_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        foreach ([
            'payslips', 'payroll_runs', 'employee_salary_components', 'salary_components',
            'leave_requests', 'leave_types', 'payment_allocations', 'payments', 'invoice_items',
            'invoices', 'fee_discounts', 'fee_structures', 'fee_categories', 'expenses',
            'suppliers', 'budgets', 'journal_lines', 'journals', 'fiscal_years', 'accounts',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
