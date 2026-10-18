<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Form Five intake: selected combination and the Form Four (CSEE) result the selection was based on. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admission_applications', function (Blueprint $table) {
            $table->foreignId('combination_id')->nullable()->after('school_class_id')->constrained()->nullOnDelete();
            $table->string('csee_index_no', 30)->nullable()->after('previous_school'); // e.g. S0101/0001/2025
            $table->string('csee_division', 5)->nullable()->after('csee_index_no');
            $table->unsignedTinyInteger('csee_points')->nullable()->after('csee_division');
        });
    }

    public function down(): void
    {
        Schema::table('admission_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('combination_id');
            $table->dropColumn(['csee_index_no', 'csee_division', 'csee_points']);
        });
    }
};
