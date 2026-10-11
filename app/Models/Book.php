<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class Book extends SchoolModel
{
    public const CATEGORIES = ['Textbook', 'Literature', 'Kiswahili Literature', 'Reference', 'Science', 'History', 'Religion', 'Revision', 'General'];

    public function loans(): HasMany
    {
        return $this->hasMany(BookLoan::class);
    }

    public function openLoans(): HasMany
    {
        return $this->hasMany(BookLoan::class)->where('status', 'issued');
    }

    /** Recalculate available copies from open loans and lost copies are excluded from the total. */
    public function syncAvailability(): void
    {
        $open = $this->openLoans()->count();
        $this->forceFill(['copies_available' => max(0, $this->copies_total - $open)])->save();
    }
}
