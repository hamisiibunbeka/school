<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Read-only, searchable audit trail for the current school (SRS 4.22). */
class AuditLogController extends Controller
{
    private const FILTERS = ['search', 'user', 'action', 'module', 'from', 'to'];

    public function index(Request $request): Response
    {
        $filters = array_merge(array_fill_keys(self::FILTERS, ''), $request->only(self::FILTERS));

        $logs = $this->filtered($filters)
            ->with('user:id,name,email')
            ->latest('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (AuditLog $l) => [
                'id' => $l->id,
                'user' => $l->user?->name,
                'user_email' => $l->user?->email,
                'action' => $l->action,
                'module' => $l->module,
                'subject' => $l->auditable_type ? class_basename($l->auditable_type).' #'.$l->auditable_id : null,
                'description' => $l->description,
                'old_values' => $l->old_values,
                'new_values' => $l->new_values,
                'ip_address' => $l->ip_address,
                'user_agent' => $l->user_agent,
                'created_at' => $l->created_at?->toIso8601String(),
            ]);

        $userIds = AuditLog::query()->whereNotNull('user_id')->distinct()->pluck('user_id');

        return Inertia::render('admin/audit-logs', [
            'logs' => $logs,
            'filters' => $filters,
            'users' => User::whereIn('id', $userIds)->orderBy('name')->get(['id', 'name'])->map(fn ($u) => ['value' => $u->id, 'label' => $u->name]),
            'actions' => AuditLog::query()->distinct()->orderBy('action')->pluck('action'),
            'modules' => AuditLog::query()->whereNotNull('module')->distinct()->orderBy('module')->pluck('module'),
            'stats' => [
                'today' => AuditLog::whereDate('created_at', now()->toDateString())->count(),
                'week' => AuditLog::where('created_at', '>=', now()->subDays(7))->count(),
                'security' => AuditLog::where('created_at', '>=', now()->subDays(30))->whereIn('action', ['login_failed', 'password_reset', 'role_changed', 'disabled', 'switched_school'])->count(),
                'exports' => AuditLog::where('created_at', '>=', now()->subDays(30))->where('action', 'exported')->count(),
            ],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(self::FILTERS);
        $this->audit('exported', null, 'Exported audit trail', 'administration', null, $filters);

        return response()->streamDownload(function () use ($filters) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Date', 'User', 'Action', 'Module', 'Subject', 'Description', 'Old values', 'New values', 'IP address']);
            $this->filtered($filters)->with('user:id,name')->latest('id')->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $l) {
                    fputcsv($out, [
                        $l->created_at, $l->user?->name ?? 'System', $l->action, $l->module,
                        $l->auditable_type ? class_basename($l->auditable_type).' #'.$l->auditable_id : '',
                        $l->description, $l->old_values ? json_encode($l->old_values) : '', $l->new_values ? json_encode($l->new_values) : '', $l->ip_address,
                    ]);
                }
            });
            fclose($out);
        }, 'audit-trail-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    /** @param  array<string, mixed>  $filters */
    private function filtered(array $filters)
    {
        return AuditLog::query()
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q) => $q->where('description', 'like', "%{$v}%")->orWhere('ip_address', 'like', "%{$v}%")))
            ->when($filters['user'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($filters['action'] ?? null, fn ($q, $v) => $q->where('action', $v))
            ->when($filters['module'] ?? null, fn ($q, $v) => $q->where('module', $v))
            ->when($filters['from'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($filters['to'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '<=', $v));
    }
}
