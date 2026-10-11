import { Link, usePage } from '@inertiajs/react';
import { CalendarDays, Download, HandCoins, PiggyBank, Plus, Receipt, Wallet } from 'lucide-react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import { GradientStatCard } from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cleanQuery, cn, compact, date, money, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { MethodBadge, methodMeta } from '../_components/shared';

type Row = {
    id: number;
    receipt_no: string;
    payment_date: string;
    student_id: number;
    student: string | null;
    photo_url: string | null;
    admission_no: string | null;
    class: string | null;
    amount: string;
    unallocated: string;
    method: string;
    reference: string | null;
    payer_name: string | null;
    account: string | null;
    received_by: string | null;
    status: string;
};

type Props = {
    payments: Paginated<Row>;
    filters: { search: string; method: string; status: string; from: string; to: string };
    stats: { count: number; total: string; credit: string; today: string; month: string; voided: number };
    byMethod: { method: string; count: number; total: string }[];
    monthly: { month: string; total: number }[];
    methods: Option[];
};

export default function PaymentsIndex({ payments, filters: initial, stats, byMethod, monthly, methods }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const methodTotal = byMethod.reduce((s, m) => s + Number(m.total), 0);

    const columns: Column<Row>[] = [
        {
            key: 'receipt',
            header: 'Receipt',
            render: (p) => (
                <div>
                    <Link href={`/fees/payments/${p.id}`} className={cn('font-bold hover:underline', p.status === 'void' ? 'text-white-dark line-through' : 'text-primary')}>
                        {p.receipt_no}
                    </Link>
                    <div className="text-xs text-white-dark">{date(p.payment_date)}</div>
                </div>
            ),
        },
        {
            key: 'student',
            header: 'Student',
            render: (p) => (
                <div className="flex items-center gap-3">
                    <Avatar name={p.student} src={p.photo_url} />
                    <div>
                        <Link href={`/fees/statements/${p.student_id}`} className="font-semibold text-black hover:text-primary dark:text-white-light">
                            {p.student}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {p.admission_no} · {p.class ?? '—'}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'method',
            header: 'Method',
            render: (p) => (
                <div>
                    <MethodBadge method={p.method} />
                    {p.reference && <div className="mt-0.5 font-mono text-xs text-white-dark">{p.reference}</div>}
                </div>
            ),
        },
        { key: 'payer', header: 'Paid by', render: (p) => p.payer_name ?? '—' },
        { key: 'account', header: 'Deposited to', className: 'text-xs', render: (p) => p.account ?? '—' },
        {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (p) => (
                <div>
                    <div className={cn('font-bold', p.status === 'void' ? 'text-white-dark line-through' : 'text-success')}>{money(p.amount, cur)}</div>
                    {Number(p.unallocated) > 0 && <div className="text-xs text-info">{money(p.unallocated, cur)} credit</div>}
                </div>
            ),
        },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
        { key: 'actions', header: '', align: 'right', render: (p) => <RowActions view={`/fees/payments/${p.id}`} /> },
    ];

    return (
        <>
            <PageHeader
                title="Fee Receipts"
                subtitle="Payments received from students and guardians, posted to cash, bank and mobile money."
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Receipts' }]}
                actions={
                    <>
                        <a href={`/fees/payments/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        {can('fees.manage') && (
                            <Link href="/fees/payments/create" className="btn btn-primary">
                                <Plus className="h-4 w-4" /> Collect payment
                            </Link>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <GradientStatCard title="Collected (filtered)" value={money(stats.total, cur)} icon={Wallet} color="blue" footer={`${num(stats.count)} posted receipts`} />
                <GradientStatCard title="Today" value={money(stats.today, cur)} icon={HandCoins} color="success" footer="Posted receipts dated today" />
                <GradientStatCard title="This Month" value={money(stats.month, cur)} icon={CalendarDays} color="violet" footer={`${stats.voided} voided receipts on record`} />
                <GradientStatCard title="Unapplied Credit" value={money(stats.credit, cur)} icon={PiggyBank} color="cyan" footer="Overpayments held on account" />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold dark:text-white-light">Monthly Collections</h5>
                        <span className="text-xs text-white-dark">Last 12 months · {cur}</span>
                    </div>
                    <Chart
                        type="bar"
                        height={300}
                        series={[{ name: 'Collections', data: monthly.map((m) => m.total) }]}
                        options={{
                            xaxis: { categories: monthly.map((m) => m.month), axisBorder: { show: false }, axisTicks: { show: false } },
                            yaxis: { labels: { formatter: (v: number) => compact(v) } },
                            colors: ['#4361ee'],
                            plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } },
                            fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', gradientToColors: ['#805dca'], stops: [0, 100] } },
                            tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                        }}
                    />
                </div>
                <div className="panel">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold dark:text-white-light">Collections by Method</h5>
                        <Receipt className="h-5 w-5 text-white-dark" />
                    </div>
                    {byMethod.length === 0 ? (
                        <EmptyState title="No receipts yet" />
                    ) : (
                        <>
                            <Chart
                                type="donut"
                                height={260}
                                series={byMethod.map((m) => Number(m.total))}
                                options={{
                                    labels: byMethod.map((m) => methodMeta[m.method]?.label ?? m.method),
                                    colors: byMethod.map((m) => methodMeta[m.method]?.color ?? '#3b3f5c'),
                                    legend: { show: false },
                                    stroke: { show: false },
                                    tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                                    plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total', formatter: () => compact(methodTotal) } } } } },
                                }}
                            />
                            <div className="mt-2 space-y-2">
                                {byMethod.map((m) => (
                                    <div key={m.method} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: methodMeta[m.method]?.color ?? '#3b3f5c' }} />
                                            {methodMeta[m.method]?.label ?? m.method}
                                            <span className="text-xs text-white-dark">({num(m.count)})</span>
                                        </span>
                                        <span className="font-semibold">
                                            {money(m.total, cur)} <span className="text-xs text-white-dark">{methodTotal ? Math.round((Number(m.total) / methodTotal) * 100) : 0}%</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="panel">
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Receipt, reference, payer or student…" />
                    <FilterSelect value={filters.method} onChange={(v) => setFilter('method', v)} options={methods.map((m) => ({ value: m.value, label: methodMeta[String(m.value)]?.label ?? m.label }))} placeholder="All methods" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'posted', label: 'Posted' },
                            { value: 'void', label: 'Void' },
                        ]}
                        placeholder="Any status"
                    />
                    <div className="flex items-center gap-2">
                        <input type="date" className="form-input w-full sm:w-40" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} title="From date" />
                        <span className="text-white-dark">–</span>
                        <input type="date" className="form-input w-full sm:w-40" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} title="To date" />
                    </div>
                </FilterBar>
                <DataTable columns={columns} paginated={payments} empty="No receipts found" emptyDescription="Try a different date range or collect a new payment." />
            </div>
        </>
    );
}
