import { Link, router, usePage } from '@inertiajs/react';
import { AlarmClock, Download, MessageSquareText, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { IconLink } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import { GradientStatCard } from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cleanQuery, cn, compact, date, money, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = {
    id: number;
    student_id: number;
    full_name: string;
    admission_no: string;
    class: string;
    residence_type: string;
    invoices: number;
    oldest_due: string | null;
    days: number;
    current: string;
    d30: string;
    d60: string;
    d90: string;
    d90p: string;
    total: string;
    guardian: { name: string; phone: string | null } | null;
    last_reminder: string | null;
};

type Props = {
    rows: Paginated<Row>;
    filters: { search: string; class: string; stream: string; bucket: string; residence: string };
    summary: { students: number; total: string; buckets: { key: string; label: string; total: string }[] };
    byClass: { class: string; students: number; total: number }[];
    classes: (Option & { streams: Option[] })[];
    buckets: Option[];
    asAt: string;
};

const bucketColors = ['#2196f3', '#e2a03f', '#f97316', '#e7515a', '#9f1239'];

export default function Arrears({ rows, filters: initial, summary, byClass, classes, buckets, asAt }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [selected, setSelected] = useState<number[]>([]);
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];
    const overdue = summary.buckets.filter((b) => b.key !== 'current').reduce((s, b) => s + Number(b.total), 0);
    const severe = summary.buckets.filter((b) => b.key === 'd90' || b.key === 'd90p').reduce((s, b) => s + Number(b.total), 0);

    const pageIds = rows.data.map((r) => r.student_id);
    const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

    const remind = async () => {
        const count = selected.length || summary.students;
        const { confirmed } = await confirm({
            title: `Send reminder SMS to ${num(count)} guardian(s)?`,
            text: selected.length
                ? 'Primary guardians of the selected students will receive a short balance reminder.'
                : 'No students selected — every student matching the current filters will be reminded. Guardians already reminded today are skipped.',
            confirmText: 'Queue SMS',
        });
        if (!confirmed) return;
        router.post('/fees/arrears/remind', { student_ids: selected, filters: cleanQuery(filters) }, { preserveScroll: true, onSuccess: () => setSelected([]) });
    };

    const amountCell = (v: string, tone?: string) => (Number(v) > 0 ? <span className={cn('font-semibold', tone)}>{num(v)}</span> : <span className="text-white-dark">—</span>);

    const columns: Column<Row>[] = [
        {
            key: 'select',
            header: (
                <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={allOnPage}
                    onChange={() => setSelected(allOnPage ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])])}
                />
            ),
            render: (r) => (
                <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={selected.includes(r.student_id)}
                    onChange={() => setSelected(selected.includes(r.student_id) ? selected.filter((x) => x !== r.student_id) : [...selected, r.student_id])}
                />
            ),
        },
        {
            key: 'student',
            header: 'Student',
            render: (r) => (
                <div>
                    <Link href={`/fees/statements/${r.student_id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                        {r.full_name}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {r.admission_no} · {r.class || '—'} · {titleCase(r.residence_type)}
                    </div>
                </div>
            ),
        },
        {
            key: 'guardian',
            header: 'Primary guardian',
            render: (r) => (
                <div className="text-xs">
                    <div className="font-semibold">{r.guardian?.name ?? '—'}</div>
                    <div className="text-white-dark">{r.guardian?.phone ?? 'No phone'}</div>
                    {r.last_reminder && <div className="text-info">Reminded {date(r.last_reminder)}</div>}
                </div>
            ),
        },
        { key: 'days', header: 'Days overdue', align: 'center', render: (r) => <span className={cn('badge', r.days > 90 ? 'badge-soft-danger' : r.days > 30 ? 'badge-soft-warning' : r.days > 0 ? 'badge-soft-info' : 'badge-soft-success')}>{r.days > 0 ? r.days : 'Not due'}</span> },
        { key: 'current', header: 'Not due', align: 'right', render: (r) => amountCell(r.current) },
        { key: 'd30', header: '1–30', align: 'right', render: (r) => amountCell(r.d30, 'text-warning') },
        { key: 'd60', header: '31–60', align: 'right', render: (r) => amountCell(r.d60, 'text-warning') },
        { key: 'd90', header: '61–90', align: 'right', render: (r) => amountCell(r.d90, 'text-danger') },
        { key: 'd90p', header: '90+', align: 'right', render: (r) => amountCell(r.d90p, 'text-danger') },
        { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-extrabold text-danger">{money(r.total, cur)}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (can('fees.manage') ? <IconLink href={`/fees/payments/create?student=${r.student_id}`} icon={Wallet} title="Collect payment" className="text-success" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Arrears & Aging"
                subtitle={`Outstanding student balances by age past the due date, as at ${date(asAt)}.`}
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Arrears' }]}
                actions={
                    <>
                        <a href={`/fees/arrears/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        {can('fees.manage') && (
                            <button className="btn btn-warning" onClick={remind} disabled={summary.students === 0}>
                                <MessageSquareText className="h-4 w-4" /> Send reminder{selected.length ? ` (${selected.length})` : 's'}
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <GradientStatCard title="Total Outstanding" value={money(summary.total, cur)} icon={Wallet} color="fuchsia" footer={`${num(summary.students)} students with a balance`} />
                <GradientStatCard title="Overdue" value={money(overdue, cur)} icon={AlarmClock} color="warning" footer={`${Number(summary.total) ? Math.round((overdue / Number(summary.total)) * 100) : 0}% of the outstanding balance`} />
                <GradientStatCard title="Over 60 Days" value={money(severe, cur)} icon={AlarmClock} color="danger" footer="Priority follow-up" />
                <GradientStatCard title="Debtors" value={num(summary.students)} icon={Users} color="primary" footer={`Avg ${money(summary.students ? Number(summary.total) / summary.students : 0, cur)} each`} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold dark:text-white-light">Aging Buckets</h5>
                        <span className="text-xs text-white-dark">{cur} by days past due</span>
                    </div>
                    <Chart
                        type="bar"
                        height={280}
                        series={[{ name: 'Outstanding', data: summary.buckets.map((b) => Number(b.total)) }]}
                        options={{
                            xaxis: { categories: summary.buckets.map((b) => b.label), axisBorder: { show: false }, axisTicks: { show: false } },
                            yaxis: { labels: { formatter: (v: number) => compact(v) } },
                            colors: bucketColors,
                            plotOptions: { bar: { distributed: true, borderRadius: 6, columnWidth: '50%' } },
                            legend: { show: false },
                            dataLabels: { enabled: true, formatter: (v: number) => compact(v), offsetY: -20, style: { fontSize: '11px', colors: ['#888ea8'] } },
                            tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                        }}
                    />
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold dark:text-white-light">Outstanding by Class</h5>
                    <div className="space-y-4">
                        {byClass.map((c) => {
                            const max = Math.max(...byClass.map((x) => x.total), 1);
                            return (
                                <div key={c.class}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <span className="font-semibold">{c.class}</span>
                                        <span>
                                            {money(c.total, cur)} <span className="text-xs text-white-dark">· {c.students}</span>
                                        </span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div className="h-full rounded-full bg-gradient-to-r from-[#e7515a] to-[#e2a03f]" style={{ width: `${(c.total / max) * 100}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        {byClass.length === 0 && <p className="text-sm text-white-dark">No arrears — every account is settled.</p>}
                    </div>
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student or adm. no…" />
                    <FilterSelect
                        value={filters.class}
                        onChange={(v) => {
                            setFilter('class', v);
                            setFilter('stream', '');
                        }}
                        options={classes}
                        placeholder="All classes"
                    />
                    {streams.length > 0 && <FilterSelect value={filters.stream} onChange={(v) => setFilter('stream', v)} options={streams} placeholder="All streams" />}
                    <FilterSelect
                        value={filters.residence}
                        onChange={(v) => setFilter('residence', v)}
                        options={[
                            { value: 'day', label: 'Day' },
                            { value: 'boarding', label: 'Boarding' },
                        ]}
                        placeholder="Day & boarding"
                    />
                    <FilterSelect value={filters.bucket} onChange={(v) => setFilter('bucket', v)} options={buckets} placeholder="Any age" />
                </FilterBar>
                {selected.length > 0 && (
                    <div className="mb-3 flex items-center justify-between rounded bg-primary-light px-4 py-2 text-sm text-primary dark:bg-primary-dark-light">
                        <span>{selected.length} student(s) selected for reminders</span>
                        <button className="font-semibold hover:underline" onClick={() => setSelected([])}>
                            Clear selection
                        </button>
                    </div>
                )}
                <DataTable columns={columns} paginated={rows} compact empty="No arrears found" emptyDescription="All matching student accounts are fully settled." />
            </div>
        </>
    );
}
