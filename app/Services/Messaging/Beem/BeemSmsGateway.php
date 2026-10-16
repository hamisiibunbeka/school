<?php

namespace App\Services\Messaging\Beem;

use App\Models\MessageLog;
use App\Models\School;
use App\Services\Messaging\GsmText;
use App\Services\Messaging\LogSmsGateway;
use App\Services\Messaging\SmsGateway;

/**
 * Sends SMS through Beem Africa. Email (and other channels) fall back to the log driver.
 *
 * The log row is written first as "queued", then updated: "sent" with Beem's request_id
 * as provider_reference, or "failed" with Beem's explanation. Delivery is confirmed later
 * by `sms:sync-delivery` (Beem has no push callback for local SMS; reports are pulled).
 */
class BeemSmsGateway implements SmsGateway
{
    public function __construct(protected BeemClient $client, protected LogSmsGateway $fallback = new LogSmsGateway) {}

    public function name(): string
    {
        return 'beem';
    }

    public function send(string $channel, string $recipient, string $message, array $meta = []): MessageLog
    {
        if ($channel !== 'sms') {
            return $this->fallback->send($channel, $recipient, $message, $meta);
        }

        return $this->deliver(MessageLog::create([
            'channel' => 'sms',
            'recipient' => $recipient,
            'recipient_name' => $meta['recipient_name'] ?? null,
            'subject' => $meta['subject'] ?? null,
            'message' => $message,
            'status' => 'queued',
            'credits' => $meta['credits'] ?? GsmText::segments($message),
            'sent_by' => $meta['sent_by'] ?? auth()->id(),
        ]));
    }

    public function deliver(MessageLog $log): MessageLog
    {
        if ($log->channel !== 'sms') {
            return $this->fallback->deliver($log);
        }

        $text = GsmText::normalize($log->message);
        $dest = self::destination($log->recipient);

        try {
            if ($dest === null) {
                throw new BeemException('Invalid phone number.', 101);
            }
            if ($text === '') {
                throw new BeemException('The message is empty after removing unsupported characters.', 109);
            }

            $result = $this->client->send(self::senderFor($log->school_id), $text, [1 => $dest]);

            $log->forceFill([
                'status' => $result['valid'] > 0 ? 'sent' : 'failed',
                'provider' => $this->name(),
                'provider_reference' => $result['request_id'],
                'message' => $text,
                'credits' => GsmText::segments($text),
                'error' => $result['valid'] > 0 ? null : 'Beem rejected the number as invalid.',
            ])->save();
        } catch (BeemException $e) {
            $log->forceFill(['status' => 'failed', 'provider' => $this->name(), 'error' => mb_substr($e->getMessage(), 0, 255)])->save();
        }

        return $log;
    }

    /** International format without "+", as Beem expects (e.g. 255712345678). */
    public static function destination(?string $phone): ?string
    {
        $normalized = \App\Services\Messaging\MessageService::normalizePhone($phone);

        return $normalized ? ltrim($normalized, '+') : null;
    }

    /** The school's approved sender ID, else the platform default. */
    public static function senderFor(?int $schoolId): string
    {
        $school = $schoolId ? School::query()->find($schoolId) : null;
        $sender = trim((string) ($school?->setting('sms_sender_id') ?? ''));

        return $sender !== '' ? $sender : (string) config('services.beem.sender_id', 'INFO');
    }
}
