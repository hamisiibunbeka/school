<?php

namespace App\Services\Messaging;

use App\Mail\BroadcastMail;
use App\Models\MessageLog;
use App\Models\School;
use Illuminate\Support\Facades\Mail;

/** Sends email through Laravel's configured mailer (MAIL_MAILER) and records it in message_logs. */
class MailGateway
{
    public function deliver(MessageLog $log): MessageLog
    {
        if (! filter_var($log->recipient, FILTER_VALIDATE_EMAIL)) {
            $log->forceFill(['status' => 'failed', 'provider' => 'mail', 'credits' => 0, 'error' => 'Invalid email address.'])->save();

            return $log;
        }

        try {
            $school = $log->school_id ? School::query()->find($log->school_id) : null;
            Mail::to($log->recipient, $log->recipient_name)->send(new BroadcastMail($log->subject ?: ($school?->name ?? config('app.name')), $log->message, $school));
            $log->forceFill(['status' => 'sent', 'provider' => 'mail:'.config('mail.default'), 'credits' => 0, 'error' => null])->save();
        } catch (\Throwable $e) {
            report($e);
            $log->forceFill(['status' => 'failed', 'provider' => 'mail:'.config('mail.default'), 'credits' => 0, 'error' => mb_substr('Mail error: '.$e->getMessage(), 0, 255)])->save();
        }

        return $log;
    }
}
