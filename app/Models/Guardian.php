<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Guardian extends SchoolModel
{
    protected $appends = ['full_name'];

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * Global search: every word must match the guardian (name, phones, email,
     * national ID, occupation, address) or one of their children (name,
     * admission no.). Phone words ignore spaces/dashes and match both the
     * local 0XXX and international 255XXX forms.
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        foreach (self::searchWords($term) as $word) {
            $query->where(function (Builder $q) use ($word) {
                $like = "%{$word}%";
                $q->where('first_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('national_id', 'like', $like)
                    ->orWhere('occupation', 'like', $like)
                    ->orWhere('address', 'like', $like)
                    ->orWhereHas('students', fn ($s) => $s->search($word));

                foreach (self::phoneForms($word) as $digits) {
                    $q->orWhereRaw("REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '.', '') LIKE ?", ["%{$digits}%"])
                        ->orWhereRaw("REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(alt_phone, ''), ' ', ''), '-', ''), '+', ''), '.', '') LIKE ?", ["%{$digits}%"]);
                }
            });
        }

        return $query;
    }

    /** @return array<int, string> */
    public static function searchWords(?string $term): array
    {
        return array_values(array_filter(preg_split('/\s+/', trim((string) $term)) ?: [], fn ($w) => $w !== ''));
    }

    /** "0754-123" → ["754123", "255754123"] style variants for phone matching. */
    private static function phoneForms(string $word): array
    {
        $digits = preg_replace('/\D+/', '', $word);
        if (strlen($digits) < 3 || preg_match('/[a-z@]/i', $word)) {
            return [];
        }

        $forms = [$digits];
        if (str_starts_with($digits, '0')) {
            $forms[] = '255'.substr($digits, 1);
        } elseif (str_starts_with($digits, '255') && strlen($digits) > 3) {
            $forms[] = '0'.substr($digits, 3);
        }

        return $forms;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function students(): BelongsToMany
    {
        return $this->belongsToMany(Student::class)
            ->withPivot(['relationship', 'is_primary', 'can_pickup', 'receives_reports'])
            ->withTimestamps();
    }
}
