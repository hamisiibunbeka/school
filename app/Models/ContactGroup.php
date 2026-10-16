<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/** Saved list of "other" stakeholders (board members, alumni, PTA ...) for broadcasts. */
class ContactGroup extends SchoolModel
{
    public function members(): HasMany
    {
        return $this->hasMany(ContactGroupMember::class);
    }
}
