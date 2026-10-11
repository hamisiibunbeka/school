import { Download } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import PageHeader from '@/components/ui/page-header';
import { cn, compact, exportCsv, money } from '@/lib/utils';
import { Amt, CheckBadge, DateField, ReportHeader, SectionRow, go, periodLabel, periodPresets, type Meta } from './_components/report';

type Line = { id: number; code: string; name: string; amount: string };
type Activity = { receipts: Line[]; payments: Line[]; total_receipts: string; total_payments: string; net: string };
type Props = {
    filters: { from: string; to: string };
    report: {
        activities: Record<'operating' | 'investing' | 'financing', Activity>;
        opening: string;
        net_movement: string;
        closing: string;
        computed_closing: string;
        difference: string;
        reconciled: boolean;
        cash_accounts: { id: number; code: string; name: string; opening: string; closing: string; movement: string }[];
    };
    meta: Meta;
};

const ACTIVITIES = [
    { key: 'operating', title: 'Cash flows from operating activities', tone: 'primary' },
    { key: 'investing', title: 'Cash flows from investing activities', tone: 'warning' },
    { key: 'financing', title: 'Cash flows from financing activities', tone: 'secondary' },
] as const;

function receiptLabel(l: Line) {
    return `Receipts — ${l.name}`;
}
function paymentLabel(l: Line) {
    return `Payments — ${l.name}`;
}

