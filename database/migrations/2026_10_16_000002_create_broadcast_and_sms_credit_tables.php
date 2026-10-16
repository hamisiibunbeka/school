<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Broadcast centre (bulk SMS / email to stakeholder groups) and the SMS
 * credit wallet: a monthly plan allowance plus purchased bundles.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->unsignedInteger('sms_balance')->default(0)->after('subscription_ends_at'); // purchased, never expires
            $table->unsignedInteger('sms_plan_balance')->default(0)->after('sms_balance'); // this month's plan allowance left
            $table->string('sms_plan_period', 7)->nullable()->after('sms_plan_balance'); // Y-m the allowance belongs to
        });

        Schema::create('sms_packages', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedInteger('credits');
            $table->decimal('price', 15, 2);
            $table->string('description')->nullable();
            $table->boolean('is_popular')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('sms_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('school_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sms_package_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference')->unique();
            $table->string('package_name');
            $table->unsignedInteger('credits');
            $table->decimal('amount', 15, 2);
            // pending (awaiting payment) | submitted (school sent payment details) | paid | cancelled
            $table->string('status')->default('pending');
            $table->string('payment_method')->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payer_phone')->nullable();
            $table->string('notes')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('sms_credit_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('type'); // purchase | allowance | adjustment
            $table->integer('credits');
            $table->unsignedInteger('balance_after'); // purchased balance after the entry
            $table->string('description');
            $table->foreignId('sms_order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->index(['tenant_id', 'created_at']);
        });

        Schema::create('contact_groups', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('contact_group_members', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('contact_group_id')->constrained()->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->timestamps();
        });

        Schema::create('broadcasts', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('title');
            $table->string('channel'); // sms | email | both
            $table->string('subject')->nullable();
            $table->text('body');
            $table->json('audiences');
            // draft | scheduled | queued | sending | completed | cancelled
            $table->string('status')->default('draft');
            $table->dateTime('scheduled_at')->nullable();
            $table->dateTime('started_at')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->unsignedInteger('recipients')->default(0);
            $table->unsignedInteger('sent')->default(0);
            $table->unsignedInteger('failed')->default(0);
            $table->unsignedInteger('credits')->default(0);
            $table->string('error')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['status', 'scheduled_at']);
        });

        Schema::table('message_logs', function (Blueprint $table) {
            $table->foreignId('broadcast_id')->nullable()->after('id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('message_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('broadcast_id');
        });
        Schema::dropIfExists('broadcasts');
        Schema::dropIfExists('contact_group_members');
        Schema::dropIfExists('contact_groups');
        Schema::dropIfExists('sms_credit_transactions');
        Schema::dropIfExists('sms_orders');
        Schema::dropIfExists('sms_packages');
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['sms_balance', 'sms_plan_balance', 'sms_plan_period']);
        });
    }
};
