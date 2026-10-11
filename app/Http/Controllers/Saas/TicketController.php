<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Notifications\SchoolNotification;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/** Tenant support tickets across the platform (SRS 4.24). */
class TicketController extends Controller
{
    public const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'priority' => ''], $request->only(['search', 'status', 'priority']));

        $tickets = SupportTicket::query()
            ->with(['tenant:id,name,status', 'creator:id,name,email'])
            ->when($filters['search'], fn ($q, $v) => $q->where(fn ($q) => $q->where('subject', 'like', "%{$v}%")->orWhere('description', 'like', "%{$v}%")->orWhereHas('tenant', fn ($t) => $t->where('name', 'like', "%{$v}%"))))
            ->when($filters['status'], fn ($q, $v) => $q->where('status', $v))
            ->when($filters['priority'], fn ($q, $v) => $q->where('priority', $v))
            ->orderByRaw("CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END")
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")
            ->latest()
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (SupportTicket $t) => [
                'id' => $t->id,
                'tenant_id' => $t->tenant_id,
                'tenant' => $t->tenant?->name,
                'tenant_status' => $t->tenant?->status,
                'creator' => $t->creator?->name,
                'creator_email' => $t->creator?->email,
                'subject' => $t->subject,
                'description' => $t->description,
                'priority' => $t->priority,
                'status' => $t->status,
                'resolution' => $t->resolution,
                'created_at' => $t->created_at?->toIso8601String(),
                'updated_at' => $t->updated_at?->toIso8601String(),
            ]);

        $byStatus = SupportTicket::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('saas/tickets', [
            'tickets' => $tickets,
            'filters' => $filters,
            'statuses' => self::STATUSES,
            'priorities' => self::PRIORITIES,
            'stats' => [
                'open' => (int) ($byStatus['open'] ?? 0),
                'in_progress' => (int) ($byStatus['in_progress'] ?? 0),
                'resolved' => (int) (($byStatus['resolved'] ?? 0) + ($byStatus['closed'] ?? 0)),
                'urgent' => SupportTicket::whereIn('status', ['open', 'in_progress'])->where('priority', 'urgent')->count(),
            ],
        ]);
    }

    public function update(Request $request, SupportTicket $ticket): RedirectResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(self::STATUSES)],
            'priority' => ['required', Rule::in(self::PRIORITIES)],
            'resolution' => ['nullable', Rule::requiredIf(in_array($request->input('status'), ['resolved', 'closed'], true)), 'string', 'max:3000'],
        ]);

        $old = $ticket->only(['status', 'priority', 'resolution']);
        $ticket->update($data);

        $this->audit('ticket_updated', $ticket, "Ticket #{$ticket->id} {$old['status']} → {$ticket->status}", 'saas', $old, $data);

        if ($old['status'] !== $ticket->status && $ticket->creator) {
            $ticket->creator->notify(new SchoolNotification(
                "Support ticket #{$ticket->id} ".str_replace('_', ' ', $ticket->status),
                $ticket->resolution ? \Illuminate\Support\Str::limit($ticket->resolution, 160) : $ticket->subject,
                '/admin/subscription',
                $ticket->status === 'resolved' ? 'success' : 'info',
            ));
        }

        $this->toast('Ticket updated.');

        return back();
    }
}
