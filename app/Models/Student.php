<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class Student extends SchoolModel
{
    use SoftDeletes;

    protected $appends = ['full_name', 'photo_url'];

    public const STATUSES = ['active', 'on_leave', 'suspended', 'transferred', 'graduated', 'withdrawn', 'archived'];

    /** Admitted but not yet cleared by finance: billable, but kept out of the directory and every class list. */
    public const PENDING_CLEARANCE = 'pending_clearance';

    protected function casts(): array
    {
        return ['date_of_birth' => 'date', 'admission_date' => 'date'];
    }

    public function getFullNameAttribute(): string
    {
        return trim(implode(' ', array_filter([$this->first_name, $this->middle_name, $this->last_name])));
    }

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->photo_path ? Storage::url($this->photo_path) : null;
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('first_name', 'like', "%{$term}%")
                ->orWhere('last_name', 'like', "%{$term}%")
                ->orWhere('middle_name', 'like', "%{$term}%")
                ->orWhere('admission_no', 'like', "%{$term}%");
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function stream(): BelongsTo
    {
        return $this->belongsTo(Stream::class);
    }

    public function sponsorships(): HasMany
    {
        return $this->hasMany(StudentSponsorship::class)->orderByRaw("status = 'active' DESC")->orderByDesc('start_date')->orderByDesc('id');
    }

    /** Current sponsorship (the latest active one). */
    public function activeSponsorship(): HasOne
    {
        return $this->hasOne(StudentSponsorship::class)->where('status', 'active')->latestOfMany();
    }

    public function guardians(): BelongsToMany
    {
        return $this->belongsToMany(Guardian::class)
            ->withPivot(['relationship', 'is_primary', 'can_pickup', 'receives_reports'])
            ->withTimestamps();
    }

    public function enrolments(): HasMany
    {
        return $this->hasMany(Enrolment::class)->latest('start_date');
    }

    public function dutyAssignments(): HasMany
    {
        return $this->hasMany(DutyAssignment::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(StudentDocument::class);
    }

    public function disciplineCases(): HasMany
    {
        return $this->hasMany(DisciplineCase::class);
    }

    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    public function examMarks(): HasMany
    {
        return $this->hasMany(ExamMark::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /** Outstanding fee balance across all open invoices. */
    public function feeBalance(): string
    {
        return (string) $this->invoices()->whereNotIn('status', ['cancelled', 'draft'])->sum('balance');
    }
}
