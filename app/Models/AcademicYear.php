<?php

namespace App\Models;

use App\Support\EducationLevel;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicYear extends SchoolModel
{
    protected function casts(): array
    {
        return ['start_date' => 'date', 'end_date' => 'date', 'is_current' => 'boolean'];
    }

    public function terms(): HasMany
    {
        return $this->hasMany(Term::class)->orderBy('start_date');
    }

    /** Current year of an education level (O-Level and A-Level run separate calendars). */
    public static function current(string $level = EducationLevel::O_LEVEL): ?self
    {
        $q = fn () => static::where('education_level', $level);

        return $q()->where('is_current', true)->first() ?? $q()->latest('start_date')->first();
    }

    /** Current year of the calendar the given class follows (A-Level, or the main calendar for every other level). */
    public static function currentFor(?int $classId): ?self
    {
        return static::current(EducationLevel::calendarForClass($classId));
    }
}
