<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pre-primary and Primary grading (PSLE / SFNA style: average grade, pass = A–C) needs the pass grades to be
 * stated rather than inferred, so each grade gets `is_pass`. Existing scales keep today's behaviour: every grade
 * passes except the worst one (highest points), and on A-Level the subsidiary pass S is not a principal pass.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('grade_scales', function (Blueprint $table) {
            $table->boolean('is_pass')->default(true)->after('points');
        });

        $worst = DB::table('grade_scales')->selectRaw('school_id, education_level, MAX(points) as points')->groupBy('school_id', 'education_level')->get();
        foreach ($worst as $w) {
            DB::table('grade_scales')->where('school_id', $w->school_id)->where('education_level', $w->education_level)->where('points', $w->points)->update(['is_pass' => false]);
        }
        DB::table('grade_scales')->where('education_level', 'a_level')->where('grade', 'S')->update(['is_pass' => false]);
    }

    public function down(): void
    {
        Schema::table('grade_scales', fn (Blueprint $table) => $table->dropColumn('is_pass'));
    }
};
