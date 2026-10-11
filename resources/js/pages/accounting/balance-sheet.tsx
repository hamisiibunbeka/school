import { Link } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import { Checkbox } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { cn, date, exportCsv, money } from '@/lib/utils';
import { Amt, CheckBadge, DateField, ReportHeader, SectionRow, go, type Meta } from './_components/report';

type Line = { id: number | null; code: string; name: string; sub_type: string | null; amount: string };
type GroupKey = 'current_assets' | 'non_current_assets' | 'current_liabilities' | 'non_current_liabilities' | 'equity';
type Sheet = {
    groups: Record<GroupKey, Line[]>;
    totals: Record<GroupKey, string>;
    total_assets: string;
    total_liabilities: string;
    total_equity: string;
    total_liabilities_equity: string;
    difference: string;
    balanced: boolean;
    period_start: string;
    period_surplus: string;
};
type Props = { filters: { as_at: string; compare: string; cmp_at: string }; report: Sheet; comparative: Sheet | null; meta: Meta };

export default function BalanceSheet({ filters, report, comparative, meta }: Props) {
    const [q, setQ] = useState(filters);
    const cmp = !!comparative;
    const cols = cmp ? 3 : 2;

    const merged = (key: GroupKey) => {
        const rows = report.groups[key].map((l) => ({ line: l, cur: l.amount, prev: '0' }));
        comparative?.groups[key].forEach((l) => {
            const found = rows.find((r) => (l.id ? r.line.id === l.id : r.line.name === l.name));
            if (found) found.prev = l.amount;
            else rows.push({ line: l, cur: '0', prev: l.amount });
        });
        return rows;
    };

    const group = (key: GroupKey, title: string) => {
        const rows = merged(key);
        if (!rows.length) return null;
        return [
            <tr key={`g-${key}`} className="hover:bg-transparent!">
                <td colSpan={cols} className="pt-3! pb-1! text-sm font-bold text-black dark:text-white-light">
                    {title}
                </td>
            </tr>,
            ...rows.map((r, i) => (
                <tr key={`${key}-${i}`}>
                    <td className="ps-8!">
                        {r.line.id ? (
                            <Link href={`/accounting/ledger?account=${r.line.id}&from=2000-01-01&to=${filters.as_at}`} className="hover:text-primary hover:underline">
                                <span className="me-2 font-mono text-xs text-white-dark">{r.line.code}</span>
                                {r.line.name}
                            </Link>
                        ) : (
                            <span className="italic">{r.line.name}</span>
                        )}
                    </td>
                    <td className="text-end!">
                        <Amt value={r.cur} />
                    </td>
                    {cmp && (
                        <td className="text-end! text-white-dark">
                            <Amt value={r.prev} />
                        </td>
                    )}
                </tr>
            )),
            <tr key={`t-${key}`} className="border-t border-black/20 dark:border-white/20">
                <td className="ps-8! font-bold">Total {title.toLowerCase()}</td>
                <td className="text-end!">
                    <Amt value={report.totals[key]} bold zero />
                </td>
                {cmp && (
                    <td className="text-end!">
                        <Amt value={comparative?.totals[key]} bold zero />
                    </td>
                )}
            </tr>,
        ];
    };

    const grand = (label: string, cur: string, prev?: string) => (
        <tr className="border-y-2 border-black/50 bg-[#fbfbfb] text-base dark:border-white/30 dark:bg-[#121c2c]">
            <td className="font-extrabold uppercase">{label}</td>
            <td className="text-end! underline decoration-double">
                <Amt value={cur} bold zero />
            </td>
            {cmp && (
                <td className="text-end! underline decoration-double">
                    <Amt value={prev} bold zero />
                </td>
            )}
        </tr>
    );

    const exportRows = () => {
        const rows: string[][] = [['Statement of Financial Position', `As at ${filters.as_at}`], [], ['Group', 'Code', 'Account', 'Amount']];
        (Object.keys(report.groups) as GroupKey[]).forEach((k) => {
            report.groups[k].forEach((l) => rows.push([k, l.code, l.name, l.amount]));
            rows.push([k, '', 'Total', report.totals[k]]);
        });
        rows.push(['', '', 'Total assets', report.total_assets], ['', '', 'Total liabilities & equity', report.total_liabilities_equity]);
        exportCsv(`balance-sheet-${filters.as_at}`, rows);
    };

    return (
        <>
            <PageHeader
                title="Balance Sheet"
                subtitle="Statement of financial position — Assets = Liabilities + Equity/Funds."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Balance Sheet' }]}
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
                    <DateField label="As at" value={q.as_at} onChange={(v) => setQ({ ...q, as_at: v })} />
                    <div className="flex items-center pb-2">
                        <Checkbox label="Comparative date" checked={!!q.compare} onChange={(e) => setQ({ ...q, compare: e.target.checked ? '1' : '', cmp_at: '' })} />
                    </div>
                    {q.compare && <DateField label="Compare as at" value={q.cmp_at} onChange={(v) => setQ({ ...q, cmp_at: v })} />}
                    <button type="button" className="btn btn-primary" onClick={() => go('/accounting/balance-sheet', q)}>
                        Run report
                    </button>
                </div>
            </div>

            <div className="no-print mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                    ['Total assets', report.total_assets, 'text-primary'],
                    ['Total liabilities', report.total_liabilities, 'text-danger'],
                    ['Equity & funds', report.total_equity, 'text-success'],
                ].map(([l, v, t]) => (
                    <div key={l} className="panel">
                        <div className="text-xs font-bold tracking-wide text-white-dark uppercase">{l}</div>
                        <div className={cn('mt-1 text-xl font-extrabold', t)}>{money(v, meta.currency)}</div>
                    </div>
                ))}
            </div>

            <div className="panel mx-auto max-w-4xl">
                <ReportHeader title="Statement of Financial Position" period={`As at ${date(filters.as_at)}`} meta={meta}>
                    <CheckBadge ok={report.balanced} okText="Assets = Liabilities + Equity ✓" failText={`Difference ${report.difference}`} />
                </ReportHeader>
                <div className="table-responsive">
                    <table className="table table-compact">
                        <thead>
                            <tr>
                                <th>Particulars</th>
                                <th className="text-end!">{date(filters.as_at)}</th>
                                {cmp && <th className="text-end!">{date(filters.cmp_at)}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            <SectionRow title="Assets" cols={cols} />
                            {group('non_current_assets', 'Non-current assets')}
                            {group('current_assets', 'Current assets')}
                            {grand('Total assets', report.total_assets, comparative?.total_assets)}

                            <SectionRow title="Liabilities" cols={cols} tone="danger" />
                            {group('non_current_liabilities', 'Non-current liabilities')}
                            {group('current_liabilities', 'Current liabilities')}
                            <tr>
                                <td className="font-bold">Total liabilities</td>
                                <td className="text-end!">
                                    <Amt value={report.total_liabilities} bold zero />
                                </td>
                                {cmp && (
                                    <td className="text-end!">
                                        <Amt value={comparative?.total_liabilities} bold zero />
                                    </td>
                                )}
                            </tr>

                            <SectionRow title="Equity & funds" cols={cols} tone="success" />
                            {group('equity', 'Equity & funds')}
                            {grand('Total liabilities & equity', report.total_liabilities_equity, comparative?.total_liabilities_equity)}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-xs text-white-dark">
                    Current period surplus covers {date(report.period_start)} – {date(filters.as_at)} (income less expenses not yet closed to accumulated surplus). Contra-asset balances such as accumulated
                    depreciation are shown in brackets.
                </p>
            </div>
        </>
    );
}
