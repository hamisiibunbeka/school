import { Link } from '@inertiajs/react';
import { Download, Lock } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { date, exportCsv, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import { Amt, RangeField, ReportHeader, SectionRow, go, periodLabel, type Meta } from './_components/report';
import SearchSelect from '@/components/ui/search-select';

type Line = { id: number; journal_id: number; journal_no: string; date: string; type: string; status: string; reference: string | null; narration: string; debit: string; credit: string; balance: string };
type Props = {
    filters: { account: string; from: string; to: string };
    account: { id: number; code: string; name: string; type: string; sub_type: string | null; normal_balance: string; is_control: boolean } | null;
    ledger: { opening: string; closing: string; total_debit: string; total_credit: string; lines: Line[] } | null;
    accounts: Option[];
    meta: Meta;
};

export default function Ledger({ filters, account, ledger, accounts, meta }: Props) {
    const [q, setQ] = useState(filters);
    const apply = (next = q) => go('/accounting/ledger', next);
    const drcr = (v: string) => (account?.normal_balance === 'debit' ? (Number(v) >= 0 ? 'Dr' : 'Cr') : Number(v) >= 0 ? 'Cr' : 'Dr');

    const exportRows = () => {
        if (!account || !ledger) return;
        exportCsv(`ledger-${account.code}-${filters.from}-${filters.to}`, [
            [`Account ledger: ${account.code} ${account.name}`],
            [`Period: ${filters.from} to ${filters.to}`],
            [],
            ['Date', 'Journal', 'Type', 'Reference', 'Narration', 'Debit', 'Credit', 'Balance'],
            ['', '', '', '', 'Opening balance', '', '', ledger.opening],
            ...ledger.lines.map((l) => [l.date, l.journal_no, l.type, l.reference, l.narration, l.debit, l.credit, l.balance]),
            ['', '', '', '', 'Totals / closing balance', ledger.total_debit, ledger.total_credit, ledger.closing],
        ]);
    };

    return (
        <>
            <PageHeader
                title="General Ledger"
                subtitle="Posted debits and credits by account with running balance."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'General Ledger' }]}
                actions={
                    <>
                        <button type="button" className="btn btn-outline-primary" onClick={exportRows} disabled={!ledger}>
                            <Download className="h-4 w-4" /> CSV
                        </button>
                        <PrintButton />
                    </>
                }
            />

            <div className="panel no-print mb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                    <label className="mb-0 flex flex-1 flex-col gap-1 text-xs font-semibold text-white-dark">
                        Account
                        <SearchSelect className="form-select min-w-0 lg:min-w-[280px]" value={q.account} onChange={(e) => apply({ ...q, account: e.target.value })}>
                            {accounts.map((a) => (
                                <option key={a.value} value={a.value}>
                                    {a.label}
                                </option>
                            ))}
                        </SearchSelect>
                    </label>
                    <RangeField from={q.from} to={q.to} onChange={(from, to) => apply({ ...q, from, to })} />
                    <button type="button" className="btn btn-primary" onClick={() => apply()}>
                        Run report
                    </button>
                </div>
            </div>

            <div className="panel">
                {!account || !ledger ? (
                    <EmptyState title="Choose an account" description="Select an account and period to see its ledger." />
                ) : (
                    <>
                        <ReportHeader title={`Account Ledger — ${account.code} ${account.name}`} period={periodLabel(filters.from, filters.to)} meta={meta} />
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <div className="font-mono text-sm text-white-dark">{account.code}</div>
                                <h2 className="flex items-center gap-2 text-xl font-extrabold text-black dark:text-white-light">
                                    {account.name} {account.is_control && <Lock className="h-4 w-4 text-warning" />}
                                </h2>
                                <div className="text-xs text-white-dark">
                                    {titleCase(account.type)} · {titleCase(account.sub_type)} · Normal balance {account.normal_balance}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6 text-end text-sm">
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Opening</div>
                                    <Amt value={ledger.opening} bold zero />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Closing</div>
                                    <Amt value={ledger.closing} bold zero className="text-primary" />
                                </div>
                            </div>
                        </div>
                        <div className="table-responsive">
                            <table className="table table-compact table-striped">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Journal</th>
                                        <th>Narration</th>
                                        <th>Reference</th>
                                        <th className="text-end!">Debit</th>
                                        <th className="text-end!">Credit</th>
                                        <th className="text-end!">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="font-semibold">
                                        <td>{date(filters.from)}</td>
                                        <td colSpan={3} className="italic">
                                            Opening balance b/f
                                        </td>
                                        <td />
                                        <td />
                                        <td className="text-end!">
                                            <Amt value={ledger.opening} zero /> <span className="text-xs text-white-dark">{drcr(ledger.opening)}</span>
                                        </td>
                                    </tr>
                                    {ledger.lines.length === 0 && <SectionRow title="No postings in this period" cols={7} tone="secondary" />}
                                    {ledger.lines.map((l) => (
                                        <tr key={l.id}>
                                            <td className="whitespace-nowrap">{date(l.date)}</td>
                                            <td>
                                                <Link href={`/accounting/journals/${l.journal_id}`} className="font-mono text-primary hover:underline">
                                                    {l.journal_no}
                                                </Link>
                                                <div className="text-[11px] text-white-dark">{titleCase(l.type)}</div>
                                            </td>
                                            <td className="max-w-sm">{l.narration}</td>
                                            <td className="text-xs">{l.reference ?? ''}</td>
                                            <td className="text-end!">{Number(l.debit) ? <Amt value={l.debit} /> : ''}</td>
                                            <td className="text-end!">{Number(l.credit) ? <Amt value={l.credit} /> : ''}</td>
                                            <td className="text-end!">
                                                <Amt value={l.balance} zero /> <span className="text-xs text-white-dark">{drcr(l.balance)}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-black/40 font-extrabold dark:border-white/30">
                                        <td colSpan={4} className="text-end! uppercase">
                                            Period totals / closing balance c/f
                                        </td>
                                        <td className="text-end!">
                                            <Amt value={ledger.total_debit} bold zero />
                                        </td>
                                        <td className="text-end!">
                                            <Amt value={ledger.total_credit} bold zero />
                                        </td>
                                        <td className="text-end! underline decoration-double">
                                            <Amt value={ledger.closing} bold zero /> <span className="text-xs">{drcr(ledger.closing)}</span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-white-dark">{ledger.lines.length} posting(s). Balances are signed in the account&apos;s normal direction; negative figures are shown in brackets.</p>
                    </>
                )}
            </div>
        </>
    );
}
