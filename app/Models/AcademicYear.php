<?php

namespace App\Models;

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

    public static function current(): ?self
    {
        return static::where('is_current', true)->first() ?? static::latest('start_date')->first();
    }
}
