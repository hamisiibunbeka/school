<?php

namespace App\Http\Controllers\Saas;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\SupportTicket;
use App\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/** Platform overview for super administrators (SRS 3.4, 4.1). */
class DashboardController extends Controller
{
    public function __invoke(): Response
    {
        $byStatus = Tenant::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        $mrr = Subscription::query()
            ->where('status', 'active')
            ->whereDate('ends_at', '>=', now()->toDateString())
            ->get(['amount', 'starts_at', 'ends_at'])
            ->reduce(function (string $carry, Subscription $s) {
                $months = max(1, (int) round($s->starts_at->diffInMonths($s->ends_at)));

                return bcadd($carry, bcdiv((string) $s->amount, (string) $months, 2), 2);
            }, '0');

        $driver = DB::connection()->getDriverName();
        $monthExpr = $driver === 'sqlite' ? "strftime('%Y-%m', created_at)" : "DATE_FORMAT(created_at, '%Y-%m')";
        $newByMonth = Tenant::where('created_at', '>=', now()->subMonths(11)->startOfMonth())
            ->selectRaw("$monthExpr as ym, COUNT(*) as total")->groupBy('ym')->pluck('total', 'ym');
        $revenueByMonth = Subscription::whereNotNull('paid_at')->where('paid_at', '>=', now()->subMonths(11)->startOfMonth())
            ->selectRaw(($driver === 'sqlite' ? "strftime('%Y-%m', paid_at)" : "DATE_FORMAT(paid_at, '%Y-%m')").' as ym, SUM(amount) as total')
            ->groupBy('ym')->pluck('total', 'ym');

        $months = collect(range(11, 0))->map(fn ($i) => now()->subMonths($i));

        $students = DB::table('students')->whereNull('deleted_at')->where('status', 'active');

        return Inertia::render('saas/dashboard', [
            'stats' => [
                'tenants' => (int) $byStatus->sum(),
                'by_status' => $byStatus,
                'mrr' => $mrr,
                'arr' => bcmul($mrr, '12', 2),
                'students' => (clone $students)->count(),
                'schools' => DB::table('schools')->count(),
                'users' => DB::table('users')->where('is_super_admin', false)->count(),
                'open_tickets' => SupportTicket::whereIn('status', ['open', 'in_progress'])->count(),
                'urgent_tickets' => SupportTicket::whereIn('status', ['open', 'in_progress'])->whereIn('priority', ['high', 'urgent'])->count(),
                'revenue_year' => (string) Subscription::whereNotNull('paid_at')->whereYear('paid_at', now()->year)->sum('amount'),
            ],
            'chart' => [
                'labels' => $months->map(fn ($m) => $m->format('M y'))->values(),
                'tenants' => $months->map(fn ($m) => (int) ($newByMonth[$m->format('Y-m')] ?? 0))->values(),
                'revenue' => $months->map(fn ($m) => (float) ($revenueByMonth[$m->format('Y-m')] ?? 0))->values(),
            ],
            'expiring' => Tenant::with('plan:id,name')
                ->where(fn ($q) => $q->where(fn ($q) => $q->where('status', 'trial')->whereDate('trial_ends_at', '<=', now()->addDays(14)))
                    ->orWhere(fn ($q) => $q->whereIn('status', ['active', 'grace'])->whereDate('subscription_ends_at', '<=', now()->addDays(30))))
                ->orderByRaw('COALESCE(trial_ends_at, subscription_ends_at)')
                ->limit(8)->get()
                ->map(fn (Tenant $t) => [
                    'id' => $t->id, 'name' => $t->name, 'status' => $t->status, 'plan' => $t->plan?->name,
                    'ends_at' => ($t->status === 'trial' ? $t->trial_ends_at : $t->subscription_ends_at)?->toDateString(),
                ]),
            'recentTenants' => Tenant::with('plan:id,name')->withCount('schools')->latest()->limit(6)->get()
                ->map(fn (Tenant $t) => ['id' => $t->id, 'name' => $t->name, 'status' => $t->status, 'plan' => $t->plan?->name, 'schools_count' => $t->schools_count, 'created_at' => $t->created_at?->toIso8601String()]),
            'recentTickets' => SupportTicket::with('tenant:id,name')->whereIn('status', ['open', 'in_progress'])->latest()->limit(6)->get()
                ->map(fn ($t) => ['id' => $t->id, 'subject' => $t->subject, 'tenant' => $t->tenant?->name, 'priority' => $t->priority, 'status' => $t->status, 'created_at' => $t->created_at?->toIso8601String()]),
        ]);
    }
}
