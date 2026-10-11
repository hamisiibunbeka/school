<?php

namespace App\Services\Exams;

use App\Models\ClassSubject;
use App\Models\Employee;
use App\Models\Stream;
use App\Models\User;

/**
 * Restricts teachers to their assigned classes/subjects (SRS 15.2:
 * "Teachers can record attendance and marks only for assigned classes/subjects").
 *
 * A user is "restricted" when their role slug is `teacher`. Admins, principals,
 * school admins and super admins are unrestricted.
 *
 * - Attendance: allowed for streams where the teacher is class teacher, or for a
 *   class/stream where they hold any class_subjects allocation (class-wide
 *   allocations, i.e. stream_id NULL, cover every stream of the class).
 * - Marks: allowed only for subjects allocated to them (class_subjects.employee_id).
 */
class TeacherAccess
{
    /** @var array<int, array{employee:?int, allocations:\Illuminate\Support\Collection, classTeacherStreams:array<int,int>}> */
    private array $cache = [];

    public function isRestricted(?User $user): bool
    {
        if (! $user || $user->is_super_admin) {
            return false;
        }

        return $user->role?->slug === 'teacher';
    }

    /** Approvers (moderation, publishing) must hold exams.manage and not be a plain teacher. */
    public function canApprove(?User $user): bool
    {
        return $user !== null && $user->can('exams.manage') && ! $this->isRestricted($user);
    }

    public function employeeId(User $user): ?int
    {
        return $this->context($user)['employee'];
    }

    // ------------------------------------------------------------- attendance

    public function canTakeAttendance(?User $user, int $classId, ?int $streamId): bool
    {
        if (! $this->isRestricted($user)) {
            return true;
        }

        $ctx = $this->context($user);
        if ($ctx['employee'] === null) {
            return false;
        }

        $allocations = $ctx['allocations']->where('school_class_id', $classId);

        if ($streamId) {
            return in_array($streamId, $ctx['classTeacherStreams'], true)
                || $allocations->contains(fn ($a) => $a->stream_id === null || (int) $a->stream_id === $streamId);
        }

        // Whole class: needs a class-wide allocation or to be class teacher of every stream.
        if ($allocations->contains(fn ($a) => $a->stream_id === null)) {
            return true;
        }
        $streamIds = Stream::where('school_class_id', $classId)->pluck('id')->map(fn ($id) => (int) $id)->all();

        return $streamIds !== [] && array_diff($streamIds, $ctx['classTeacherStreams']) === [];
    }

    /**
     * Class/stream combinations a teacher may take attendance for; null = unrestricted.
     *
     * @return array<int, array{class_id:int, stream_id:?int}>|null
     */
    public function attendanceScopes(?User $user): ?array
    {
        if (! $this->isRestricted($user)) {
            return null;
        }

        $ctx = $this->context($user);
        $scopes = [];
        foreach ($ctx['allocations'] as $a) {
            $scopes[] = ['class_id' => (int) $a->school_class_id, 'stream_id' => $a->stream_id ? (int) $a->stream_id : null];
        }
        foreach (Stream::whereIn('id', $ctx['classTeacherStreams'])->get(['id', 'school_class_id']) as $s) {
            $scopes[] = ['class_id' => (int) $s->school_class_id, 'stream_id' => (int) $s->id];
        }

        return array_values(array_unique($scopes, SORT_REGULAR));
    }

    // ------------------------------------------------------------------ marks

    public function canEnterMarks(?User $user, int $classId, ?int $streamId, int $subjectId): bool
    {
        if (! $this->isRestricted($user)) {
            return true;
        }

        return $this->context($user)['allocations']
            ->where('school_class_id', $classId)
            ->where('subject_id', $subjectId)
            ->contains(fn ($a) => $a->stream_id === null || ($streamId && (int) $a->stream_id === $streamId));
    }

    /**
     * Subject allocations for mark entry; null = unrestricted.
     *
     * @return array<int, array{class_id:int, stream_id:?int, subject_id:int}>|null
     */
    public function markScopes(?User $user): ?array
    {
        if (! $this->isRestricted($user)) {
            return null;
        }

        return $this->context($user)['allocations']
            ->map(fn ($a) => ['class_id' => (int) $a->school_class_id, 'stream_id' => $a->stream_id ? (int) $a->stream_id : null, 'subject_id' => (int) $a->subject_id])
            ->values()->all();
    }

    /** @return array{employee:?int, allocations:\Illuminate\Support\Collection, classTeacherStreams:array<int,int>} */
    private function context(User $user): array
    {
        if (isset($this->cache[$user->id])) {
            return $this->cache[$user->id];
        }

        $employeeId = Employee::where('user_id', $user->id)->value('id');

        return $this->cache[$user->id] = [
            'employee' => $employeeId ? (int) $employeeId : null,
            'allocations' => $employeeId
                ? ClassSubject::where('employee_id', $employeeId)->get(['school_class_id', 'stream_id', 'subject_id'])
                : collect(),
            'classTeacherStreams' => $employeeId
                ? Stream::where('class_teacher_id', $employeeId)->pluck('id')->map(fn ($id) => (int) $id)->all()
                : [],
        ];
    }
}
