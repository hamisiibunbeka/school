<?php

namespace App\Console\Commands;

use App\Services\Messaging\MessageDispatcher;
use Illuminate\Console\Command;

class SendQueuedSms extends Command
{
    protected $signature = 'sms:send-queued {--school= : Only this school ID} {--limit=500 : Maximum messages per run}';

    protected $description = 'Send messages waiting in the "queued" state (e.g. fee reminders) through the configured SMS provider';

    public function handle(MessageDispatcher $dispatcher): int
    {
        $count = $dispatcher->sendQueued($this->option('school') ? (int) $this->option('school') : null, (int) $this->option('limit'));
        $this->info("Processed {$count} queued message(s).");

        return self::SUCCESS;
    }
}
