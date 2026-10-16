<?php

namespace App\Services\Messaging;

use App\Jobs\SendBroadcast;
use App\Models\Broadcast;
use App\Services\AuditLogger;
use App\Support\Tenancy;
use Illuminate\Support\Collection;

/**
 * Broadcast centre engine: resolves several stakeholder audiences into one
 * de-duplicated recipient list per channel, estimates SMS credits and sends
 * (small broadcasts immediately, large or scheduled ones on the queue).
 */
class BroadcastService
{
    /** Broadcasts up to this many messages go out during the request; larger ones are queued. */
    public const SYNC_LIMIT = 200;

    public function __construct(protected MessageService $messages, protected SmsCredits $credits) {}

    /**
     * @param  array<int, array<string, mixed>>  $audiences
     * @return array<string, Collection<int, array{recipient: string, name: string|null, vars: array<string, string|null>}>>
     */
    public function recipients(string $channel, array $audiences): array
    {
        $out = [];
        foreach ($channel === 'both' ? ['sms', 'email'] : [$channel] as $c) {
            $out[$c] = collect($audiences)
                ->flatMap(fn ($a) => $this->messages->recipients($c, $a))
                ->unique('recipient')
                ->values();
        }

        return $out;
    }

    /**
     * Counts, credit estimate and sample messages for the composer preview.
     *
     * @param  array<int, array<string, mixed>>  $audiences
     * @return array<string, mixed>
     */
    public function preview(string $channel, array $audiences, string $body, ?string $subject): array
    {
        $lists = $this->recipients($channel, $audiences);
        $sms = $lists['sms'] ?? collect();
        $email = $lists['email'] ?? collect();
        $credits = $sms->sum(fn ($r) => MessageService::credits(MessageService::render($body, $r['vars'])));

        $perAudience = collect($audiences)->map(fn ($a) => [
            'type' => $a['type'],
            'sms' => isset($lists['sms']) ? $this->messages->recipients('sms', $a)->count() : null,
            'email' => isset($lists['email']) ? $this->messages->recipients('email', $a)->count() : null,
        ])->values();

        $balance = $this->credits->balance(app(Tenancy::class)->tenant());
        $samples = ($sms->isNotEmpty() ? $sms : $email)->take(3)->map(fn ($r) => [
            'recipient' => $r['recipient'],
            'name' => $r['name'],
            'subject' => $subject ? MessageService::render($subject, $r['vars']) : null,
            'message' => MessageService::render($body, $r['vars']),
        ])->values();

        return [
            'sms' => $sms->count(),
            'email' => $email->count(),
            'credits' => $credits,
            'balance' => $balance['total'],
            'enough' => $credits <= $balance['total'],
            'per_audience' => $perAudience,
            'samples' => $samples,
        ];
    }

    /** Start sending now: inline for small lists, otherwise on the queue. */
    public function launch(Broadcast $broadcast): void
    {
        $lists = $this->recipients($broadcast->channel, $broadcast->audiences);
        $total = collect($lists)->sum->count();

        $broadcast->forceFill(['status' => 'queued', 'recipients' => $total, 'scheduled_at' => $broadcast->scheduled_at ?? now()])->save();

        if ($total <= self::SYNC_LIMIT) {
            $this->process($broadcast, $lists);
        } else {
            SendBroadcast::dispatch($broadcast->id);
        }
    }

    /**
     * Send every message of a broadcast. Safe to re-run: recipients already
     * logged for this broadcast are skipped.
     *
     * @param  array<string, Collection<int, array<string, mixed>>>|null  $lists
     */
    public function process(Broadcast $broadcast, ?array $lists = null): void
    {
        if (in_array($broadcast->status, ['completed', 'cancelled', 'draft'], true)) {
            return;
        }

        $lists ??= $this->recipients($broadcast->channel, $broadcast->audiences);
        $broadcast->forceFill(['status' => 'sending', 'started_at' => $broadcast->started_at ?? now(), 'recipients' => collect($lists)->sum->count()])->save();

        $done = $broadcast->logs()->get(['channel', 'recipient'])->map(fn ($l) => $l->channel.'|'.$l->recipient)->flip();
        $gateway = $this->messages->gateway();
        $outOfCredit = false;

        foreach ($lists as $channel => $recipients) {
            foreach ($recipients as $r) {
                if (isset($done[$channel.'|'.$r['recipient']])) {
                    continue;
                }

                $text = MessageService::render($broadcast->body, $r['vars']);
                try {
                    $log = $gateway->send($channel, $r['recipient'], $text, [
                        'broadcast_id' => $broadcast->id,
                        'recipient_name' => $r['name'],
                        'subject' => $broadcast->subject ? MessageService::render($broadcast->subject, $r['vars']) : null,
                        'credits' => MessageService::credits($text, $channel),
                        'sent_by' => $broadcast->created_by,
                    ]);
                    $outOfCredit = $outOfCredit || str_starts_with((string) $log->error, 'Insufficient SMS credits');
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        $this->refreshStats($broadcast);
        $broadcast->forceFill([
            'status' => 'completed',
            'completed_at' => now(),
            'error' => $outOfCredit ? 'Some SMS were not sent because the SMS credit balance ran out.' : null,
        ])->save();

        AuditLogger::log('sent', $broadcast, "Broadcast \"{$broadcast->title}\" sent: {$broadcast->sent} delivered to provider, {$broadcast->failed} failed, {$broadcast->credits} SMS credits", module: 'communication');
    }

    /** Re-send the failed messages of a completed broadcast. */
    public function retryFailed(Broadcast $broadcast): int
    {
        $gateway = $this->messages->gateway();
        $failed = $broadcast->logs()->where('status', 'failed')->get();

        foreach ($failed as $log) {
            $log->forceFill(['status' => 'queued', 'error' => null])->save();
            $gateway->deliver($log);
        }

        $this->refreshStats($broadcast);

        return $failed->count();
    }

    public function refreshStats(Broadcast $broadcast): void
    {
        $row = $broadcast->logs()
            ->selectRaw("SUM(status <> 'failed') as sent, SUM(status = 'failed') as failed, SUM(CASE WHEN status <> 'failed' AND channel = 'sms' THEN credits ELSE 0 END) as credits")
            ->first();

        $broadcast->forceFill(['sent' => (int) $row->sent, 'failed' => (int) $row->failed, 'credits' => (int) $row->credits])->save();
    }
}
