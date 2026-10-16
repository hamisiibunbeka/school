<?php

namespace App\Jobs;

use App\Services\Messaging\MessageDispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Sends a school's queued messages in the background (dispatched after bulk actions such as fee reminders). */
class SendQueuedMessages implements ShouldQueue
{
    use Queueable;

    public function __construct(public ?int $schoolId = null) {}

    public function handle(MessageDispatcher $dispatcher): void
    {
        $dispatcher->sendQueued($this->schoolId, 1000);
    }
}
