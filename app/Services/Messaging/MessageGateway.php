<?php

namespace App\Services\Messaging;

use App\Models\MessageLog;

/**
 * The application's SmsGateway: routes SMS to the configured provider
 * (log | beem) and email to Laravel Mail, and meters SMS against the
 * account's credit wallet. Every send path (broadcasts, fee reminders,
 * pocket money alerts, retries, the queue) goes through deliver().
 */
class MessageGateway implements SmsGateway
{
    public function __construct(
        protected SmsGateway $sms,
        protected MailGateway $mail,
        protected SmsCredits $credits,
    ) {}

    public function name(): string
    {
        return $this->sms->name();
    }

    /** The underlying SMS provider driver. */
    public function smsDriver(): SmsGateway
    {
        return $this->sms;
    }

    public function send(string $channel, string $recipient, string $message, array $meta = []): MessageLog
    {
        return $this->deliver(MessageLog::create([
            'broadcast_id' => $meta['broadcast_id'] ?? null,
            'channel' => $channel,
            'recipient' => $recipient,
            'recipient_name' => $meta['recipient_name'] ?? null,
            'subject' => $meta['subject'] ?? null,
            'message' => $message,
            'status' => 'queued',
            'credits' => $channel === 'sms' ? ($meta['credits'] ?? GsmText::segments($message)) : 0,
            'sent_by' => $meta['sent_by'] ?? auth()->id(),
        ]));
    }

    public function deliver(MessageLog $log): MessageLog
    {
        if ($log->channel === 'email') {
            return $this->mail->deliver($log);
        }

        if ($log->channel !== 'sms') {
            return $this->sms->deliver($log);
        }

        $charge = max(1, (int) $log->credits);
        $split = $log->tenant_id ? $this->credits->consume($log->tenant_id, $charge) : ['plan' => 0, 'purchased' => 0];

        if ($split === null) {
            $log->forceFill([
                'status' => 'failed',
                'provider' => $this->sms->name(),
                'error' => 'Insufficient SMS credits. Buy an SMS bundle under Communication → SMS Credits.',
            ])->save();

            return $log;
        }

        $log = $this->sms->deliver($log);

        if (! $log->tenant_id) {
            return $log;
        }

        if ($log->status === 'failed') {
            $this->credits->refund($log->tenant_id, $split);
        } elseif ((int) $log->credits !== $charge) {
            // The provider may re-count parts after normalising the text.
            $diff = (int) $log->credits - $charge;
            if ($diff > 0) {
                $this->credits->consume($log->tenant_id, $diff);
            } else {
                $this->credits->refund($log->tenant_id, ['plan' => 0, 'purchased' => -$diff]);
            }
        }

        return $log;
    }
}
