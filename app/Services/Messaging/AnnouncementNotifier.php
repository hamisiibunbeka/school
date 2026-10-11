<?php

namespace App\Services\Messaging;

use App\Models\Announcement;
use App\Models\Employee;
use App\Models\Guardian;
use App\Models\Student;
use App\Models\User;
use App\Notifications\SchoolNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * Fans an announcement out as in-app notifications to the targeted users:
 * staff (users linked to an employee), parents (guardian users) and students.
 */
class AnnouncementNotifier
{
    /** @return int number of users notified */
    public function notify(Announcement $announcement): int
    {
        if ($announcement->notified_at) {
            return 0;
        }

        $audience = $announcement->audience;
        $classId = $audience === 'class' ? $announcement->school_class_id : null;
        $type = match ($announcement->priority) {
            'urgent' => 'error',
            'important' => 'warning',
            default => 'info',
        };
        $title = ($announcement->priority === 'urgent' ? 'URGENT: ' : '').$announcement->title;
        $message = Str::limit(strip_tags($announcement->body), 180);

        $count = 0;

        if (in_array($audience, ['all', 'staff'], true)) {
            $count += $this->send(Employee::whereNotNull('user_id')->where('status', 'active')->pluck('user_id'), $title, $message, null, $type);
        }

        if (in_array($audience, ['all', 'parents', 'class'], true)) {
            $ids = Guardian::whereNotNull('user_id')
                ->when($classId, fn ($q) => $q->whereHas('students', fn ($s) => $s->where('school_class_id', $classId)->where('status', 'active')))
                ->pluck('user_id');
            $count += $this->send($ids, $title, $message, '/portal', $type);
        }

        if (in_array($audience, ['all', 'students', 'class'], true)) {
            $ids = Student::whereNotNull('user_id')->where('status', 'active')
                ->when($classId, fn ($q) => $q->where('school_class_id', $classId))
                ->pluck('user_id');
            $count += $this->send($ids, $title, $message, '/portal', $type);
        }

        $announcement->forceFill(['notified_at' => now()])->save();

        return $count;
    }

    /** @param  Collection<int, int|null>  $userIds */
    private function send(Collection $userIds, string $title, string $message, ?string $url, string $type): int
    {
        $ids = $userIds->filter()->unique()->values();
        $count = 0;

        User::whereIn('id', $ids)->where('status', 'active')->chunkById(200, function ($users) use ($title, $message, $url, $type, &$count) {
            Notification::send($users, new SchoolNotification($title, $message, $url, $type));
            $count += $users->count();
        });

        return $count;
    }
}
