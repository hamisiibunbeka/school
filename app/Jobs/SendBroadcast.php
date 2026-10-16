<?php

namespace App\Jobs;

use App\Models\Broadcast;
use App\Models\School;
use App\Services\Messaging\BroadcastService;
use App\Support\Tenancy;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Sends a large or scheduled broadcast in the background, inside its school's tenancy context. */
class SendBroadcast implements ShouldQueue
{
    use Queueable;

    public int $timeout = 3600;

    public function __construct(public int $broadcastId) {}

    public function handle(): void
    {
        $broadcast = Broadcast::withoutGlobalScopes()->find($this->broadcastId);
        $school = $broadcast ? School::find($broadcast->school_id) : null;
        if (! $broadcast || ! $school) {
            return;
        }

        app(Tenancy::class)->runAs($school, function () use ($broadcast) {
            app(BroadcastService::class)->process(Broadcast::findOrFail($broadcast->id));
        });
    }
}
