<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Admission application moving through the SRS 13 admissions workflow. */
class AdmissionApplication extends SchoolModel
{
    public const STATUSES = ['submitted', 'under_review', 'interview', 'accepted', 'waitlisted', 'rejected', 'enrolled', 'withdrawn'];

    /** Allowed transitions: current status => next statuses. */
    public const TRANSITIONS = [
        'submitted' => ['under_review', 'rejected', 'withdrawn'],
        'under_review' => ['interview', 'accepted', 'waitlisted', 'rejected', 'withdrawn'],
        'interview' => ['accepted', 'waitlisted', 'rejected', 'withdrawn'],
        'waitlisted' => ['accepted', 'rejected', 'withdrawn'],
        'accepted' => ['withdrawn'],
        'rejected' => [],
        'enrolled' => [],
        'withdrawn' => [],
    ];

    /** Statuses that are decisions and therefore require decision notes. */
    public const DECISIONS = ['accepted', 'waitlisted', 'rejected', 'withdrawn'];

    protected $appends = ['full_name'];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'interview_date' => 'date',
            'decided_at' => 'datetime',
            'assessment_score' => 'decimal:2',
            'documents' => 'array',
        ];
    }

    public function getFullNameAttribute(): string
    {
        return trim(implode(' ', array_filter([$this->first_name, $this->middle_name, $this->last_name])));
    }

    public function canTransitionTo(string $status): bool
    {
        return in_array($status, self::TRANSITIONS[$this->status] ?? [], true);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q
            ->where('first_name', 'like', "%{$term}%")
            ->orWhere('last_name', 'like', "%{$term}%")
            ->orWhere('middle_name', 'like', "%{$term}%")
            ->orWhere('application_no', 'like', "%{$term}%")
            ->orWhere('guardian_name', 'like', "%{$term}%")
            ->orWhere('guardian_phone', 'like', "%{$term}%"));
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    /** Form Five: the combination the student was selected for. */
    public function combination(): BelongsTo
    {
        return $this->belongsTo(Combination::class);
    }

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
