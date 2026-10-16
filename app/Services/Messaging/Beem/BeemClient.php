<?php

namespace App\Services\Messaging\Beem;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Thin client for the Beem Africa SMS API.
 *
 * Auth: HTTP Basic with the API key (username) and secret (password).
 * Send:   POST {base}/v1/send                                  → { successful, request_id, code: 100, valid, invalid, duplicates }
 * DLR:    GET  {dlr}/public/v1/delivery-reports?dest_addr&request_id → [{ dest_addr, status: PENDING|DELIVERED|UNDELIVERED, request_id }]
 * Balance GET  {base}/public/v1/vendors/balance                → { data: { credit_balance } }
 * Senders GET  {base}/public/v1/sender-names                   → { data: [{ senderid, status, ... }], pagination }
 */
class BeemClient
{
    public function __construct(
        protected string $apiKey,
        protected string $secretKey,
        protected string $baseUrl = 'https://apisms.beem.africa',
        protected string $dlrUrl = 'https://dlrapi.beem.africa',
        protected int $timeout = 20,
    ) {}

    public static function fromConfig(): self
    {
        $c = config('services.beem');

        return new self((string) ($c['api_key'] ?? ''), (string) ($c['secret_key'] ?? ''), rtrim((string) $c['base_url'], '/'), rtrim((string) $c['dlr_url'], '/'), (int) ($c['timeout'] ?? 20));
    }

    public static function configured(): bool
    {
        return filled(config('services.beem.api_key')) && filled(config('services.beem.secret_key'));
    }

    /**
     * Submit one message to up to 1000 recipients.
     *
     * @param  array<int, string>  $recipients  recipient_id => number in international format without "+" (e.g. 255712345678)
     * @return array{request_id: string, valid: int, invalid: int, duplicates: int}
     */
    public function send(string $senderId, string $message, array $recipients, ?string $scheduleTimeUtc = null): array
    {
        $payload = [
            'source_addr' => $senderId,
            'encoding' => 0, // GSM 7-bit; text is normalised to the GSM alphabet before sending
            'message' => $message,
            'schedule_time' => $scheduleTimeUtc ?? '',
            'recipients' => collect($recipients)->map(fn ($dest, $id) => ['recipient_id' => (int) $id, 'dest_addr' => $dest])->values()->all(),
        ];

        $json = $this->json($this->call(fn () => $this->http()->post($this->baseUrl.'/v1/send', $payload)));

        if (! ($json['successful'] ?? false) || (int) ($json['code'] ?? 0) !== 100) {
            throw BeemException::fromResponse(isset($json['code']) ? (int) $json['code'] : null, $json['message'] ?? null, 200);
        }

        return [
            'request_id' => (string) $json['request_id'],
            'valid' => (int) ($json['valid'] ?? 0),
            'invalid' => (int) ($json['invalid'] ?? 0),
            'duplicates' => (int) ($json['duplicates'] ?? 0),
        ];
    }

    /** Delivery status for one recipient of a request: PENDING, DELIVERED, UNDELIVERED, or null when Beem has no report yet. */
    public function deliveryStatus(string $destAddr, string $requestId): ?string
    {
        $response = $this->call(fn () => $this->http()->get($this->dlrUrl.'/public/v1/delivery-reports', ['dest_addr' => $destAddr, 'request_id' => $requestId]));
        if ($response->status() === 404) {
            return null;
        }

        $json = $this->json($response);
        $row = collect(array_is_list($json) ? $json : [$json])->first(fn ($r) => is_array($r) && isset($r['status']));

        return $row ? strtoupper((string) $row['status']) : null;
    }

    public function balance(): float
    {
        $json = $this->json($this->call(fn () => $this->http()->get($this->baseUrl.'/public/v1/vendors/balance')));

        return (float) data_get($json, 'data.credit_balance', 0);
    }

    /** @return array<int, array{senderid: string, status: string}> */
    public function senderNames(): array
    {
        $json = $this->json($this->call(fn () => $this->http()->get($this->baseUrl.'/public/v1/sender-names', ['limit' => 100])));

        return collect($json['data'] ?? [])->map(fn ($s) => ['senderid' => (string) ($s['senderid'] ?? ''), 'status' => (string) ($s['status'] ?? '')])->values()->all();
    }

    protected function http(): PendingRequest
    {
        if ($this->apiKey === '' || $this->secretKey === '') {
            throw new BeemException('Beem is not configured: set BEEM_API_KEY and BEEM_SECRET_KEY in .env.');
        }

        return Http::withBasicAuth($this->apiKey, $this->secretKey)->acceptJson()->asJson()->timeout($this->timeout);
    }

    protected function call(callable $request): Response
    {
        try {
            return $request();
        } catch (ConnectionException $e) {
            throw new BeemException('Could not reach Beem: '.$e->getMessage(), 103);
        }
    }

    /** @return array<mixed> */
    protected function json(Response $response): array
    {
        $json = $response->json();
        if ($response->failed()) {
            $json = is_array($json) ? $json : [];
            throw BeemException::fromResponse(isset($json['code']) ? (int) $json['code'] : null, $json['message'] ?? $json['error'] ?? null, $response->status());
        }

        return is_array($json) ? $json : [];
    }
}
