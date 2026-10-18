<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Advanced level (Form V–VI) support:
 *  - an education level on classes, academic years and grade scales;
 *  - subject combinations (3 principal subjects + General Studies, + BAM when chosen);
 *  - each A-Level stream is one combination;
 *  - the ACSEE grade scale for every existing school.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['school_classes', 'academic_years', 'grade_scales'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->string('education_level', 20)->default('o_level')->after('id'); // o_level | a_level
            });
        }

        Schema::create('combinations', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->string('code', 20); // PCM, HGL ...
            $table->string('name');
            $table->boolean('requires_bam')->default(false); // Basic Applied Mathematics as a subsidiary
            $table->boolean('is_active')->default(true);
            $table->string('notes')->nullable();
            $table->timestamps();
            $table->unique(['school_id', 'code']);
        });

        Schema::create('combination_subjects', function (Blueprint $table) {
            $table->id();
            $table->schoolScoped();
            $table->foreignId('combination_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->string('role', 20); // principal | subsidiary
            $table->timestamps();
            $table->unique(['combination_id', 'subject_id']);
        });

        Schema::table('streams', function (Blueprint $table) {
            $table->foreignId('combination_id')->nullable()->after('school_class_id')->constrained()->nullOnDelete();
        });

        // Classes already named Form Five / Form Six (or V / VI / 5 / 6) are A-Level.
        foreach (DB::table('school_classes')->get(['id', 'name']) as $class) {
            if (preg_match('/\bform\s*(five|six|v|vi|5|6)\b/i', $class->name)) {
                DB::table('school_classes')->where('id', $class->id)->update(['education_level' => 'a_level']);
            }
        }

        // ACSEE grade scale for every school (A=1 … F=7; S = subsidiary pass).
        $now = now();
        foreach (DB::table('schools')->get(['id', 'tenant_id']) as $school) {
            if (DB::table('grade_scales')->where('school_id', $school->id)->where('education_level', 'a_level')->exists()) {
                continue;
            }
            foreach (self::aLevelScale() as [$grade, $min, $max, $points, $remark]) {
                DB::table('grade_scales')->insert([
                    'tenant_id' => $school->tenant_id, 'school_id' => $school->id, 'education_level' => 'a_level',
                    'grade' => $grade, 'min_score' => $min, 'max_score' => $max, 'points' => $points, 'remark' => $remark,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        DB::table('grade_scales')->where('education_level', 'a_level')->delete();
        Schema::table('streams', fn (Blueprint $t) => $t->dropConstrainedForeignId('combination_id'));
        Schema::dropIfExists('combination_subjects');
        Schema::dropIfExists('combinations');
        foreach (['school_classes', 'academic_years', 'grade_scales'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn('education_level'));
        }
    }

    /** @return array<int, array{0:string,1:float,2:float,3:int,4:string}> */
    public static function aLevelScale(): array
    {
        return [
            ['A', 80, 100, 1, 'Excellent'],
            ['B', 70, 79.99, 2, 'Very Good'],
            ['C', 60, 69.99, 3, 'Good'],
            ['D', 50, 59.99, 4, 'Satisfactory'],
            ['E', 40, 49.99, 5, 'Pass'],
            ['S', 35, 39.99, 6, 'Subsidiary pass'],
            ['F', 0, 34.99, 7, 'Fail'],
        ];
    }
};
