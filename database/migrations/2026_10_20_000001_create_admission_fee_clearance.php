<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Admission fee clearance:
 * - Installment settings: per academic year, the share of the year's fees due by each date (shares total 100%).
 * - Accepted applicants are billed on enrolment and wait in "awaiting fees" until finance verifies the first
 *   installment is paid, or a head authorizes a payment agreement (deferral) with an agreed date.
 */
return new class extends Migration
{
    private array $grants = ['school-admin' => ['fees.defer'], 'principal' => ['fees.defer']];

    public function up(): void
    {
        Schema::create('fee_installments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('sequence');
            $table->string('name', 60);
            $table->decimal('percent', 5, 2);
            $table->date('due_date');
            $table->timestamps();

            $table->unique(['academic_year_id', 'sequence']);
        });

        Schema::table('admission_applications', function (Blueprint $table) {
            $table->foreignId('admission_invoice_id')->nullable()->after('student_id')->constrained('invoices')->nullOnDelete();
            $table->string('fee_clearance', 20)->nullable()->after('admission_invoice_id'); // paid | deferred
            $table->timestamp('fee_cleared_at')->nullable()->after('fee_clearance');
            $table->foreignId('fee_cleared_by')->nullable()->after('fee_cleared_at')->constrained('users')->nullOnDelete();
        });

        Schema::create('fee_payment_agreements', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('admission_application_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('amount', 15, 2);        // what the parent promised to pay by the agreed date
            $table->decimal('paid_baseline', 15, 2); // student's total receipts when the agreement was made
            $table->date('due_date');
            $table->string('requested_by', 150)->nullable(); // parent / guardian who asked
            $table->text('reason');                            // the parent's excuse
            $table->text('terms')->nullable();                 // special conditions agreed
            $table->string('status', 20)->default('active');   // active | honoured | defaulted | cancelled
            $table->foreignId('authorized_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('settled_at')->nullable();
            $table->string('closing_note')->nullable();
            $table->date('due_soon_notified_on')->nullable();
            $table->date('overdue_notified_on')->nullable();
            $table->timestamps();

            $table->index(['school_id', 'status', 'due_date']);
        });

        foreach (DB::table('roles')->whereIn('slug', array_keys($this->grants))->get(['id', 'slug', 'permissions']) as $role) {
            $permissions = json_decode($role->permissions ?? '[]', true) ?: [];
            DB::table('roles')->where('id', $role->id)->update(['permissions' => json_encode(array_values(array_unique([...$permissions, ...$this->grants[$role->slug]])))]);
        }
    }

    public function down(): void
    {
        foreach (DB::table('roles')->get(['id', 'permissions']) as $role) {
            $permissions = array_values(array_filter(json_decode($role->permissions ?? '[]', true) ?: [], fn ($p) => $p !== 'fees.defer'));
            DB::table('roles')->where('id', $role->id)->update(['permissions' => json_encode($permissions)]);
        }

        Schema::dropIfExists('fee_payment_agreements');
        Schema::table('admission_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('fee_cleared_by');
            $table->dropConstrainedForeignId('admission_invoice_id');
            $table->dropColumn(['fee_clearance', 'fee_cleared_at']);
        });
        Schema::dropIfExists('fee_installments');
    }
};
