<?php

namespace App\Services\Messaging;

use App\Models\MessageLog;
use App\Services\Messaging\Beem\BeemClient;
use App\Services\Messaging\Beem\BeemException;
use App\Services\Messaging\Beem\BeemSmsGateway;

/**
 * Background SMS work shared by the scheduler commands and queued jobs:
 * sending rows left in "queued" (e.g. fee reminders) and pulling Beem delivery reports.
 */
class MessageDispatcher
{
    public function __construct(protected SmsGateway $gateway) {}

    /** Send queued messages, oldest first. Returns the number processed. */
    public function sendQueued(?int $schoolId = null, int $limit = 500): int
    {
        $logs = MessageLog::withoutGlobalScopes()
            ->where('status', 'queued')
            ->when($schoolId, fn ($q) => $q->where('school_id', $schoolId))
            ->orderBy('id')
            ->limit($limit)
            ->get();

        foreach ($logs as $log) {
            try {
                $this->gateway->deliver($log);
            } catch (\Throwable $e) {
                report($e);
                $log->forceFill(['status' => 'failed', 'error' => mb_substr('Send error: '.$e->getMessage(), 0, 255)])->save();
            }
        }

        return $logs->count();
    }

    /**
     * Pull Beem delivery reports for SMS sent 5 minutes to $hours ago that are not yet final.
     *
     * @return array{checked: int, delivered: int, undelivered: int, pending: int}
     */
    public function syncBeemDelivery(BeemClient $client, int $hours = 72, int $limit = 300): array
    {
        $stats = ['checked' => 0, 'delivered' => 0, 'undelivered' => 0, 'pending' => 0];

        $logs = MessageLog::withoutGlobalScopes()
            ->where('provider', 'beem')
            ->where('channel', 'sms')
            ->where('status', 'sent')
            ->whereNotNull('provider_reference')
            ->whereBetween('created_at', [now()->subHours($hours), now()->subMinutes(5)])
            ->where(fn ($q) => $q->whereNull('delivery_checked_at')->orWhere('delivery_checked_at', '<=', now()->subMinutes(10)))
            ->orderBy('delivery_checked_at')
            ->limit($limit)
            ->get();

        foreach ($logs as $log) {
            $dest = BeemSmsGateway::destination($log->recipient);
            if (! $dest) {
                continue;
            }

            try {
                $status = $client->deliveryStatus($dest, (string) $log->provider_reference);
            } catch (BeemException $e) {
                report($e);
                break; // credentials or network problem: stop this run, try again next time
            }

            $stats['checked']++;
            $update = ['delivery_checked_at' => now()];
            if ($status === 'DELIVERED') {
                $update += ['status' => 'delivered', 'delivered_at' => now()];
                $stats['delivered']++;
            } elseif ($status === 'UNDELIVERED') {
                $update += ['status' => 'failed', 'error' => 'Not delivered by the mobile network (phone off, out of coverage or number inactive).'];
                $stats['undelivered']++;
            } else {
                $stats['pending']++;
            }
            $log->forceFill($update)->save();
        }

        return $stats;
    }
}
