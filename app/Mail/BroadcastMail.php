<?php

namespace App\Mail;

use App\Models\School;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Plain, school-branded email used by the broadcast centre and other bulk messages. */
class BroadcastMail extends Mailable
{
    use Queueable;

    public function __construct(public string $mailSubject, public string $body, public ?School $school = null) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->mailSubject,
            replyTo: $this->school?->email ? [$this->school->email] : [],
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.broadcast',
            text: 'mail.broadcast-text',
            with: ['body' => $this->body, 'school' => $this->school, 'subjectLine' => $this->mailSubject],
        );
    }
}
