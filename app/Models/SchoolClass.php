<?php

namespace App\Models;

use App\Support\EducationLevel;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SchoolClass extends SchoolModel
{
    protected $table = 'school_classes';

    protected function casts(): array
    {
        // A-Level only: null = follow the school's current rules; otherwise pinned rules (see ALevelRules).
        return ['a_level_rules' => 'array'];
    }

    public function isALevel(): bool
    {
        return $this->education_level === EducationLevel::A_LEVEL;
    }

    public function streams(): HasMany
    {
        return $this->hasMany(Stream::class)->orderBy('name');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    public function classSubjects(): HasMany
    {
        return $this->hasMany(ClassSubject::class);
    }
}
