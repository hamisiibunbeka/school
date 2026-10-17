<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Student sponsors (NGOs, churches, companies, government bursaries,
 * individual well-wishers) and each student's sponsorships over time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sponsors', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('name');
            $table->string('type')->default('organization'); // individual | organization | ngo | religious | company | government
            $table->string('contact_person')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('notes')->nullable();
            $table->timestamps();
            $table->index(['school_id', 'name']);
        });

        Schema::create('student_sponsorships', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sponsor_id')->constrained()->cascadeOnDelete();
            $table->string('coverage')->default('full'); // full | partial
            $table->decimal('percentage', 5, 2)->nullable(); // share of fees covered when partial
            $table->string('covers')->nullable(); // e.g. "Tuition, boarding, uniform"
            $table->string('reference')->nullable(); // agreement / bursary number
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('status')->default('active'); // active | ended
            $table->string('notes')->nullable();
            $table->timestamps();
            $table->index(['school_id', 'student_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_sponsorships');
        Schema::dropIfExists('sponsors');
    }
};
