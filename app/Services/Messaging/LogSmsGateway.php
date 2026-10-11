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
        return MessageLog::create([
            'channel' => $channel,
            'recipient' => $recipient,
            'recipient_name' => $meta['recipient_name'] ?? null,
            'subject' => $meta['subject'] ?? null,
            'message' => $message,
            'status' => 'sent',
            'provider_reference' => 'LOG-'.strtoupper(Str::random(12)),
            'credits' => $meta['credits'] ?? 1,
            'sent_by' => $meta['sent_by'] ?? auth()->id(),
        ]);
    }
}
