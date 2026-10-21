<?php

namespace App\Support;

use App\Models\GradeScale;

/**
 * Default grade scales per education level (Tanzania / NECTA). Schools can edit every row afterwards
 * (Exams → Grading). `pass` marks the grades that count as a pass.
 *
 * - Pre-primary & Primary (PSLE / SFNA style): A 81–100, B 61–80, C 41–60, D 21–40, E 0–20 —
 *   the NECTA subject bands (41–50, 31–40 … out of 50) expressed as percentages; pass = A–C.
 * - O-Level (CSEE): A 75–100 … F 0–29; pass = A–D.
 * - A-Level (ACSEE): A 80–100 … F 0–34; S is a subsidiary pass, not a principal pass.
 */
final class GradeScaleDefaults
{
    /** @var array<string, array<int, array{0:string,1:float,2:float,3:int,4:string,5:bool}>> grade, min, max, points, remark, pass */
    public const SCALES = [
        EducationLevel::PRE_PRIMARY => [
            ['A', 81, 100, 1, 'Excellent', true],
            ['B', 61, 80.99, 2, 'Very good', true],
            ['C', 41, 60.99, 3, 'Good', true],
            ['D', 21, 40.99, 4, 'Satisfactory', false],
            ['E', 0, 20.99, 5, 'Needs improvement', false],
        ],
        EducationLevel::PRIMARY => [
            ['A', 81, 100, 1, 'Excellent', true],
            ['B', 61, 80.99, 2, 'Very good', true],
            ['C', 41, 60.99, 3, 'Good', true],
            ['D', 21, 40.99, 4, 'Satisfactory', false],
            ['E', 0, 20.99, 5, 'Fail', false],
        ],
        EducationLevel::O_LEVEL => [
            ['A', 75, 100, 1, 'Excellent', true],
            ['B', 65, 74.99, 2, 'Very Good', true],
            ['C', 45, 64.99, 3, 'Good', true],
            ['D', 30, 44.99, 4, 'Satisfactory', true],
            ['F', 0, 29.99, 5, 'Fail', false],
        ],
        EducationLevel::A_LEVEL => [
            ['A', 80, 100, 1, 'Excellent', true],
            ['B', 70, 79.99, 2, 'Very Good', true],
            ['C', 60, 69.99, 3, 'Good', true],
            ['D', 50, 59.99, 4, 'Satisfactory', true],
            ['E', 40, 49.99, 5, 'Pass', true],
            ['S', 35, 39.99, 6, 'Subsidiary pass', false],
            ['F', 0, 34.99, 7, 'Fail', false],
        ],
    ];

    /** Create the default scale of a level for the school in context, unless it already has one. */
    public static function ensure(string $level): void
    {
        if (! isset(self::SCALES[$level]) || GradeScale::where('education_level', $level)->exists()) {
            return;
        }
        foreach (self::SCALES[$level] as [$grade, $min, $max, $points, $remark, $pass]) {
            GradeScale::create(['education_level' => $level, 'grade' => $grade, 'min_score' => $min, 'max_score' => $max, 'points' => $points, 'remark' => $remark, 'is_pass' => $pass]);
        }
    }

    /** Scales a school of the given type (schools.level) needs. */
    public static function ensureForSchool(?string $schoolLevel): void
    {
        foreach (EducationLevel::FOR_SCHOOL[$schoolLevel] ?? EducationLevel::FOR_SCHOOL['secondary'] as $level) {
            self::ensure($level);
        }
    }
}
