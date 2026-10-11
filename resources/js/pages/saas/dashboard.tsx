import { Link } from '@inertiajs/react';
import { Building2, CircleDollarSign, GraduationCap, LifeBuoy, TrendingUp } from 'lucide-react';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { GradientStatCard } from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { compact, date, dateTime, money, num, titleCase } from '@/lib/utils';

type Props = {
    stats: {
        tenants: number;
        by_status: Record<string, number>;
        mrr: string;
        arr: string;
        students: number;
        schools: number;
        users: number;
        open_tickets: number;
        urgent_tickets: number;
        revenue_year: string;
    };
    chart: { labels: string[]; tenants: number[]; revenue: number[] };
    expiring: { id: number; name: string; status: string; plan: string | null; ends_at: string | null }[];
    recentTenants: { id: number; name: string; status: string; plan: string | null; schools_count: number; created_at: string }[];
    recentTickets: { id: number; subject: string; tenant: string | null; priority: string; status: string; created_at: string }[];
};

const statusOrder = ['active', 'trial', 'grace', 'suspended', 'cancelled'];
const statusColors: Record<string, string> = { active: '#00ab55', trial: '#2196f3', grace: '#e2a03f', suspended: '#e7515a', cancelled: '#3b3f5c' };

export default function SaasDashboard({ stats, chart, expiring, recentTenants, recentTickets }: Props) {
    const statuses = statusOrder.filter((s) => stats.by_status[s]);

    return (
        <>
            <PageHeader title="Platform Overview" subtitle="Tenants, recurring revenue, usage and support across the platform." breadcrumbs={[{ title: 'SaaS Console' }]} />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <GradientStatCard title="Tenants" value={num(stats.tenants)} icon={Building2} color="primary" footer={`${num(stats.by_status.active ?? 0)} active · ${num(stats.by_status.trial ?? 0)} on trial`} />
                <GradientStatCard title="MRR (estimate)" value={money(stats.mrr)} icon={CircleDollarSign} color="success" footer={`ARR ${money(stats.arr)}`} />
                <GradientStatCard title="Active students" value={num(stats.students)} icon={GraduationCap} color="violet" footer={`${num(stats.schools)} schools · ${num(stats.users)} users`} />
                <GradientStatCard title="Open tickets" value={num(stats.open_tickets)} icon={LifeBuoy} color={stats.urgent_tickets ? 'danger' : 'cyan'} footer={`${num(stats.urgent_tickets)} high / urgent`} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Growth — last 12 months</h5>
                        <span className="badge badge-soft-success">
                            <TrendingUp className="me-1 inline h-3 w-3" /> {money(stats.revenue_year)} collected this year
                        </span>
                    </div>
                    <Chart
                        type="line"
                        height={300}
                        series={[
                            { name: 'Subscription revenue', type: 'area', data: chart.revenue },
                            { name: 'New tenants', type: 'column', data: chart.tenants },
                        ]}
                        options={{
                                                        xaxis: { categories: chart.labels },
                            yaxis: [{ labels: { formatter: (v: number) => compact(v) } }, { opposite: true, labels: { formatter: (v: number) => String(Math.round(v)) } }],
                            stroke: { width: [2.5, 0], curve: 'smooth' },
                            fill: { opacity: [0.25, 1] },
                            plotOptions: { bar: { borderRadius: 4, columnWidth: '35%' } },
                            colors: ['#00ab55', '#4361ee'],
                        }}
                    />
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Tenants by status</h5>
                    {statuses.length ? (
                        <Chart
                            type="donut"
                            height={300}
                            series={statuses.map((s) => stats.by_status[s])}
                            options={{ labels: statuses.map(titleCase), colors: statuses.map((s) => statusColors[s]), legend: { position: 'bottom' } }}
                        />
                    ) : (
                        <EmptyState title="No tenants yet" />
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Expiring soon</h5>
                        <Link href="/saas/tenants" className="text-sm font-bold text-primary hover:underline">
                            All tenants
                        </Link>
                    </div>
                    {expiring.length ? (
                        <ul className="space-y-3">
                            {expiring.map((t) => (
                                <li key={t.id} className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link href={`/saas/tenants/${t.id}`} className="block truncate font-semibold hover:text-primary">
                                            {t.name}
                                        </Link>
                                        <div className="text-xs text-white-dark">
                                            {t.plan ?? '—'} · ends {date(t.ends_at)}
                                        </div>
                                    </div>
                                    <StatusBadge status={t.status} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-white-dark">No trials or subscriptions expiring in the next 30 days.</p>
                    )}
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Newest tenants</h5>
                    <ul className="space-y-3">
                        {recentTenants.map((t) => (
                            <li key={t.id} className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <Link href={`/saas/tenants/${t.id}`} className="block truncate font-semibold hover:text-primary">
                                        {t.name}
                                    </Link>
                                    <div className="text-xs text-white-dark">
                                        {t.plan ?? '—'} · {t.schools_count} school{t.schools_count === 1 ? '' : 's'} · {date(t.created_at)}
                                    </div>
                                </div>
                                <StatusBadge status={t.status} />
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="panel">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Open support tickets</h5>
                        <Link href="/saas/tickets" className="text-sm font-bold text-primary hover:underline">
                            View all
                        </Link>
                    </div>
                    {recentTickets.length ? (
                        <ul className="space-y-3">
                            {recentTickets.map((t) => (
                                <li key={t.id}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-semibold">{t.subject}</span>
                                        <StatusBadge status={t.priority} tone={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warning' : 'info'} />
                                    </div>
                                    <div className="text-xs text-white-dark">
                                        {t.tenant} · {dateTime(t.created_at)}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-white-dark">All caught up — no open tickets.</p>
                    )}
                </div>
            </div>
        </>
    );
}
