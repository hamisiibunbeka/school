<?php

namespace App\Support;

use App\Models\SchoolClass;

/** Secondary education levels: O-Level (Form I–IV) and A-Level (Form V–VI). */
final class EducationLevel
{
    public const O_LEVEL = 'o_level';

    public const A_LEVEL = 'a_level';

    public const ALL = [self::O_LEVEL, self::A_LEVEL];

    public static function label(?string $level): string
    {
        return $level === self::A_LEVEL ? 'A-Level' : 'O-Level';
    }

    /** @return array<int, array{value:string, label:string}> */
    public static function options(): array
    {
        return [
            ['value' => self::O_LEVEL, 'label' => 'O-Level (Form I–IV)'],
            ['value' => self::A_LEVEL, 'label' => 'A-Level (Form V–VI)'],
        ];
    }

    public static function forClass(?int $classId): string
    {
        return ($classId ? SchoolClass::whereKey($classId)->value('education_level') : null) ?? self::O_LEVEL;
    }
}
