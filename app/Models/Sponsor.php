<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/** Organisation or person paying for / supporting students' education. */
class Sponsor extends SchoolModel
{
    public const TYPES = ['individual', 'organization', 'ngo', 'religious', 'company', 'government'];

    public function sponsorships(): HasMany
    {
        return $this->hasMany(StudentSponsorship::class);
    }
}
