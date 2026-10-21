<?php

namespace App\Support;

use App\Models\SchoolClass;

/**
 * Education levels a class can belong to. The level decides how the class is graded:
 *
 * - Pre-primary (nursery / elimu ya awali) and Primary (Standard I–VII): subject grades and an average
 *   grade (NECTA PSLE/SFNA style), position by average then total marks — no divisions.
 * - O-Level (Form I–IV, CSEE) and A-Level (Form V–VI, ACSEE): divisions.
 *
 * Calendars are separate from grading: A-Level runs its own July–May year; every other level shares the
 * school's main (January–December) calendar, stored as `o_level` on academic years.
 */
final class EducationLevel
{
    public const PRE_PRIMARY = 'pre_primary';

    public const PRIMARY = 'primary';

    public const O_LEVEL = 'o_level';

    public const A_LEVEL = 'a_level';

    /** Class / grade-scale levels, youngest first. */
    public const ALL = [self::PRE_PRIMARY, self::PRIMARY, self::O_LEVEL, self::A_LEVEL];

    /** Academic-year calendars: the main calendar (stored as o_level) and the A-Level calendar. */
    public const CALENDARS = [self::O_LEVEL, self::A_LEVEL];

    /** Grade-scale levels each school type needs (schools.level). */
    public const FOR_SCHOOL = [
        'nursery' => [self::PRE_PRIMARY],
        'primary' => [self::PRE_PRIMARY, self::PRIMARY],
        'secondary' => [self::O_LEVEL, self::A_LEVEL],
        'combined' => self::ALL,
    ];

    public static function label(?string $level): string
    {
        return match ($level) {
            self::PRE_PRIMARY => 'Pre-primary',
            self::PRIMARY => 'Primary',
            self::A_LEVEL => 'A-Level',
            default => 'O-Level',
        };
    }

    /** @return array<int, array{value:string, label:string}> */
    public static function options(): array
    {
        return [
            ['value' => self::PRE_PRIMARY, 'label' => 'Pre-primary (Nursery / Baby – Pre-unit)'],
            ['value' => self::PRIMARY, 'label' => 'Primary (Standard I–VII)'],
            ['value' => self::O_LEVEL, 'label' => 'O-Level (Form I–IV)'],
            ['value' => self::A_LEVEL, 'label' => 'A-Level (Form V–VI)'],
        ];
    }

    /** Divisions apply to secondary only; pre-primary and primary use an average grade. */
    public static function usesDivision(?string $level): bool
    {
        return in_array($level, [self::O_LEVEL, self::A_LEVEL], true);
    }

    /** The academic-year calendar a level follows. */
    public static function calendar(?string $level): string
    {
        return $level === self::A_LEVEL ? self::A_LEVEL : self::O_LEVEL;
    }

    public static function calendarLabel(?string $calendar): string
    {
        return $calendar === self::A_LEVEL ? 'A-Level calendar' : 'Main calendar';
    }

    /** @return array<int, array{value:string, label:string}> */
    public static function calendarOptions(): array
    {
        return [
            ['value' => self::O_LEVEL, 'label' => 'Main calendar (January–December) — Nursery, Primary, Form I–IV'],
            ['value' => self::A_LEVEL, 'label' => 'A-Level calendar (July–May) — Form V–VI'],
        ];
    }

    /** Pre-primary pupils move up into Primary in the same school; other levels change only through selection / admission. */
    public static function canPromote(?string $from, ?string $to): bool
    {
        return $from === $to || ($from === self::PRE_PRIMARY && $to === self::PRIMARY);
    }

    public static function forClass(?int $classId): string
    {
        return ($classId ? SchoolClass::whereKey($classId)->value('education_level') : null) ?? self::O_LEVEL;
    }

    public static function calendarForClass(?int $classId): string
    {
        return self::calendar(self::forClass($classId));
    }
}