export default function CashFlow({ filters, report, meta }: Props) {
    const [q, setQ] = useState(filters);
    const period = periodLabel(filters.from, filters.to);

    const exportRows = () => {
        const rows: string[][] = [['Cash Flow Statement (direct method)', period], []];
        ACTIVITIES.forEach((a) => {
            const act = report.activities[a.key];
            rows.push([a.title]);
            act.receipts.forEach((l) => rows.push(['', receiptLabel(l), l.amount]));
            act.payments.forEach((l) => rows.push(['', paymentLabel(l), `-${l.amount}`]));
            rows.push(['', `Net cash from ${a.key} activities`, act.net], []);
        });
        rows.push(['', 'Net increase/(decrease) in cash', report.net_movement], ['', 'Opening cash & bank', report.opening], ['', 'Closing cash & bank', report.closing]);
        exportCsv(`cash-flow-${filters.from}-${filters.to}`, rows);
    };

    return (
        <>
            <PageHeader
                title="Cash Flow Statement"
                subtitle="Direct method — cash receipts and payments through cash, bank and mobile-money accounts."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Cash Flow' }]}
                actions={
                    <>
                        <button type="button" className="btn btn-outline-primary" onClick={exportRows}>
                            <Download className="h-4 w-4" /> CSV
                        </button>
                        <PrintButton />
                    </>
                }
            />

            <div className="panel no-print mb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                    <DateField label="From" value={q.from} onChange={(v) => setQ({ ...q, from: v })} />
                    <DateField label="To" value={q.to} onChange={(v) => setQ({ ...q, to: v })} />
                    <button type="button" className="btn btn-primary" onClick={() => go('/accounting/cash-flow', q)}>
                        Run report
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {periodPresets().map((p) => (
                        <button key={p.label} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => go('/accounting/cash-flow', { from: p.from, to: p.to })}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <ReportHeader title="Cash Flow Statement" period={period} meta={meta}>
                        <CheckBadge ok={report.reconciled} okText="Reconciled to cash & bank ✓" failText={`Unreconciled ${report.difference}`} />
                    </ReportHeader>
                    <div className="table-responsive">
                        <table className="table table-compact">
                            <tbody>
                                {ACTIVITIES.map((a) => {
                                    const act = report.activities[a.key];
                                    return [
                                        <SectionRow key={`h-${a.key}`} title={a.title} cols={2} tone={a.tone} />,
                                        ...act.receipts.map((l) => (
                                            <tr key={`${a.key}-r-${l.id}`}>
                                                <td className="ps-8!">{receiptLabel(l)}</td>
                                                <td className="text-end!">
                                                    <Amt value={l.amount} />
                                                </td>
                                            </tr>
                                        )),
                                        ...act.payments.map((l) => (
                                            <tr key={`${a.key}-p-${l.id}`}>
                                                <td className="ps-8!">{paymentLabel(l)}</td>
                                                <td className="text-end!">
                                                    <Amt value={-Number(l.amount)} />
                                                </td>
                                            </tr>
                                        )),
                                        act.receipts.length + act.payments.length === 0 ? (
                                            <tr key={`${a.key}-none`}>
                                                <td className="ps-8! text-white-dark italic">No movements</td>
                                                <td />
                                            </tr>
                                        ) : null,
                                        <tr key={`${a.key}-t`} className="border-t border-black/30 bg-[#fbfbfb] dark:border-white/20 dark:bg-[#121c2c]">
                                            <td className="font-bold">Net cash from {a.key} activities</td>
                                            <td className="text-end!">
                                                <Amt value={act.net} bold zero />
                                            </td>
                                        </tr>,
                                    ];
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-black/50 dark:border-white/30">
                                    <td className="font-extrabold">Net increase / (decrease) in cash and cash equivalents</td>
                                    <td className="text-end!">
                                        <Amt value={report.net_movement} bold zero />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Cash and cash equivalents at beginning of period</td>
                                    <td className="text-end!">
                                        <Amt value={report.opening} zero />
                                    </td>
                                </tr>
                                <tr className="border-y-2 border-black/50 text-base dark:border-white/30">
                                    <td className="font-extrabold uppercase">Cash and cash equivalents at end of period</td>
                                    <td className="text-end! underline decoration-double">
                                        <Amt value={report.computed_closing} bold zero />
                                    </td>
                                </tr>
                                <tr>
                                    <td className="text-xs text-white-dark">Per ledger (cash, bank & mobile money balances)</td>
                                    <td className={cn('text-end! text-xs', report.reconciled ? 'text-success' : 'text-danger')}>
                                        <Amt value={report.closing} zero />
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="mt-3 text-xs text-white-dark">
                        Each journal touching cash/bank is classified by its counter-account: fixed assets → investing; capital, equity and long-term loans → financing; everything else → operating.
                        Opening-balance journals are treated as balances brought forward.
                    </p>
                </div>

                <div className="space-y-6">
                    <div className="panel no-print">
                        <h6 className="mb-2 text-sm font-bold text-black dark:text-white-light">Net cash by activity</h6>
                        <Chart
                            type="bar"
                            height={240}
                            series={[{ name: 'Net cash', data: ACTIVITIES.map((a) => Number(report.activities[a.key].net)) }]}
                            options={{
                                xaxis: { categories: ['Operating', 'Investing', 'Financing'] },
                                plotOptions: { bar: { borderRadius: 5, columnWidth: '45%', distributed: true } },
                                colors: ['#4361ee', '#e2a03f', '#805dca'],
                                legend: { show: false },
                                yaxis: { labels: { formatter: (v: number) => compact(v) } },
                                tooltip: { y: { formatter: (v: number) => money(v, meta.currency) } },
                            }}
                        />
                    </div>
                    <div className="panel">
                        <h6 className="mb-3 text-sm font-bold text-black dark:text-white-light">Cash & bank accounts</h6>
                        <div className="table-responsive">
                            <table className="table table-compact">
                                <thead>
                                    <tr>
                                        <th>Account</th>
                                        <th className="text-end!">Opening</th>
                                        <th className="text-end!">Closing</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.cash_accounts.map((c) => (
                                        <tr key={c.id}>
                                            <td className="text-xs">
                                                <span className="font-mono">{c.code}</span> {c.name}
                                            </td>
                                            <td className="text-end! text-xs">
                                                <Amt value={c.opening} zero />
                                            </td>
                                            <td className="text-end! text-xs">
                                                <Amt value={c.closing} zero bold />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
