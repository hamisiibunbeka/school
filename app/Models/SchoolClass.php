<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class SchoolClass extends SchoolModel
{
    protected $table = 'school_classes';

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
