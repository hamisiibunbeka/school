<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HR & Payroll: workflow columns for payroll approval/payment and leave decisions.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_runs', function (Blueprint $table) {
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->foreignId('paid_by')->nullable()->after('journal_id')->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable()->after('paid_by');
            $table->foreignId('payment_account_id')->nullable()->after('paid_at')->constrained('accounts')->nullOnDelete();
            $table->foreignId('payment_journal_id')->nullable()->after('payment_account_id')->constrained('journals')->nullOnDelete();
            $table->string('notes', 500)->nullable()->after('payment_journal_id');
        });

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->string('decision_note', 500)->nullable()->after('approved_at');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_runs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('paid_by');
            $table->dropConstrainedForeignId('payment_account_id');
            $table->dropConstrainedForeignId('payment_journal_id');
            $table->dropColumn(['approved_at', 'paid_at', 'notes']);
        });

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn('decision_note');
        });
    }
};
