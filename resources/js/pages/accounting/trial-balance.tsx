import { Link } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import { Checkbox } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { date, exportCsv } from '@/lib/utils';
import { Amt, CheckBadge, DateField, ReportHeader, SectionRow, go, periodLabel, type Meta } from './_components/report';

type Row = { id: number; code: string; name: string; type: string; sub_type: string | null; period_dr: string; period_cr: string; debit: string; credit: string; cmp_debit: string; cmp_credit: string };
type Props = {
    filters: { mode: 'as_at' | 'period'; from: string; to: string; compare: string; cmp_from: string; cmp_to: string };
    report: { rows: Row[]; total_debit: string; total_credit: string; balanced: boolean; cmp_total_debit: string | null; cmp_total_credit: string | null; cmp_balanced: boolean | null };
    meta: Meta;
};

const CLASSES: [string, string][] = [
    ['asset', 'Assets'],
    ['liability', 'Liabilities'],
    ['equity', 'Equity & Funds'],
    ['income', 'Income'],
    ['expense', 'Expenses'],
];

export default function TrialBalance({ filters, report, meta }: Props) {
    const [q, setQ] = useState(filters);
    const compare = !!filters.compare;
    const cols = compare ? 6 : 4;
    const period = periodLabel(filters.mode === 'period' ? filters.from : null, filters.to);
    const cmpPeriod = compare ? periodLabel(filters.mode === 'period' ? filters.cmp_from : null, filters.cmp_to) : '';

    const exportRows = () =>
        exportCsv(`trial-balance-${filters.to}`, [
            ['Trial Balance', period],
            [],
            ['Code', 'Account', 'Class', 'Debit', 'Credit', ...(compare ? [`Debit (${cmpPeriod})`, `Credit (${cmpPeriod})`] : [])],
            ...report.rows.map((r) => [r.code, r.name, r.type, r.debit, r.credit, ...(compare ? [r.cmp_debit, r.cmp_credit] : [])]),
            ['', 'TOTAL', '', report.total_debit, report.total_credit, ...(compare ? [report.cmp_total_debit ?? '', report.cmp_total_credit ?? ''] : [])],
        ]);

    return (
        <>
            <PageHeader
                title="Trial Balance"
                subtitle="Debit and credit balances of every account from posted journals — totals must agree."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Trial Balance' }]}
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
                    <label className="mb-0 flex flex-col gap-1 text-xs font-semibold text-white-dark">
                        Basis
                        <select className="form-select w-full sm:w-44" value={q.mode} onChange={(e) => setQ({ ...q, mode: e.target.value as 'as_at' | 'period' })}>
                            <option value="as_at">As at date (cumulative)</option>
                            <option value="period">Period movements</option>
                        </select>
                    </label>
                    {q.mode === 'period' && <DateField label="From" value={q.from} onChange={(v) => setQ({ ...q, from: v })} />}
                    <DateField label={q.mode === 'period' ? 'To' : 'As at'} value={q.to} onChange={(v) => setQ({ ...q, to: v })} />
                    <div className="flex items-center pb-2">
                        <Checkbox label="Comparative" checked={!!q.compare} onChange={(e) => setQ({ ...q, compare: e.target.checked ? '1' : '', cmp_from: '', cmp_to: '' })} />
                    </div>
                    {q.compare && q.mode === 'period' && <DateField label="Compare from" value={q.cmp_from} onChange={(v) => setQ({ ...q, cmp_from: v })} />}
                    {q.compare && <DateField label={q.mode === 'period' ? 'Compare to' : 'Compare as at'} value={q.cmp_to} onChange={(v) => setQ({ ...q, cmp_to: v })} />}
                    <button type="button" className="btn btn-primary" onClick={() => go('/accounting/trial-balance', { ...q, from: q.mode === 'period' ? q.from : '' })}>
                        Run report
                    </button>
                </div>
            </div>

            <div className="panel">
                <ReportHeader title="Trial Balance" period={period} meta={meta}>
                    <CheckBadge ok={report.balanced} okText="Balanced ✓" failText="Out of balance" />
                </ReportHeader>

                <div className="table-responsive">
                    <table className="table table-compact">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Account</th>
                                <th className="text-end!">Debit</th>
                                <th className="text-end!">Credit</th>
                                {compare && (
                                    <>
                                        <th className="text-end!">Debit ({cmpPeriod})</th>
                                        <th className="text-end!">Credit ({cmpPeriod})</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {CLASSES.map(([type, label]) => {
                                const rows = report.rows.filter((r) => r.type === type);
                                if (!rows.length) return null;
                                return [
                                    <SectionRow key={`s-${type}`} title={label} cols={cols} />,
                                    ...rows.map((r) => (
                                        <tr key={r.id}>
                                            <td className="font-mono">{r.code}</td>
                                            <td>
                                                <Link
                                                    href={`/accounting/ledger?account=${r.id}&from=${filters.mode === 'period' ? filters.from : '2000-01-01'}&to=${filters.to}`}
                                                    className="hover:text-primary hover:underline"
                                                >
                                                    {r.name}
                                                </Link>
                                            </td>
                                            <td className="text-end!">
                                                <Amt value={r.debit} />
                                            </td>
                                            <td className="text-end!">
                                                <Amt value={r.credit} />
                                            </td>
                                            {compare && (
                                                <>
                                                    <td className="text-end! text-white-dark">
                                                        <Amt value={r.cmp_debit} />
                                                    </td>
                                                    <td className="text-end! text-white-dark">
                                                        <Amt value={r.cmp_credit} />
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    )),
                                ];
                            })}
                            {report.rows.length === 0 && (
                                <tr>
                                    <td colSpan={cols} className="py-10 text-center text-white-dark">
                                        No posted transactions for {period.toLowerCase()}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-black/50 bg-[#fbfbfb] text-base dark:border-white/30 dark:bg-[#121c2c]">
                                <td colSpan={2} className="text-end! font-extrabold uppercase">
                                    Totals
                                </td>
                                <td className="text-end! underline decoration-double">
                                    <Amt value={report.total_debit} bold zero />
                                </td>
                                <td className="text-end! underline decoration-double">
                                    <Amt value={report.total_credit} bold zero />
                                </td>
                                {compare && (
                                    <>
                                        <td className="text-end! underline decoration-double">
                                            <Amt value={report.cmp_total_debit} bold zero />
                                        </td>
                                        <td className="text-end! underline decoration-double">
                                            <Amt value={report.cmp_total_credit} bold zero />
                                        </td>
                                    </>
                                )}
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <p className="mt-4 text-xs text-white-dark">
                    Derived directly from the General Ledger (posted journals {filters.mode === 'period' ? `dated ${date(filters.from)} – ${date(filters.to)}` : `up to ${date(filters.to)}`}). Income and expense balances
                    are shown before year-end closing.
                </p>
            </div>
        </>
    );
}
