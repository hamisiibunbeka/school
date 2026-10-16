<?php

namespace App\Console\Commands;

use App\Services\Messaging\Beem\BeemClient;
use App\Services\Messaging\MessageDispatcher;
use Illuminate\Console\Command;

class SyncSmsDelivery extends Command
{
    protected $signature = 'sms:sync-delivery {--hours=72 : Look back this many hours} {--limit=300 : Maximum reports per run}';

    protected $description = 'Pull Beem delivery reports and mark SMS as delivered or failed';

    public function handle(MessageDispatcher $dispatcher): int
    {
        if (config('services.sms.driver') !== 'beem' || ! BeemClient::configured()) {
            $this->line('Beem is not the active SMS driver; nothing to sync.');

            return self::SUCCESS;
        }

        $s = $dispatcher->syncBeemDelivery(BeemClient::fromConfig(), (int) $this->option('hours'), (int) $this->option('limit'));
        $this->info("Checked {$s['checked']}: {$s['delivered']} delivered, {$s['undelivered']} undelivered, {$s['pending']} still pending.");

        return self::SUCCESS;
    }
}
