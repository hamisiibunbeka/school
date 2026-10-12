import { Link, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, Banknote, CalendarPlus, FileClock, Landmark, LoaderCircle, Receipt, Settings2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import { Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { GradientStatCard } from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { compact, date, money, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Run = {
    id: number;
    period: string;
    period_label: string;
    payment_date: string | null;
    payslips_count: number;
    total_gross: string;
    total_deductions: string;
    total_net: string;
    total_employer: string;
    status: string;
    creator: string | null;
    approver: string | null;
};

type Props = {
    runs: Paginated<Run>;
    filters: { year: string; status: string };
    years: Option[];
    stats: {
        ytd_gross: string;
        ytd_net: string;
        ytd_paye: string;
        ytd_employer: string;
        awaiting: number;
        unpaid: number;
        headcount: number;
        last: { id: number; period_label: string; status: string; total_net: string } | null;
    };
    trend: { period: string; gross: number; net: number; employer: number }[];
    nextPeriod: string;
    notice: string;
};

export default function PayrollIndex({ runs, filters: initial, years, stats, trend, nextPeriod, notice }: Props) {
    const can = useCan();
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const { filters, setFilter } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const form = useForm({ period: nextPeriod, payment_date: `${nextPeriod}-25`, notes: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/payroll', { onSuccess: () => setOpen(false) });
    };

    const columns: Column<Run>[] = [
        {
            key: 'period',
            header: 'Period',
            render: (r) => (
                <div>
                    <Link href={`/payroll/${r.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                        {r.period_label}
                    </Link>
                    <div className="text-xs text-white-dark">Pay date {date(r.payment_date)}</div>
                </div>
            ),
        },
        { key: 'payslips_count', header: 'Staff', align: 'center', render: (r) => num(r.payslips_count) },
        { key: 'total_gross', header: 'Gross', align: 'right', render: (r) => money(r.total_gross, '') },
        { key: 'total_deductions', header: 'Deductions', align: 'right', render: (r) => <span className="text-danger">{money(r.total_deductions, '')}</span> },
        { key: 'total_net', header: 'Net pay', align: 'right', render: (r) => <span className="font-bold text-success">{money(r.total_net, '')}</span> },
        { key: 'total_employer', header: 'Employer cost', align: 'right', render: (r) => money(r.total_employer, '') },
        {
            key: 'status',
            header: 'Status',
            render: (r) => (
                <div>
                    <StatusBadge status={r.status} label={r.status === 'draft' ? 'Draft · review' : undefined} />
                    <div className="mt-1 text-[11px] text-white-dark">
                        {r.creator && `Prepared: ${r.creator}`}
                        {r.approver && <div>Approved: {r.approver}</div>}
                    </div>
                </div>
            ),
        },
        { key: 'actions', header: '', align: 'right', render: (r) => <RowActions view={`/payroll/${r.id}`} destroy={r.status === 'draft' && can('payroll.manage') ? `/payroll/${r.id}` : undefined} label="draft payroll" /> },
    ];

    return (
        <>
            <PageHeader
                title="Payroll"
                subtitle="Monthly payroll runs: calculate, review, approve, post to the ledger and pay."
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Payroll' }]}
                actions={
                    <>
                        <Link href="/payroll/components" className="btn btn-outline-primary">
                            <Settings2 className="h-4 w-4" /> Salary components
                        </Link>
                        {can('payroll.manage') && (
                            <button className="btn btn-primary" onClick={() => setOpen(true)}>
                                <CalendarPlus className="h-4 w-4" /> New payroll run
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <GradientStatCard title={`Gross pay ${new Date().getFullYear()} YTD`} value={money(stats.ytd_gross, cur)} icon={Banknote} color="primary" footer={`Net paid ${money(stats.ytd_net, cur)}`} />
                <GradientStatCard title="PAYE withheld YTD" value={money(stats.ytd_paye, cur)} icon={Receipt} color="violet" footer="Remit to TRA by the 7th" />
                <GradientStatCard title="Employer contributions YTD" value={money(stats.ytd_employer, cur)} icon={Landmark} color="cyan" footer="NSSF · WCF · SDL" />
                <GradientStatCard
                    title="Awaiting action"
                    value={`${stats.awaiting} draft · ${stats.unpaid} unpaid`}
                    icon={FileClock}
                    color={stats.awaiting + stats.unpaid > 0 ? 'warning' : 'success'}
                    footer={
                        <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> {stats.headcount} staff on payroll
                        </span>
                    }
                />
            </div>

            <div className="mb-6 flex items-start gap-3 rounded-md border border-warning/40 bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <FilterBar>
                        <FilterSelect value={filters.year} onChange={(v) => setFilter('year', v)} options={years} placeholder="All years" />
                        <FilterSelect
                            value={filters.status}
                            onChange={(v) => setFilter('status', v)}
                            options={[
                                { value: 'draft', label: 'Draft' },
                                { value: 'approved', label: 'Approved' },
                                { value: 'paid', label: 'Paid' },
                            ]}
                            placeholder="Any status"
                        />
                    </FilterBar>
                    <DataTable columns={columns} paginated={runs} empty="No payroll runs yet" emptyDescription="Create the first payroll run for a month." />
                </div>
                <div className="panel">
                    <h5 className="mb-1 text-lg font-bold">Payroll cost this year</h5>
                    <p className="mb-4 text-xs text-white-dark">Approved and paid runs</p>
                    {trend.length ? (
                        <Chart
                            type="bar"
                            height={320}
                            series={[
                                { name: 'Net pay', data: trend.map((t) => t.net) },
                                { name: 'Statutory & deductions', data: trend.map((t) => t.gross - t.net) },
                                { name: 'Employer cost', data: trend.map((t) => t.employer) },
                            ]}
                            options={{
                                chart: { stacked: true },
                                xaxis: { categories: trend.map((t) => date(`${t.period}-01`, { month: 'short' })) },
                                yaxis: { labels: { formatter: (v: number) => compact(v) } },
                                colors: ['#00ab55', '#e7515a', '#2196f3'],
                                legend: { position: 'bottom' },
                            }}
                        />
                    ) : (
                        <p className="text-sm text-white-dark">No approved payroll yet this year.</p>
                    )}
                    {stats.last && (
                        <Link href={`/payroll/${stats.last.id}`} className="mt-4 flex items-center justify-between rounded-md bg-primary-light p-3 text-sm dark:bg-primary-dark-light">
                            <span>
                                Latest: <strong>{stats.last.period_label}</strong>
                            </span>
                            <StatusBadge status={stats.last.status} />
                        </Link>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="New payroll run">
                <form onSubmit={submit} className="space-y-4">
                    <p className="text-sm text-white-dark">
                        Payslips are calculated for all active staff from their basic salary, assigned components, approved unpaid leave and the current statutory rules. The run stays in <strong>draft</strong> until a second
                        authorised user approves it.
                    </p>
                    <Input
                        label="Payroll month"
                        type="month"
                        required
                        value={form.data.period}
                        onChange={(e) => form.setData((d) => ({ ...d, period: e.target.value, payment_date: e.target.value ? `${e.target.value}-25` : d.payment_date }))}
                        error={form.errors.period}
                    />
                    <Input label="Planned payment date" type="date" value={form.data.payment_date} onChange={(e) => form.setData('payment_date', e.target.value)} error={form.errors.payment_date} />
                    <Textarea label="Notes" value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={form.errors.notes} rows={2} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Calculate payroll
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
