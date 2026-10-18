<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - Dormitory caretakers: several patrons / matrons / assistants per dormitory (replaces the single warden).
 * - Duties: school-defined duty types (TOD, prep, cleaning …) for staff or students, a dated roster
 *   allowing several people per period, and a done / missed log per day.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dormitory_caretakers', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('dormitory_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20); // patron | matron | assistant
            $table->timestamps();

            $table->unique(['dormitory_id', 'employee_id']);
        });

        // Carry the existing warden over as the dormitory's patron (male) or matron (female).
        $wardens = DB::table('dormitories')->join('employees', 'employees.id', '=', 'dormitories.warden_id')
            ->get(['dormitories.id', 'dormitories.tenant_id', 'dormitories.school_id', 'dormitories.warden_id', 'employees.gender']);
        foreach ($wardens as $w) {
            DB::table('dormitory_caretakers')->insert([
                'tenant_id' => $w->tenant_id, 'school_id' => $w->school_id, 'dormitory_id' => $w->id, 'employee_id' => $w->warden_id,
                'role' => $w->gender === 'female' ? 'matron' : 'patron', 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        Schema::table('dormitories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warden_id');
        });

        Schema::create('duty_types', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('audience', 10); // staff | student
            $table->string('name', 100);
            $table->string('code', 20)->nullable();
            $table->string('description')->nullable();
            $table->string('location', 100)->nullable();
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->json('days')->nullable(); // ISO weekdays 1-7 the duty runs; null = every day
            $table->string('rotation', 10)->default('weekly'); // daily | weekly | term | custom — default roster period
            $table->unsignedTinyInteger('people_needed')->default(1);
            $table->unsignedTinyInteger('workload_periods')->default(0); // staff: periods/week added to the teacher's load while on duty
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['school_id', 'audience', 'name']);
        });

        Schema::create('duty_assignments', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('duty_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('role', 60)->nullable(); // e.g. Leader, Assistant
            $table->string('notes')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['school_id', 'start_date', 'end_date']);
        });

        Schema::create('duty_logs', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('duty_assignment_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('status', 10); // done | missed | excused
            $table->string('remarks')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['duty_assignment_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('duty_logs');
        Schema::dropIfExists('duty_assignments');
        Schema::dropIfExists('duty_types');

        Schema::table('dormitories', function (Blueprint $table) {
            $table->foreignId('warden_id')->nullable()->after('gender')->constrained('employees')->nullOnDelete();
        });
        foreach (DB::table('dormitory_caretakers')->orderBy('id')->get() as $c) {
            DB::table('dormitories')->where('id', $c->dormitory_id)->whereNull('warden_id')->update(['warden_id' => $c->employee_id]);
        }
        Schema::dropIfExists('dormitory_caretakers');
    }
};
