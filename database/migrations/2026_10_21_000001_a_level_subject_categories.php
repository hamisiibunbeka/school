<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Data-driven A-Level rules (ACSEE reform: General Studies abolished; Academic Communication and
 * Historia ya Tanzania na Maadili become compulsory subsidiaries; BAM stays optional).
 *
 * - subjects.a_level_category: principal | compulsory (subsidiary) | optional (subsidiary) | null (not A-Level).
 * - Combinations now hold only principals + the optional subsidiaries they take (BAM); compulsory subsidiaries
 *   come from the class's rules, so Form Six can finish on the old system while Form Five starts the new one.
 * - school_classes.a_level_rules: null = follow the school's current rules; otherwise pinned rules
 *   {label, compulsory:[subject ids], average: all|principal}.
 * - exams.a_level_rules: rules frozen when results are published, so later changes never alter them.
 *
 * Nothing changes on deployment: every existing A-Level class is pinned to the old rules (GS compulsory,
 * average of principal subjects) and published A-Level exams are frozen as they were. Schools then switch
 * Form Five to the new system from Academics → Combinations.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->string('a_level_category', 20)->nullable()->after('type');
        });
        Schema::table('school_classes', function (Blueprint $table) {
            $table->json('a_level_rules')->nullable()->after('education_level');
        });
        Schema::table('exams', function (Blueprint $table) {
            $table->json('a_level_rules')->nullable();
        });

        // 1. Freeze published A-Level exams exactly as they are calculated today.
        $streamsByClass = DB::table('streams')->whereNotNull('combination_id')->get(['id', 'school_class_id', 'combination_id'])->groupBy('school_class_id');
        $codes = DB::table('combinations')->pluck('code', 'id');
        $items = DB::table('combination_subjects')->get(['combination_id', 'subject_id', 'role'])->groupBy('combination_id');
        $aLevelClasses = DB::table('school_classes')->where('education_level', 'a_level')->pluck('id')->all();

        $streamsOf = function (int $classId) use ($streamsByClass, $codes, $items) {
            $out = [];
            foreach ($streamsByClass->get($classId, collect()) as $s) {
                $rows = $items->get($s->combination_id, collect());
                $out[$s->id] = [
                    'code' => $codes[$s->combination_id] ?? '',
                    'principal' => $rows->where('role', 'principal')->pluck('subject_id')->map(fn ($v) => (int) $v)->values()->all(),
                    'subjects' => $rows->pluck('subject_id')->map(fn ($v) => (int) $v)->values()->all(),
                ];
            }

            return $out;
        };

        foreach (DB::table('exams')->where('status', 'published')->get(['id']) as $exam) {
            $classIds = array_values(array_intersect(DB::table('exam_classes')->where('exam_id', $exam->id)->pluck('school_class_id')->all(), $aLevelClasses));
            if (! $classIds) {
                continue;
            }
            $frozen = [];
            foreach ($classIds as $classId) {
                $frozen[$classId] = ['average' => 'principal', 'streams' => $streamsOf((int) $classId)];
            }
            DB::table('exams')->where('id', $exam->id)->update(['a_level_rules' => json_encode($frozen)]);
        }

        // 2. Subject categories from today's combinations.
        DB::table('subjects')->whereIn('id', DB::table('combination_subjects')->where('role', 'principal')->pluck('subject_id'))->update(['a_level_category' => 'principal']);
        DB::table('subjects')->where('code', 'GS')->update(['a_level_category' => 'compulsory']);
        DB::table('subjects')->where('code', 'BAM')->update(['a_level_category' => 'optional']);

        // 3. Pin existing A-Level classes to the old rules (only where the school actually uses GS).
        foreach (DB::table('school_classes')->where('education_level', 'a_level')->get(['id', 'school_id']) as $class) {
            $gs = DB::table('subjects')->where('school_id', $class->school_id)->where('code', 'GS')->value('id');
            if ($gs) {
                DB::table('school_classes')->where('id', $class->id)->update(['a_level_rules' => json_encode([
                    'label' => 'Old system (General Studies)', 'compulsory' => [(int) $gs], 'average' => 'principal',
                ])]);
            }
        }

        // 4. Compulsory subsidiaries now belong to the class rules, not to each combination.
        DB::table('combination_subjects')->whereIn('subject_id', DB::table('subjects')->where('code', 'GS')->pluck('id'))->delete();

        Schema::table('combinations', fn (Blueprint $table) => $table->dropColumn('requires_bam'));
    }

    public function down(): void
    {
        Schema::table('combinations', fn (Blueprint $table) => $table->boolean('requires_bam')->default(false)->after('name'));
        DB::table('combinations')->whereIn('id', DB::table('combination_subjects')->whereIn('subject_id', DB::table('subjects')->where('code', 'BAM')->pluck('id'))->pluck('combination_id'))->update(['requires_bam' => true]);

        // Put GS back on every combination of schools that have it.
        $now = now();
        foreach (DB::table('combinations')->get(['id', 'tenant_id', 'school_id']) as $c) {
            $gs = DB::table('subjects')->where('school_id', $c->school_id)->where('code', 'GS')->value('id');
            if ($gs && ! DB::table('combination_subjects')->where('combination_id', $c->id)->where('subject_id', $gs)->exists()) {
                DB::table('combination_subjects')->insert(['tenant_id' => $c->tenant_id, 'school_id' => $c->school_id, 'combination_id' => $c->id, 'subject_id' => $gs, 'role' => 'subsidiary', 'created_at' => $now, 'updated_at' => $now]);
            }
        }

        Schema::table('exams', fn (Blueprint $table) => $table->dropColumn('a_level_rules'));
        Schema::table('school_classes', fn (Blueprint $table) => $table->dropColumn('a_level_rules'));
        Schema::table('subjects', fn (Blueprint $table) => $table->dropColumn('a_level_category'));
    }
};
