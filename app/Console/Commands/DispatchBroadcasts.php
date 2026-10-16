<?php

namespace App\Console\Commands;

use App\Jobs\SendBroadcast;
use App\Models\Broadcast;
use Illuminate\Console\Command;

/** Starts scheduled broadcasts that are due and picks up queued ones whose job never ran. */
class DispatchBroadcasts extends Command
{
    protected $signature = 'broadcasts:dispatch';

    protected $description = 'Send scheduled broadcasts that are due (and re-dispatch stalled queued ones)';

    public function handle(): int
    {
        $due = Broadcast::withoutGlobalScopes()
            ->where(fn ($q) => $q->where(fn ($q) => $q->where('status', 'scheduled')->where('scheduled_at', '<=', now()))
                ->orWhere(fn ($q) => $q->where('status', 'queued')->where('updated_at', '<=', now()->subMinutes(5))))
            ->orderBy('scheduled_at')
            ->limit(20)
            ->get();

        foreach ($due as $broadcast) {
            $broadcast->forceFill(['status' => 'queued'])->save();
            SendBroadcast::dispatchSync($broadcast->id);
        }

        $this->info("Processed {$due->count()} broadcast(s).");

        return self::SUCCESS;
    }
}
