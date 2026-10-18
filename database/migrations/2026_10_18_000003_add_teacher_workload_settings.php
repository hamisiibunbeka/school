<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Teacher workload: an optional personal weekly limit and extra duty periods
 * per employee (the school-wide default lives in school settings), and a
 * "taught jointly" flag for allocations shared by several streams.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->unsignedTinyInteger('max_periods')->nullable()->after('category'); // null = school default
            $table->unsignedTinyInteger('duty_periods')->default(0)->after('max_periods'); // HoD, patron, games master …
            $table->string('duty_note')->nullable()->after('duty_periods');
        });

        Schema::table('class_subjects', function (Blueprint $table) {
            // Class-wide allocation taught to all its streams together (one set of lessons).
            $table->boolean('is_joint')->default(false)->after('periods_per_week');
        });
    }

    public function down(): void
    {
        Schema::table('employees', fn (Blueprint $t) => $t->dropColumn(['max_periods', 'duty_periods', 'duty_note']));
        Schema::table('class_subjects', fn (Blueprint $t) => $t->dropColumn('is_joint'));
    }
};
