import { Link, router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, BadgeCheck, Banknote, Check, Download, FileSpreadsheet, LoaderCircle, Printer, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/filters';
import { Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { confirm } from '@/lib/swal';
import { cn, date, dateTime, exportCsv, money, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';

type Payslip = {
    id: number;
    employee_id: number;
    employee: string;
    employee_no: string;
    designation: string | null;
    department: string | null;
    bank_name: string | null;
    bank_account: string | null;
    basic_salary: string;
    allowances: string;
    gross_pay: string;
    paye: string;
    nssf_employee: string;
    other_deductions: string;
    total_deductions: string;
    net_pay: string;
    employer_contributions: string;
    unpaid_leave_days: number;
};

type Props = {
    run: {
        id: number;
        period: string;
        period_label: string;
        status: string;
        payment_date: string | null;
        notes: string | null;
        total_gross: string;
        total_deductions: string;
        total_net: string;
        total_employer: string;
        creator: string | null;
        created_at: string | null;
        approver: string | null;
        approved_at: string | null;
        payer: string | null;
        paid_at: string | null;
        journal: { id: number; journal_no: string; date: string } | null;
        payment_journal: { id: number; journal_no: string; date: string } | null;
        payment_account: string | null;
        rules: { version: string | null; calculated_at: string | null; paye_bands: { from: string; to: string | null; rate: string; base_tax: string }[]; notice: string };
    };
    payslips: Payslip[];
    statutory: { code: string | null; name: string; kind: string; amount: string; count: number }[];
    journalLines: { id: number; account: string; debit: string; credit: string; narration: string | null }[];
    journalPosted: boolean;
    bankAccounts: Option[];
    permissions: { manage: boolean; approve: boolean; isCreator: boolean };
};

const sum = (rows: Payslip[], key: keyof Payslip) => rows.reduce((s, r) => s + Number(r[key]), 0);

export default function PayrollShow({ run, payslips, statutory, journalLines, journalPosted, bankAccounts, permissions }: Props) {
    const { school, errors } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const workflowErrors = Object.entries(errors ?? {}).filter(([k]) => ['status', 'lines', 'date', 'account', 'period'].includes(k));
    const [search, setSearch] = useState('');
    const [payOpen, setPayOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const rows = payslips.filter((p) => !search || `${p.employee} ${p.employee_no} ${p.department ?? ''}`.toLowerCase().includes(search.toLowerCase()));

    const act = async (action: 'recalculate' | 'approve', opts: { title: string; text: string; confirmText: string }) => {
        const { confirmed } = await confirm(opts);
        if (!confirmed) return;
        setBusy(true);
        router.post(`/payroll/${run.id}/${action}`, {}, { preserveScroll: true, onFinish: () => setBusy(false) });
    };

    const destroy = async () => {
        const { confirmed } = await confirm({ title: `Delete draft payroll for ${run.period_label}?`, text: 'All draft payslips will be removed.', danger: true, confirmText: 'Delete' });
        if (confirmed) router.delete(`/payroll/${run.id}`);
    };

    const exportRegister = () =>
        exportCsv(`payroll-register-${run.period}`, [
            ['Employee No', 'Employee', 'Department', 'Basic', 'Allowances', 'Gross', 'PAYE', 'NSSF (EE)', 'Other deductions', 'Total deductions', 'Net pay', 'Employer contributions'],
            ...payslips.map((p) => [p.employee_no, p.employee, p.department, p.basic_salary, p.allowances, p.gross_pay, p.paye, p.nssf_employee, p.other_deductions, p.total_deductions, p.net_pay, p.employer_contributions]),
        ]);

    const steps = [
        { key: 'draft', label: 'Prepared', who: run.creator, when: run.created_at },
        { key: 'approved', label: 'Approved & posted', who: run.approver, when: run.approved_at },
        { key: 'paid', label: 'Paid', who: run.payer, when: run.paid_at },
    ];
    const stepIndex = ['draft', 'approved', 'paid'].indexOf(run.status);

    const columns: Column<Payslip>[] = [
        {
            key: 'employee',
            header: 'Employee',
            render: (p) => (
                <div>
                    <Link href={`/payroll/payslips/${p.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                        {p.employee}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {p.employee_no} · {p.designation ?? '—'}
                        {p.unpaid_leave_days > 0 && <span className="badge badge-soft-danger ms-1 px-1 py-0 text-[10px]">{p.unpaid_leave_days}d unpaid</span>}
                    </div>
                </div>
            ),
        },
        { key: 'basic_salary', header: 'Basic', align: 'right', render: (p) => money(p.basic_salary, '') },
        { key: 'allowances', header: 'Allowances', align: 'right', render: (p) => money(p.allowances, '') },
        { key: 'gross_pay', header: 'Gross', align: 'right', render: (p) => <span className="font-semibold">{money(p.gross_pay, '')}</span> },
        { key: 'paye', header: 'PAYE', align: 'right', render: (p) => money(p.paye, '') },
        { key: 'nssf_employee', header: 'NSSF', align: 'right', render: (p) => money(p.nssf_employee, '') },
        { key: 'other_deductions', header: 'Other', align: 'right', render: (p) => money(p.other_deductions, '') },
        { key: 'net_pay', header: 'Net pay', align: 'right', render: (p) => <span className="font-bold text-success">{money(p.net_pay, '')}</span> },
        { key: 'employer_contributions', header: 'Employer', align: 'right', render: (p) => <span className="text-white-dark">{money(p.employer_contributions, '')}</span> },
        {
            key: 'view',
            header: '',
            align: 'right',
            render: (p) => (
                <Link href={`/payroll/payslips/${p.id}`} className="text-xs font-bold text-primary hover:underline">
                    Payslip
                </Link>
            ),
        },
    ];

    const totalsRow = (
        <tr className="font-bold">
            <td>Totals ({num(rows.length)})</td>
            {(['basic_salary', 'allowances', 'gross_pay', 'paye', 'nssf_employee', 'other_deductions', 'net_pay', 'employer_contributions'] as const).map((k) => (
                <td key={k} className="text-end!">
                    {money(sum(rows, k), '')}
                </td>
            ))}
            <td />
        </tr>
    );

    const debitTotal = journalLines.reduce((s, l) => s + Number(l.debit), 0);
    const creditTotal = journalLines.reduce((s, l) => s + Number(l.credit), 0);

    return (
        <>
            <PageHeader
                title={`Payroll · ${run.period_label}`}
                subtitle={run.notes ?? `Pay date ${date(run.payment_date)}`}
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Payroll', href: '/payroll' }, { title: run.period_label }]}
                actions={
                    <>
                        <a href={`/payroll/${run.id}/bank-file`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Bank file
                        </a>
                        <Link href={`/payroll/${run.id}/summary`} className="btn btn-outline-dark">
                            <Printer className="h-4 w-4" /> Summary
                        </Link>
                        {permissions.manage && run.status === 'draft' && (
                            <>
                                <button className="btn btn-outline-danger" onClick={destroy}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                                <button
                                    className="btn btn-outline-warning"
                                    disabled={busy}
                                    onClick={() => act('recalculate', { title: 'Recalculate payroll?', text: 'Payslips are rebuilt from current salaries, components, unpaid leave and statutory rules.', confirmText: 'Recalculate' })}
                                >
                                    <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} /> Recalculate
                                </button>
                                {permissions.approve ? (
                                    <button
                                        className="btn btn-success"
                                        disabled={busy}
                                        onClick={() =>
                                            act('approve', {
                                                title: `Approve payroll for ${run.period_label}?`,
                                                text: `Net pay ${money(run.total_net, cur)} for ${payslips.length} staff. The payroll journal will be posted to the general ledger and the run locked.`,
                                                confirmText: 'Approve & post',
                                            })
                                        }
                                    >
                                        <BadgeCheck className="h-4 w-4" /> Approve
                                    </button>
                                ) : (
                                    <span className="badge badge-soft-warning self-center" title="Maker-checker control">
                                        Awaiting approval by another user
                                    </span>
                                )}
                            </>
                        )}
                        {permissions.manage && run.status === 'approved' && (
                            <button className="btn btn-success" onClick={() => setPayOpen(true)}>
                                <Wallet className="h-4 w-4" /> Mark as paid
                            </button>
                        )}
                    </>
                }
            />

            {workflowErrors.length > 0 && (
                <div className="mb-6 flex items-start gap-2 rounded-md border border-danger/40 bg-danger-light p-3 text-sm text-danger dark:bg-danger-dark-light">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        {workflowErrors.map(([k, v]) => (
                            <div key={k}>{v}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Workflow */}
            <div className="panel mb-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {steps.map((s, i) => {
                        const done = i <= stepIndex;
                        return (
                            <div key={s.key} className="flex items-center gap-3">
                                <span className={cn('grid h-10 w-10 shrink-0 place-content-center rounded-full border-2', done ? 'border-success bg-success text-white' : 'border-white-light text-white-dark dark:border-[#1b2e4b]')}>
                                    {done ? <Check className="h-5 w-5" /> : i + 1}
                                </span>
                                <div className="min-w-0">
                                    <div className={cn('font-bold', done ? 'text-black dark:text-white-light' : 'text-white-dark')}>{s.label}</div>
                                    <div className="truncate text-xs text-white-dark">{done && s.who ? `${s.who} · ${dateTime(s.when)}` : 'Pending'}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {run.status === 'draft' && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            Draft — review every payslip before approval. {run.rules.notice} {permissions.isCreator && 'You prepared this run, so another user with payroll rights must approve it.'}
                        </span>
                    </div>
                )}
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Gross pay" value={money(run.total_gross, cur)} icon={Banknote} tone="primary" hint={`${payslips.length} employees`} />
                <StatCard title="Deductions" value={money(run.total_deductions, cur)} icon={FileSpreadsheet} tone="danger" hint="PAYE, NSSF & others" />
                <StatCard title="Net pay" value={money(run.total_net, cur)} icon={Wallet} tone="success" hint={run.payment_account ? `Paid via ${run.payment_account}` : `Due ${date(run.payment_date)}`} />
                <StatCard title="Employer cost" value={money(run.total_employer, cur)} icon={BadgeCheck} tone="info" hint="NSSF · WCF · SDL" />
            </div>

            <div className="panel mb-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h5 className="text-lg font-bold">Payslips</h5>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchInput value={search} onChange={setSearch} placeholder="Search employee…" />
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={exportRegister}>
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                    </div>
                </div>
                <DataTable columns={columns} rows={rows} compact striped empty="No payslips" footer={rows.length ? totalsRow : undefined} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Statutory & deductions summary</h5>
                    <div className="table-responsive">
                        <table className="table-compact table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Borne by</th>
                                    <th className="text-center!">Staff</th>
                                    <th className="text-end!">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statutory.map((s) => (
                                    <tr key={`${s.kind}-${s.code ?? s.name}`}>
                                        <td className="font-semibold">{s.name}</td>
                                        <td>
                                            <span className={`badge ${s.kind === 'employer' ? 'badge-soft-info' : 'badge-soft-danger'}`}>{titleCase(s.kind)}</span>
                                        </td>
                                        <td className="text-center!">{s.count}</td>
                                        <td className="text-end! font-semibold">{money(s.amount, '')}</td>
                                    </tr>
                                ))}
                                {statutory.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="text-center! text-white-dark">
                                            No deductions
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-5">
                        <h6 className="mb-2 font-bold">
                            PAYE bands used <span className="text-xs font-normal text-white-dark">({run.rules.version ?? '—'} · calculated {dateTime(run.rules.calculated_at)})</span>
                        </h6>
                        <ul className="space-y-1 text-xs">
                            {run.rules.paye_bands.map((b, i) => (
                                <li key={i} className="flex justify-between border-b border-dashed border-white-light py-1 dark:border-[#1b2e4b]">
                                    <span>
                                        {money(b.from, '')} – {b.to ? money(b.to, '') : 'and above'}
                                    </span>
                                    <span className="font-semibold">
                                        {Number(b.base_tax) ? `${money(b.base_tax, '')} + ` : ''}
                                        {Math.round(Number(b.rate) * 100)}% of excess
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-lg font-bold">{journalPosted ? 'Payroll journal' : 'Journal preview'}</h5>
                        {run.journal ? (
                            <span className="badge badge-soft-success">
                                {run.journal.journal_no} · posted {date(run.journal.date)}
                            </span>
                        ) : (
                            <span className="badge badge-soft-dark">Posts on approval</span>
                        )}
                    </div>
                    <div className="table-responsive">
                        <table className="table-compact table">
                            <thead>
                                <tr>
                                    <th>Account</th>
                                    <th className="text-end!">Debit</th>
                                    <th className="text-end!">Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {journalLines.map((l) => (
                                    <tr key={l.id}>
                                        <td>
                                            <div className="font-semibold">{l.account}</div>
                                            {l.narration && <div className="text-xs text-white-dark">{l.narration}</div>}
                                        </td>
                                        <td className="text-end!">{Number(l.debit) ? money(l.debit, '') : ''}</td>
                                        <td className="text-end!">{Number(l.credit) ? money(l.credit, '') : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-bold">
                                    <td>Total</td>
                                    <td className="text-end!">{money(debitTotal, '')}</td>
                                    <td className="text-end!">{money(creditTotal, '')}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {run.payment_journal && (
                        <div className="mt-4 rounded-md bg-success-light p-3 text-sm text-success dark:bg-success-dark-light">
                            Salary payment journal <strong>{run.payment_journal.journal_no}</strong> on {date(run.payment_journal.date)}: Dr 2500 Net Salaries Payable / Cr {run.payment_account}.
                        </div>
                    )}
                </div>
            </div>

            <PayModal open={payOpen} onClose={() => setPayOpen(false)} run={run} bankAccounts={bankAccounts} cur={cur} />
        </>
    );
}

function PayModal({ open, onClose, run, bankAccounts, cur }: { open: boolean; onClose: () => void; run: Props['run']; bankAccounts: Option[]; cur: string }) {
    const bank = bankAccounts.find((a) => a.label.startsWith('1200')) ?? bankAccounts[0];
    const form = useForm({ account_id: bank ? String(bank.value) : '', payment_date: run.payment_date ?? new Date().toISOString().slice(0, 10) });

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const { confirmed } = await confirm({ title: 'Record salary payment?', text: `${money(run.total_net, cur)} will be credited to the selected bank account.`, confirmText: 'Mark as paid' });
        if (confirmed) form.post(`/payroll/${run.id}/pay`, { preserveScroll: true, onSuccess: () => onClose() });
    };

    return (
        <Modal open={open} onClose={onClose} title={`Pay salaries · ${run.period_label}`}>
            <form onSubmit={submit} className="space-y-4">
                <div className="rounded-md bg-primary-light p-3 dark:bg-primary-dark-light">
                    <div className="text-xs font-bold text-white-dark uppercase">Net salaries to pay</div>
                    <div className="text-2xl font-extrabold text-primary">{money(run.total_net, cur)}</div>
                </div>
                <Select label="Paid from" required placeholder="Select account…" value={form.data.account_id} onChange={(e) => form.setData('account_id', e.target.value)} options={bankAccounts} error={form.errors.account_id} />
                <Input label="Payment date" type="date" required value={form.data.payment_date} onChange={(e) => form.setData('payment_date', e.target.value)} error={form.errors.payment_date} />
                <p className="text-xs text-white-dark">Posts Dr 2500 Net Salaries Payable / Cr the selected bank account. Download the bank file to upload the transfers to your bank.</p>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-success" disabled={form.processing}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Mark as paid
                    </button>
                </div>
            </form>
        </Modal>
    );
}
