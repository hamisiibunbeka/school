<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An examination sitting. Results workflow (SRS 13):
 * draft → marks_entry → moderation → published (→ controlled unpublish with reason).
 */
class Exam extends SchoolModel
{
    public const STATUSES = ['draft', 'marks_entry', 'moderation', 'published'];

    public const TYPES = ['test', 'midterm', 'end_of_term', 'mock', 'national'];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'max_score' => 'decimal:2',
            'weight' => 'decimal:2',
            'published_at' => 'datetime',
        ];
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function term(): BelongsTo
    {
        return $this->belongsTo(Term::class);
    }

    /** Classes sitting the exam (exam_classes pivot, no timestamps). */
    public function classes(): BelongsToMany
    {
        return $this->belongsToMany(SchoolClass::class, 'exam_classes', 'exam_id', 'school_class_id');
    }

    public function marks(): HasMany
    {
        return $this->hasMany(ExamMark::class);
    }

    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by');
    }

    public function isPublished(): bool
    {
        return $this->status === 'published';
    }
}
