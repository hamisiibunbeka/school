<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\MessageLog;
use App\Models\MessageTemplate;
use App\Services\Messaging\MessageService;
use App\Support\Lookups;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** SMS / email composer, delivery logs and credit usage (SRS 4.18, 6). */
class MessageController extends Controller
{
    public const AUDIENCES = ['guardians', 'class', 'staff', 'defaulters', 'custom'];

    public function index(Request $request, MessageService $messages): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'channel' => '', 'from' => '', 'to' => ''], $request->only(['search', 'status', 'channel', 'from', 'to']));

        $logs = $this->filteredLogs($filters)
            ->with('sender:id,name')
            ->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (MessageLog $m) => [
                'id' => $m->id,
                'channel' => $m->channel,
                'recipient' => $m->recipient,
                'recipient_name' => $m->recipient_name,
                'subject' => $m->subject,
                'message' => $m->message,
                'status' => $m->status,
                'provider_reference' => $m->provider_reference,
                'error' => $m->error,
                'credits' => $m->credits,
                'sender' => $m->sender?->name,
                'created_at' => $m->created_at?->toIso8601String(),
            ]);

        $monthStart = now()->startOfMonth();
        $thisMonth = MessageLog::where('created_at', '>=', $monthStart);

        $driver = DB::connection()->getDriverName();
        $monthExpr = $driver === 'sqlite' ? "strftime('%Y-%m', created_at)" : "DATE_FORMAT(created_at, '%Y-%m')";
        $byMonth = MessageLog::where('created_at', '>=', now()->subMonths(5)->startOfMonth())
            ->selectRaw("$monthExpr as ym, SUM(CASE WHEN status <> 'failed' THEN credits ELSE 0 END) as credits, COUNT(*) as total, SUM(status = 'failed') as failed")
            ->groupBy('ym')->orderBy('ym')->get()->keyBy('ym');

        $months = collect(range(5, 0))->map(function ($i) use ($byMonth) {
            $m = now()->subMonths($i);
            $row = $byMonth[$m->format('Y-m')] ?? null;

            return ['label' => $m->format('M Y'), 'credits' => (int) ($row->credits ?? 0), 'total' => (int) ($row->total ?? 0), 'failed' => (int) ($row->failed ?? 0)];
        })->values();

        $byStatus = MessageLog::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('communication/messages', [
            'logs' => $logs,
            'filters' => $filters,
            'templates' => MessageTemplate::orderBy('name')->get(['id', 'name', 'channel', 'subject', 'body']),
            'classes' => Lookups::classes(),
            'variables' => MessageTemplate::VARIABLES,
            'gateway' => $messages->gateway()->name(),
            'credits' => $this->creditAllowance(),
            'stats' => [
                'sent_month' => (clone $thisMonth)->where('status', '!=', 'failed')->count(),
                'credits_month' => (int) (clone $thisMonth)->where('status', '!=', 'failed')->sum('credits'),
                'failed_month' => (clone $thisMonth)->where('status', 'failed')->count(),
                'total' => (int) $byStatus->sum(),
                'by_status' => $byStatus,
            ],
            'chart' => $months,
        ]);
    }

    /** Resolve recipients and render sample messages before sending. */
    public function preview(Request $request, MessageService $messages): JsonResponse
    {
        $data = $this->validated($request);
        $recipients = $messages->recipients($data['channel'], $data);

        $credits = $recipients->sum(fn ($r) => MessageService::credits(MessageService::render($data['body'], $r['vars']), $data['channel']));
        $invalid = 0;
        if ($data['type'] === 'custom') {
            $raw = collect(preg_split('/[\s,;]+/', (string) $data['numbers']) ?: [])->filter()->count();
            $invalid = max(0, $raw - $recipients->count());
        }

        return response()->json([
            'count' => $recipients->count(),
            'credits' => $credits,
            'invalid' => $invalid,
            'samples' => $recipients->take(3)->map(fn ($r) => [
                'recipient' => $r['recipient'],
                'name' => $r['name'],
                'message' => MessageService::render($data['body'], $r['vars']),
            ])->values(),
        ]);
    }

    public function send(Request $request, MessageService $messages): RedirectResponse
    {
        $data = $this->validated($request);
        $recipients = $messages->recipients($data['channel'], $data);

        if ($recipients->isEmpty()) {
            $this->toast('No valid recipients were found for this audience.', 'error');

            return back();
        }

        if ($data['channel'] === 'sms') {
            $needed = $recipients->sum(fn ($r) => MessageService::credits(MessageService::render($data['body'], $r['vars'])));
            $allowance = $this->creditAllowance();
            if ($allowance['limit'] > 0 && $needed > $allowance['remaining']) {
                $this->toast("This send needs {$needed} SMS credits but only {$allowance['remaining']} remain this month. Upgrade your plan or reduce the audience.", 'error');

                return back();
            }
        }

        $result = $messages->dispatch($data['channel'], $data['subject'] ?? null, $data['body'], $recipients, $request->user()->id);

        $this->audit('sent', null, "Sent {$data['channel']} to {$result['sent']} recipients ({$data['type']})", 'communication', null, [
            'channel' => $data['channel'], 'audience' => $data['type'], 'sent' => $result['sent'], 'failed' => $result['failed'], 'credits' => $result['credits'],
        ]);

        $this->toast("Message sent to {$result['sent']} recipients".($result['failed'] ? ", {$result['failed']} failed" : '').($data['channel'] === 'sms' ? " · {$result['credits']} credits used." : '.'), $result['failed'] ? 'warning' : 'success');

        return back();
    }

    /** Retry a failed log entry through the gateway. */
    public function retry(MessageLog $log, MessageService $messages): RedirectResponse
    {
        abort_unless($log->status === 'failed', 422, 'Only failed messages can be retried.');

        $new = $messages->gateway()->send($log->channel, $log->recipient, $log->message, [
            'recipient_name' => $log->recipient_name, 'subject' => $log->subject, 'credits' => $log->credits, 'sent_by' => auth()->id(),
        ]);
        $log->update(['error' => trim(($log->error ? $log->error.' · ' : '').'Retried as #'.$new->id)]);

        $this->toast('Message re-sent.');

        return back();
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(['search', 'status', 'channel', 'from', 'to']);
        $this->audit('exported', null, 'Exported message delivery log', 'communication', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'Channel', 'Recipient', 'Name', 'Subject', 'Message', 'Status', 'Credits', 'Provider Ref', 'Error']);
            $this->filteredLogs($filters)->latest('id')->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $m) {
                    fputcsv($out, [$m->created_at, $m->channel, $m->recipient, $m->recipient_name, $m->subject, $m->message, $m->status, $m->credits, $m->provider_reference, $m->error]);
                }
            });
            fclose($out);
        }, 'message-log-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    /** @return array{limit: int, used: int, remaining: int} */
    private function creditAllowance(): array
    {
        $tenant = $this->tenancy()->tenant();
        $limit = (int) ($tenant?->plan?->sms_credits ?? 0);
        $used = (int) DB::table('message_logs')
            ->where('tenant_id', $tenant?->id)
            ->where('channel', 'sms')
            ->where('status', '!=', 'failed')
            ->where('created_at', '>=', now()->startOfMonth())
            ->sum('credits');

        return ['limit' => $limit, 'used' => $used, 'remaining' => max(0, $limit - $used)];
    }

    /** @param  array<string, mixed>  $filters */
    private function filteredLogs(array $filters)
    {
        return MessageLog::query()
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q) => $q->where('recipient', 'like', "%{$v}%")->orWhere('recipient_name', 'like', "%{$v}%")->orWhere('message', 'like', "%{$v}%")))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['channel'] ?? null, fn ($q, $v) => $q->where('channel', $v))
            ->when($filters['from'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($filters['to'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '<=', $v));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        return $request->validate([
            'channel' => ['required', Rule::in(['sms', 'email'])],
            'type' => ['required', Rule::in(self::AUDIENCES)],
            'school_class_id' => ['nullable', 'required_if:type,class', Rule::exists('school_classes', 'id')->where('school_id', $this->tenancy()->schoolId())],
            'min_balance' => ['nullable', 'required_if:type,defaulters', 'numeric', 'min:0'],
            'numbers' => ['nullable', 'required_if:type,custom', 'string', 'max:20000'],
            'subject' => ['nullable', 'required_if:channel,email', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:1600'],
        ], [], ['school_class_id' => 'class', 'type' => 'audience', 'body' => 'message', 'numbers' => 'recipients']);
    }
}
