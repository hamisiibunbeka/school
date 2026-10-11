import { Link } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PrintButton } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { cn, compact, exportCsv, money } from '@/lib/utils';
import { Amt, DateField, ReportHeader, SectionRow, go, pct, periodLabel, periodPresets, type Meta } from './_components/report';

type Line = { id: number; code: string; name: string; sub_type: string | null; amount: string };
type Section = { rows: Line[]; total: string };
type Statement = {
    income: Section;
    direct: Section;
    operating: Section;
    gross: string;
    net: string;
    trading: { sales: Line[]; cost: Line[]; sales_total: string; cost_total: string; gross_profit: string } | null;
};
type Props = {
    filters: { from: string; to: string; compare: string; cmp_from: string; cmp_to: string };
    report: Statement;
    comparative: Statement | null;
    meta: Meta;
};

/** Merge current and comparative lines by account. */
function merge(cur: Line[], cmp: Line[] | undefined) {
    const map = new Map<number, { line: Line; cur: string; cmp: string }>();
    cur.forEach((l) => map.set(l.id, { line: l, cur: l.amount, cmp: '0' }));
    (cmp ?? []).forEach((l) => {
        const e = map.get(l.id);
        if (e) e.cmp = l.amount;
        else map.set(l.id, { line: l, cur: '0', cmp: l.amount });
    });
    return [...map.values()].sort((a, b) => a.line.code.localeCompare(b.line.code));
}

