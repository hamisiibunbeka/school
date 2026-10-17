<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fund transfers between the school's own cash / bank / mobile-money
 * accounts (maker-checker, optional bank charge) and bank & mobile-money
 * reconciliation against statements.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fund_transfers', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('transfer_no');
            $table->date('date');
            $table->foreignId('from_account_id')->constrained('accounts');
            $table->foreignId('to_account_id')->constrained('accounts');
            $table->decimal('amount', 15, 2);
            $table->decimal('charges', 15, 2)->default(0); // taken from the source account on top of the amount
            $table->foreignId('charge_account_id')->nullable()->constrained('accounts');
            $table->string('method'); // bank_transfer | cash_deposit | cash_withdrawal | mobile_money | cheque
            $table->string('reference')->nullable(); // bank slip / transaction id
            $table->string('description');
            $table->string('status')->default('pending'); // pending | posted | rejected | void
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('journal_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['school_id', 'transfer_no']);
            $table->index(['school_id', 'status', 'date']);
        });

        Schema::create('bank_reconciliations', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('account_id')->constrained('accounts');
            $table->date('statement_date');
            $table->decimal('opening_balance', 15, 2); // per statement
            $table->decimal('closing_balance', 15, 2); // per statement
            $table->string('status')->default('draft'); // draft | completed
            $table->decimal('book_balance', 15, 2)->nullable(); // snapshot at completion
            $table->string('notes')->nullable();
            $table->foreignId('prepared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['school_id', 'account_id', 'statement_date']);
        });

        Schema::table('journal_lines', function (Blueprint $table) {
            // Set when the line is ticked as cleared on a statement; locked once that reconciliation is completed.
            $table->foreignId('bank_reconciliation_id')->nullable()->after('account_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('journal_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bank_reconciliation_id');
        });
        Schema::dropIfExists('bank_reconciliations');
        Schema::dropIfExists('fund_transfers');
    }
};
