<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per-employee salary payment: an approved payroll can pay some staff and
 * withhold others (with a reason); the run is "partially_paid" until all
 * payslips are settled.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->string('payment_status')->default('pending')->after('breakdown'); // pending | paid | withheld
            $table->date('paid_at')->nullable()->after('payment_status');
            $table->string('withheld_reason')->nullable()->after('paid_at');
            $table->foreignId('payment_journal_id')->nullable()->after('withheld_reason')->constrained('journals')->nullOnDelete();
            $table->foreignId('paid_by')->nullable()->after('payment_journal_id')->constrained('users')->nullOnDelete();
        });

        // Runs already marked paid: every payslip was paid with that run's payment journal.
        DB::table('payslips')
            ->join('payroll_runs', 'payroll_runs.id', '=', 'payslips.payroll_run_id')
            ->where('payroll_runs.status', 'paid')
            ->update([
                'payslips.payment_status' => 'paid',
                'payslips.paid_at' => DB::raw('payroll_runs.payment_date'),
                'payslips.payment_journal_id' => DB::raw('payroll_runs.payment_journal_id'),
                'payslips.paid_by' => DB::raw('payroll_runs.paid_by'),
            ]);
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payment_journal_id');
            $table->dropConstrainedForeignId('paid_by');
            $table->dropColumn(['payment_status', 'paid_at', 'withheld_reason']);
        });
    }
};
