<?php

namespace App\Http\Controllers\Communication;

use App\Http\Controllers\Controller;
use App\Models\MessageLog;
use App\Services\Messaging\MessageService;
use App\Services\Messaging\SmsCredits;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Delivery log of every SMS / email and credit usage (SRS 4.18, 6). Sending happens in the broadcast centre. */
class MessageController extends Controller
{
    public function index(Request $request, MessageService $messages, SmsCredits $credits): Response
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
                'broadcast_id' => $m->broadcast_id,
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
            'gateway' => $messages->gateway()->name(),
            'balance' => $credits->balance($this->tenancy()->tenant()),
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
}
