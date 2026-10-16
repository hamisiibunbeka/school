<?php

namespace App\Services\Messaging\Beem;

use RuntimeException;

/** A Beem API call that failed, with Beem's numeric code (see docs.beem.africa/guides/sms/api-responses). */
class BeemException extends RuntimeException
{
    /** Beem response codes → plain explanations for staff. */
    public const CODES = [
        101 => 'Invalid phone number.',
        102 => 'Insufficient SMS balance on the Beem account.',
        103 => 'Beem network timeout or internal error. Try again shortly.',
        104 => 'Missing required parameters.',
        109 => 'The message is empty or invalid.',
        110 => 'The message contains unsupported special characters.',
        111 => 'The sender ID is not registered or not active on Beem.',
        112 => 'The scheduled time is in the past.',
        113 => 'Invalid request format.',
        114 => 'Too many recipients in one request (maximum 1000).',
        115 => 'Missing destination number.',
        116 => 'Missing or invalid recipient reference.',
        117 => 'Invalid scheduled time format (expected YYYY-MM-DD HH:MM).',
        118 => 'Missing encoding type.',
        119 => 'Missing recipients.',
        120 => 'Beem rejected the API key or secret.',
        121 => 'Invalid sender ID format.',
        122 => 'Duplicate sender ID.',
        123 => 'SMS template not found.',
    ];

    public function __construct(string $message, public readonly ?int $beemCode = null, public readonly ?int $httpStatus = null)
    {
        parent::__construct($message);
    }

    public static function fromResponse(?int $code, ?string $message, ?int $httpStatus): self
    {
        $text = ($code !== null && isset(self::CODES[$code])) ? self::CODES[$code] : ($message ?: 'Beem request failed.');

        return new self(($code !== null ? "Beem {$code}: " : '').$text, $code, $httpStatus);
    }
}
