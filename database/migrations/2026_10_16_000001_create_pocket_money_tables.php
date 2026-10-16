<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Boarding pocket money: money students hand to a patron/matron for safe
 * keeping and draw down on demand. Every movement is an immutable,
 * numbered transaction carrying the running balance; mistakes are
 * corrected by reversal, never by editing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pocket_money_accounts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            // Patron/matron who physically holds this student's cash.
            $table->foreignId('custodian_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('balance', 14, 2)->default(0);
            $table->decimal('daily_limit', 14, 2)->nullable();
            $table->string('pin_hash')->nullable();
            $table->unsignedTinyInteger('failed_pin_attempts')->default(0);
            $table->string('status')->default('active'); // active | closed
            $table->string('notes')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->unique(['school_id', 'student_id']);
        });

        Schema::create('pocket_money_transactions', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('pocket_money_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->string('reference');
            $table->string('type'); // deposit | withdrawal | reversal
            $table->decimal('amount', 14, 2); // signed: + money in, - money out
            $table->decimal('balance_after', 14, 2);
            $table->dateTime('transacted_at');
            $table->string('method')->nullable(); // deposits: cash | mobile_money | bank
            $table->string('counterparty')->nullable(); // who brought / collected the cash
            $table->string('counterparty_phone')->nullable();
            $table->string('category')->nullable(); // withdrawals: canteen, toiletries ...
            $table->string('description')->nullable();
            $table->boolean('pin_verified')->default(false);
            $table->string('limit_override_reason')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reversal_of_id')->nullable()->constrained('pocket_money_transactions')->nullOnDelete();
            $table->timestamp('reversed_at')->nullable();
            $table->timestamps();

            $table->unique(['school_id', 'reference']);
            $table->index(['school_id', 'transacted_at']);
        });

        // Physical cash count against the system balance (also used for shift handover).
        Schema::create('pocket_money_cash_counts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('custodian_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('counted_at');
            $table->unsignedInteger('accounts');
            $table->decimal('expected', 14, 2);
            $table->decimal('counted', 14, 2);
            $table->decimal('variance', 14, 2);
            $table->foreignId('handed_over_to')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notes')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pocket_money_cash_counts');
        Schema::dropIfExists('pocket_money_transactions');
        Schema::dropIfExists('pocket_money_accounts');
    }
};
