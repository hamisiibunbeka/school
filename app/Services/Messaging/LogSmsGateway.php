<?php

namespace App\Services\Messaging;

use App\Models\MessageLog;
use Illuminate\Support\Str;

/**
 * Development / default driver: does not contact any provider, it only records
 * the message in message_logs as "sent" with a fake provider reference.
 */
class LogSmsGateway implements SmsGateway
{
    public function name(): string
    {
        return 'log';
    }

    public function send(string $channel, string $recipient, string $message, array $meta = []): MessageLog
    {
        return $this->deliver(MessageLog::create([
            'channel' => $channel,
            'recipient' => $recipient,
            'recipient_name' => $meta['recipient_name'] ?? null,
            'subject' => $meta['subject'] ?? null,
            'message' => $message,
            'status' => 'queued',
            'credits' => $meta['credits'] ?? 1,
            'sent_by' => $meta['sent_by'] ?? auth()->id(),
        ]));
    }

    public function deliver(MessageLog $log): MessageLog
    {
        $log->forceFill([
            'status' => 'sent',
            'provider' => $this->name(),
            'provider_reference' => 'LOG-'.strtoupper(Str::random(12)),
        ])->save();

        return $log;
    }
}
