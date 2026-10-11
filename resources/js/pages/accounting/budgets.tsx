import { useForm } from '@inertiajs/react';
import { Download, PencilRuler, PiggyBank, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { cn, compact, date, exportCsv, money } from '@/lib/utils';
import type { Option } from '@/types';
import { Amt, ReportHeader, SectionRow, go, showErrors, type Meta } from './_components/report';

type Row = { id: number | null; account_id: number; code: string; name: string; type: 'income' | 'expense'; budget: string; actual: string; variance: string; variance_pct: string | null; utilisation: string | null; notes: string | null };
type Totals = { budget: string; actual: string; variance: string };
type Props = {
    filters: { year: string };
    year: { id: number; name: string; status: string; start_date: string; end_date: string } | null;
    years: Option[];
    report: { rows: Row[]; totals: { income: Totals; expense: Totals } | null };
    accounts: (Option & { type: string })[];
    budgets: Record<string, { amount: string; notes: string | null }>;
    meta: Meta;
};

export default function Budgets({ filters, year, years, report, accounts, budgets, meta }: Props) {
    const can = useCan();
    const [open, setOpen] = useState(false);
    const form = useForm({
        fiscal_year_id: year?.id ?? '',
        items: accounts.map((a) => ({ account_id: a.value, amount: budgets[String(a.value)] ? String(Number(budgets[String(a.value)].amount)) : '', notes: budgets[String(a.value)]?.notes ?? '' })),
    });

    const t = report.totals;
    const netBudget = t ? Number(t.income.budget) - Number(t.expense.budget) : 0;
    const netActual = t ? Number(t.income.actual) - Number(t.expense.actual) : 0;
    const chartRows = report.rows.filter((r) => Number(r.budget) > 0).slice(0, 16);

    const exportRows = () =>
        exportCsv(`budget-vs-actual-${year?.name ?? ''}`, [
            ['Code', 'Account', 'Type', 'Budget', 'Actual', 'Variance (fav/(adv))', 'Variance %'],
            ...report.rows.map((r) => [r.code, r.name, r.type, r.budget, r.actual, r.variance, r.variance_pct ?? '']),
        ]);

    const section = (type: 'income' | 'expense', title: string) => {
        const rows = report.rows.filter((r) => r.type === type);
        const tot = t?.[type];
        return [
            <SectionRow key={`h-${type}`} title={title} cols={7} tone={type === 'income' ? 'success' : 'danger'} />,
            ...rows.map((r) => {
                const used = Number(r.utilisation ?? 0);
                return (
                    <tr key={r.account_id}>
                        <td className="font-mono">{r.code}</td>
                        <td>{r.name}</td>
                        <td className="text-end!">
                            <Amt value={r.budget} zero />
                        </td>
                        <td className="text-end!">
                            <Amt value={r.actual} zero />
                        </td>
                        <td className={cn('text-end!', Number(r.variance) >= 0 ? 'text-success' : 'text-danger')}>
                            <Amt value={r.variance} zero className={Number(r.variance) >= 0 ? 'text-success' : ''} />
                        </td>
                        <td className={cn('text-end! text-xs font-bold', Number(r.variance) >= 0 ? 'text-success' : 'text-danger')}>{r.variance_pct !== null ? `${r.variance_pct}%` : '—'}</td>
                        <td className="w-36">
                            {r.utilisation !== null && (
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div
                                            className={cn('h-1.5 rounded-full', type === 'expense' ? (used > 100 ? 'bg-danger' : used > 85 ? 'bg-warning' : 'bg-success') : used >= 100 ? 'bg-success' : 'bg-primary')}
                                            style={{ width: `${Math.min(used, 100)}%` }}
                                        />
                                    </div>
                                    <span className="w-10 text-end text-[11px] text-white-dark">{Math.round(used)}%</span>
                                </div>
                            )}
                        </td>
                    </tr>
                );
            }),
            tot && (
                <tr key={`t-${type}`} className="border-t border-black/30 bg-[#fbfbfb] font-bold dark:border-white/20 dark:bg-[#121c2c]">
                    <td colSpan={2} className="uppercase">
                        Total {type}
                    </td>
                    <td className="text-end!">
                        <Amt value={tot.budget} bold zero />
                    </td>
                    <td className="text-end!">
                        <Amt value={tot.actual} bold zero />
                    </td>
                    <td className="text-end!">
                        <Amt value={tot.variance} bold zero />
                    </td>
                    <td colSpan={2} />
                </tr>
            ),
        ];
    };

    return (
        <>
            <PageHeader
                title="Budgets"
                subtitle="Annual budgets by income and expense account, with actual-vs-budget variance analysis."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Budgets' }]}
                actions={
                    <>
                        <select className="form-select w-auto" value={filters.year} onChange={(e) => go('/accounting/budgets', { year: e.target.value })}>
                            {years.map((y) => (
                                <option key={y.value} value={y.value}>
                                    {y.label}
                                </option>
                            ))}
                        </select>
                        <button type="button" className="btn btn-outline-primary" onClick={exportRows}>
                            <Download className="h-4 w-4" /> CSV
                        </button>
                        <PrintButton />
                        {can('accounting.manage') && year && year.status !== 'closed' && (
                            <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
                                <PencilRuler className="h-4 w-4" /> Edit budget
                            </button>
                        )}
                    </>
                }
            />

            {!year ? (
                <div className="panel">
                    <EmptyState title="No fiscal year" description="Create a fiscal year first under Accounting → Fiscal Years." />
                </div>
            ) : (
                <>
                    <div className="no-print mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                        <StatCard title="Income budget" value={money(t?.income.budget, meta.currency)} icon={Target} tone="success" hint={`Actual ${money(t?.income.actual, meta.currency)}`} />
                        <StatCard title="Expense budget" value={money(t?.expense.budget, meta.currency)} icon={PiggyBank} tone="danger" hint={`Actual ${money(t?.expense.actual, meta.currency)}`} />
                        <StatCard title="Budgeted surplus" value={money(netBudget, meta.currency)} icon={TrendingUp} tone="primary" />
                        <StatCard title="Actual surplus" value={money(netActual, meta.currency)} icon={netActual >= 0 ? TrendingUp : TrendingDown} tone={netActual >= 0 ? 'info' : 'warning'} />
                    </div>

                    {chartRows.length > 0 && (
                        <div className="panel no-print mb-6">
                            <h6 className="mb-2 text-sm font-bold text-black dark:text-white-light">Budget vs actual — {year.name}</h6>
                            <Chart
                                type="bar"
                                height={340}
                                series={[
                                    { name: 'Budget', data: chartRows.map((r) => Number(r.budget)) },
                                    { name: 'Actual', data: chartRows.map((r) => Number(r.actual)) },
                                ]}
                                options={{
                                    xaxis: { categories: chartRows.map((r) => r.name), labels: { rotate: -40, trim: true, style: { fontSize: '11px' } } },
                                    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
                                    colors: ['#c2d5ff', '#4361ee'],
                                    yaxis: { labels: { formatter: (v: number) => compact(v) } },
                                    tooltip: { y: { formatter: (v: number) => money(v, meta.currency) } },
                                }}
                            />
                        </div>
                    )}

                    <div className="panel">
                        <ReportHeader title={`Budget vs Actual — ${year.name}`} period={`${date(year.start_date)} – ${date(year.end_date)}`} meta={meta}>
                            {year.status === 'closed' && <span className="badge badge-soft-dark">Year closed</span>}
                        </ReportHeader>
                        {report.rows.length === 0 ? (
                            <EmptyState title="No budget yet" description="Use “Edit budget” to set amounts for the main income and expense accounts." />
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-compact">
                                    <thead>
                                        <tr>
                                            <th>Code</th>
                                            <th>Account</th>
                                            <th className="text-end!">Budget</th>
                                            <th className="text-end!">Actual</th>
                                            <th className="text-end!">Variance</th>
                                            <th className="text-end!">Var %</th>
                                            <th>Utilisation</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section('income', 'Income')}
                                        {section('expense', 'Expenditure')}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-white-dark">Positive variances are favourable (income above budget, spending below budget); adverse variances are in brackets.</p>
                    </div>
                </>
            )}

            <Modal open={open} onClose={() => setOpen(false)} title={`Budget — ${year?.name ?? ''}`} size="xl">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post('/accounting/budgets', { preserveScroll: true, onSuccess: () => setOpen(false), onError: showErrors });
                    }}
                    className="space-y-4"
                >
                    <p className="text-xs text-white-dark">Enter the annual amount per account. Leave blank (or 0) to remove a budget line.</p>
                    <div className="max-h-[60vh] overflow-y-auto">
                        <table className="table table-compact">
                            <thead className="sticky top-0 z-10 bg-white dark:bg-[#0e1726]">
                                <tr>
                                    <th>Account</th>
                                    <th className="w-48 text-end!">Annual budget</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(['income', 'expense'] as const).map((type) => [
                                    <SectionRow key={type} title={type === 'income' ? 'Income' : 'Expenditure'} cols={3} tone={type === 'income' ? 'success' : 'danger'} />,
                                    ...form.data.items.map((item, i) => {
                                        const acc = accounts[i];
                                        if (acc.type !== type) return null;
                                        return (
                                            <tr key={item.account_id}>
                                                <td className="text-sm">{acc.label}</td>
                                                <td>
                                                    <input
                                                        className="form-input text-end font-mono"
                                                        inputMode="decimal"
                                                        value={item.amount}
                                                        placeholder="0"
                                                        onChange={(e) =>
                                                            form.setData(
                                                                'items',
                                                                form.data.items.map((it, idx) => (idx === i ? { ...it, amount: e.target.value.replace(/[^0-9.]/g, '') } : it)),
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="form-input"
                                                        value={item.notes}
                                                        onChange={(e) => form.setData('items', form.data.items.map((it, idx) => (idx === i ? { ...it, notes: e.target.value } : it)))}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    }),
                                ])}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save budget
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
