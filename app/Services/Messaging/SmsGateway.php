<?php

namespace App\Services\Messaging;

use App\Models\MessageLog;

/**
 * Outbound message provider contract (SMS / email).
 *
 * Real providers (e.g. Beem, NextSMS, Africa's Talking, SMTP) implement this
 * interface; every implementation must record the attempt in message_logs.
 */
interface SmsGateway
{
    /** Short provider name shown in logs/UI. */
    public function name(): string;

    /**
     * Send one message and return the delivery log row.
     *
     * @param  array{recipient_name?: string|null, subject?: string|null, credits?: int, sent_by?: int|null}  $meta
     */
    public function send(string $channel, string $recipient, string $message, array $meta = []): MessageLog;
}