export default function IncomeStatement({ filters, report, comparative, meta }: Props) {
    const [q, setQ] = useState(filters);
    const cmp = !!comparative;
    const cols = cmp ? 5 : 3;
    const base = report.income.total;
    const cmpBase = comparative?.income.total ?? '0';
    const period = periodLabel(filters.from, filters.to);
    const cmpPeriod = cmp ? periodLabel(filters.cmp_from, filters.cmp_to) : '';

    const lineRow = (key: string | number, label: ReactNode, cur: string, prev?: string, opts: { bold?: boolean; indent?: boolean; total?: boolean; neg?: boolean } = {}) => (
        <tr key={key} className={cn(opts.total && 'border-t border-black/30 bg-[#fbfbfb] dark:border-white/20 dark:bg-[#121c2c]')}>
            <td className={cn(opts.indent && 'ps-8!', opts.bold && 'font-extrabold uppercase')}>{label}</td>
            <td className="text-end!">
                <Amt value={opts.neg ? -Number(cur) : cur} bold={opts.bold} zero={opts.total} />
            </td>
            <td className="text-end! text-xs text-white-dark">{pct(cur, base)}</td>
            {cmp && (
                <>
                    <td className="text-end! text-white-dark">
                        <Amt value={opts.neg ? -Number(prev ?? 0) : (prev ?? 0)} bold={opts.bold} zero={opts.total} />
                    </td>
                    <td className="text-end! text-xs text-white-dark">{pct(prev ?? 0, cmpBase)}</td>
                </>
            )}
        </tr>
    );

    const section = (title: string, cur: Section, prev: Section | undefined, totalLabel: string, tone: 'success' | 'warning' | 'danger') => [
        <SectionRow key={`h-${title}`} title={title} cols={cols} tone={tone} />,
        ...merge(cur.rows, prev?.rows).map((r) =>
            lineRow(
                `${title}-${r.line.id}`,
                <Link href={`/accounting/ledger?account=${r.line.id}&from=${filters.from}&to=${filters.to}`} className="hover:text-primary hover:underline">
                    <span className="me-2 font-mono text-xs text-white-dark">{r.line.code}</span>
                    {r.line.name}
                </Link>,
                r.cur,
                r.cmp,
                { indent: true },
            ),
        ),
        lineRow(`t-${title}`, totalLabel, cur.total, prev?.total, { bold: true, total: true }),
    ];

    const exportRows = () => {
        const rows: (string | number)[][] = [['Income Statement', period], [], ['Section', 'Code', 'Account', 'Amount', ...(cmp ? [cmpPeriod] : [])]];
        const add = (name: string, s: Section, p?: Section) => {
            merge(s.rows, p?.rows).forEach((r) => rows.push([name, r.line.code, r.line.name, r.cur, ...(cmp ? [r.cmp] : [])]));
            rows.push([name, '', `Total ${name}`, s.total, ...(cmp ? [p?.total ?? '0'] : [])]);
        };
        add('Income', report.income, comparative?.income);
        add('Direct costs', report.direct, comparative?.direct);
        rows.push(['', '', 'Gross surplus', report.gross, ...(cmp ? [comparative?.gross ?? '0'] : [])]);
        add('Operating expenses', report.operating, comparative?.operating);
        rows.push(['', '', 'Net surplus/(deficit)', report.net, ...(cmp ? [comparative?.net ?? '0'] : [])]);
        exportCsv(`income-statement-${filters.from}-${filters.to}`, rows);
    };

    const net = Number(report.net);

    return (
        <>
            <PageHeader
                title="Income Statement"
                subtitle="Statement of financial performance: income, direct costs and operating expenses for the period."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Income Statement' }]}
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
                    <div className="flex items-center pb-2">
                        <Checkbox label="Comparative period" checked={!!q.compare} onChange={(e) => setQ({ ...q, compare: e.target.checked ? '1' : '', cmp_from: '', cmp_to: '' })} />
                    </div>
                    {q.compare && (
                        <>
                            <DateField label="Compare from" value={q.cmp_from} onChange={(v) => setQ({ ...q, cmp_from: v })} />
                            <DateField label="Compare to" value={q.cmp_to} onChange={(v) => setQ({ ...q, cmp_to: v })} />
                        </>
                    )}
                    <button type="button" className="btn btn-primary" onClick={() => go('/accounting/income-statement', q)}>
                        Run report
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {periodPresets().map((p) => (
                        <button key={p.label} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => go('/accounting/income-statement', { ...q, from: p.from, to: p.to })}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="no-print mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                    ['Total income', report.income.total, 'text-success'],
                    ['Direct costs', report.direct.total, 'text-warning'],
                    ['Operating expenses', report.operating.total, 'text-danger'],
                    [net >= 0 ? 'Net surplus' : 'Net deficit', report.net, net >= 0 ? 'text-primary' : 'text-danger'],
                ].map(([label, value, tone]) => (
                    <div key={label} className="panel">
                        <div className="text-xs font-bold tracking-wide text-white-dark uppercase">{label}</div>
                        <div className={cn('mt-1 text-xl font-extrabold', tone)}>{money(value, meta.currency)}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <ReportHeader title="Income Statement" period={period} meta={meta} />
                    <div className="table-responsive">
                        <table className="table table-compact">
                            <thead>
                                <tr>
                                    <th>Particulars</th>
                                    <th className="text-end!">{cmp ? 'Current' : 'Amount'}</th>
                                    <th className="text-end!">%</th>
                                    {cmp && (
                                        <>
                                            <th className="text-end!">{cmpPeriod}</th>
                                            <th className="text-end!">%</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {section('Income', report.income, comparative?.income, 'Total income', 'success')}
                                {section('Less: Direct costs', report.direct, comparative?.direct, 'Total direct costs', 'warning')}
                                {lineRow('gross', 'Gross surplus', report.gross, comparative?.gross, { bold: true, total: true })}
                                {section('Less: Operating expenses', report.operating, comparative?.operating, 'Total operating expenses', 'danger')}
                            </tbody>
                            <tfoot>
                                <tr className="border-y-2 border-black/50 text-base dark:border-white/30">
                                    <td className="font-extrabold uppercase">Net surplus / (deficit)</td>
                                    <td className="text-end! underline decoration-double">
                                        <Amt value={report.net} bold zero className={net >= 0 ? 'text-success' : ''} />
                                    </td>
                                    <td className="text-end! text-xs">{pct(report.net, base)}</td>
                                    {cmp && (
                                        <>
                                            <td className="text-end! underline decoration-double">
                                                <Amt value={comparative?.net} bold zero />
                                            </td>
                                            <td className="text-end! text-xs">{pct(comparative?.net ?? 0, cmpBase)}</td>
                                        </>
                                    )}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="mt-3 text-xs text-white-dark">Percentages are of total income. Figures derive from posted ledger balances for the period.</p>
                </div>

                <div className="space-y-6">
                    <div className="panel no-print">
                        <h6 className="mb-2 text-sm font-bold text-black dark:text-white-light">Income vs costs</h6>
                        <Chart
                            type="bar"
                            height={260}
                            series={[{ name: 'Amount', data: [Number(report.income.total), Number(report.direct.total), Number(report.operating.total), Number(report.net)] }]}
                            options={{
                                xaxis: { categories: ['Income', 'Direct', 'Operating', 'Net'] },
                                plotOptions: { bar: { borderRadius: 5, columnWidth: '45%', distributed: true } },
                                colors: ['#00ab55', '#e2a03f', '#e7515a', net >= 0 ? '#4361ee' : '#e7515a'],
                                legend: { show: false },
                                yaxis: { labels: { formatter: (v: number) => compact(v) } },
                                tooltip: { y: { formatter: (v: number) => money(v, meta.currency) } },
                            }}
                        />
                    </div>

                    {report.trading && (
                        <div className="panel">
                            <h6 className="mb-1 text-sm font-extrabold tracking-wide text-primary uppercase">Trading Account</h6>
                            <p className="mb-3 text-xs text-white-dark">School shop & uniform store — {period}</p>
                            <table className="table table-compact">
                                <tbody>
                                    {report.trading.sales.map((s) => (
                                        <tr key={s.id}>
                                            <td>{s.name}</td>
                                            <td className="text-end!">
                                                <Amt value={s.amount} />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className="font-bold">Sales</td>
                                        <td className="text-end!">
                                            <Amt value={report.trading.sales_total} bold zero />
                                        </td>
                                    </tr>
                                    {report.trading.cost.map((s) => (
                                        <tr key={s.id}>
                                            <td className="ps-6!">Less: {s.name}</td>
                                            <td className="text-end!">
                                                <Amt value={-Number(s.amount)} />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 border-black/40 dark:border-white/30">
                                        <td className="font-extrabold uppercase">Gross profit</td>
                                        <td className="text-end! underline decoration-double">
                                            <Amt value={report.trading.gross_profit} bold zero />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="text-xs text-white-dark">Gross margin</td>
                                        <td className="text-end! text-xs">{pct(report.trading.gross_profit, report.trading.sales_total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
