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
    payment_status: 'pending' | 'paid' | 'withheld';
    paid_at: string | null;
    withheld_reason: string | null;
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
        {
            key: 'paid',
            label: run.status === 'partially_paid' ? `Partially paid (${payslips.filter((p) => p.payment_status === 'paid').length}/${payslips.length})` : 'Paid',
            who: run.payer,
            when: run.paid_at ?? (run.status === 'partially_paid' ? run.payment_date : null),
        },
    ];
    const stepIndex = run.status === 'partially_paid' ? 2 : ['draft', 'approved', 'paid'].indexOf(run.status);
    const unpaidCount = payslips.filter((p) => p.payment_status !== 'paid').length;

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
        ...(run.status === 'draft'
            ? []
            : [
                  {
                      key: 'payment',
                      header: 'Payment',
                      render: (p: Payslip) =>
                          p.payment_status === 'paid' ? (
                              <span className="badge badge-soft-success" title={p.paid_at ? `Paid ${date(p.paid_at)}` : undefined}>
                                  Paid
                              </span>
                          ) : p.payment_status === 'withheld' ? (
                              <span className="badge badge-soft-warning max-w-[180px] truncate" title={p.withheld_reason ?? ''}>
                                  Withheld{p.withheld_reason ? `: ${p.withheld_reason}` : ''}
                              </span>
                          ) : (
                              <span className="badge badge-soft-dark">Pending</span>
                          ),
                  } as Column<Payslip>,
              ]),
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
                        {permissions.manage && (run.status === 'approved' || run.status === 'partially_paid') && (
                            <button className="btn btn-success" onClick={() => setPayOpen(true)}>
                                <Wallet className="h-4 w-4" /> {run.status === 'partially_paid' ? `Pay remaining (${unpaidCount})` : 'Pay salaries'}
                            </button>
                        )}
                        {run.status === 'partially_paid' && (
                            <a href={`/payroll/${run.id}/bank-file?only=unpaid`} className="btn btn-outline-warning">
                                <Download className="h-4 w-4" /> Bank file (unpaid)
                            </a>
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

            {payOpen && <PayModal open onClose={() => setPayOpen(false)} run={run} payslips={payslips} bankAccounts={bankAccounts} cur={cur} />}
        </>
    );
}

const withholdReasons = ['Bank details missing / incorrect', 'Disciplinary hold', 'On unpaid leave', 'Salary advance recovery pending', 'Exited / under clearance', 'Awaiting HR verification'];

/**
 * Pay selected employees. Unticked employees are withheld with a reason and stay
 * payable (2500) — they can be paid later from this same run.
 */
function PayModal({ open, onClose, run, payslips, bankAccounts, cur }: { open: boolean; onClose: () => void; run: Props['run']; payslips: Payslip[]; bankAccounts: Option[]; cur: string }) {
    const bank = bankAccounts.find((a) => a.label.startsWith('1200')) ?? bankAccounts[0];
    const unpaid = payslips.filter((p) => p.payment_status !== 'paid');
    const [search, setSearch] = useState('');
    const [bulkReason, setBulkReason] = useState('');

    const form = useForm<{ account_id: string; payment_date: string; payslip_ids: number[]; withheld: Record<number, string> }>({
        account_id: bank ? String(bank.value) : '',
        payment_date: new Date().toISOString().slice(0, 10),
        // Previously withheld staff start unticked (keeping their reason); pending staff start ticked.
        payslip_ids: unpaid.filter((p) => p.payment_status !== 'withheld').map((p) => p.id),
        withheld: Object.fromEntries(unpaid.filter((p) => p.withheld_reason).map((p) => [p.id, p.withheld_reason as string])),
    });

    const selected = new Set(form.data.payslip_ids);
    const payTotal = unpaid.filter((p) => selected.has(p.id)).reduce((s, p) => s + Number(p.net_pay), 0);
    const heldRows = unpaid.filter((p) => !selected.has(p.id));
    const heldTotal = heldRows.reduce((s, p) => s + Number(p.net_pay), 0);
    const missingReasons = heldRows.filter((p) => !form.data.withheld[p.id]?.trim()).length;
    const visible = unpaid.filter((p) => !search || `${p.employee} ${p.employee_no} ${p.department ?? ''}`.toLowerCase().includes(search.toLowerCase()));

    const toggle = (id: number) => form.setData('payslip_ids', selected.has(id) ? form.data.payslip_ids.filter((x) => x !== id) : [...form.data.payslip_ids, id]);
    const setReason = (id: number, reason: string) => form.setData('withheld', { ...form.data.withheld, [id]: reason });

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (missingReasons > 0) return;
        const { confirmed } = await confirm({
            title: 'Record salary payment?',
            text: `${form.data.payslip_ids.length} staff · ${money(payTotal, cur)} paid from the selected account.${heldRows.length ? ` ${heldRows.length} staff (${money(heldTotal, cur)}) withheld and still owed.` : ''}`,
            confirmText: heldRows.length ? 'Pay selected' : 'Pay all',
        });
        if (!confirmed) return;
        form.transform((d) => ({ ...d, withheld: Object.fromEntries(heldRows.map((p) => [p.id, d.withheld[p.id]])) }));
        form.post(`/payroll/${run.id}/pay`, { preserveScroll: true, onSuccess: () => onClose() });
    };

    return (
        <Modal open={open} onClose={onClose} title={`${run.status === 'partially_paid' ? 'Pay remaining salaries' : 'Pay salaries'} · ${run.period_label}`} size="xl">
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-md bg-success-light p-3 dark:bg-success-dark-light">
                        <div className="text-xs font-bold text-white-dark uppercase">To pay now · {form.data.payslip_ids.length} staff</div>
                        <div className="text-xl font-extrabold text-success">{money(payTotal, cur)}</div>
                    </div>
                    <div className="rounded-md bg-warning-light p-3 dark:bg-warning-dark-light">
                        <div className="text-xs font-bold text-white-dark uppercase">Withheld · {heldRows.length} staff</div>
                        <div className="text-xl font-extrabold text-warning">{money(heldTotal, cur)}</div>
                    </div>
                    <div className="rounded-md bg-[#f6f8fa] p-3 dark:bg-[#1a2941]">
                        <div className="text-xs font-bold text-white-dark uppercase">Already paid</div>
                        <div className="text-xl font-extrabold">{payslips.length - unpaid.length} staff</div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[200px] flex-1">
                        <SearchInput value={search} onChange={setSearch} placeholder="Search staff…" className="sm:w-full" />
                    </div>
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => form.setData('payslip_ids', unpaid.map((p) => p.id))}>
                        Select all
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => form.setData('payslip_ids', [])}>
                        Unselect all
                    </button>
                </div>

                {heldRows.length > 0 && (
                    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-warning/50 p-3">
                        <div className="min-w-[220px] flex-1">
                            <Select label="Reason for unticked staff" placeholder="Choose or type below…" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} options={withholdReasons} />
                        </div>
                        <button
                            type="button"
                            className="btn btn-sm btn-warning"
                            disabled={!bulkReason}
                            onClick={() => form.setData('withheld', { ...form.data.withheld, ...Object.fromEntries(heldRows.map((p) => [p.id, bulkReason])) })}
                        >
                            Apply to all {heldRows.length} withheld
                        </button>
                    </div>
                )}

                <div className="max-h-[45vh] overflow-y-auto rounded-md border border-white-light dark:border-[#1b2e4b]">
                    <table className="table table-compact">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="w-10">Pay</th>
                                <th>Employee</th>
                                <th>Bank</th>
                                <th className="text-end!">Net pay</th>
                                <th>Reason if not paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((p) => {
                                const isPaid = selected.has(p.id);
                                const reason = form.data.withheld[p.id] ?? '';
                                return (
                                    <tr key={p.id} className={cn(!isPaid && 'bg-warning-light/40 dark:bg-warning-dark-light')}>
                                        <td>
                                            <input type="checkbox" className="form-checkbox" checked={isPaid} onChange={() => toggle(p.id)} aria-label={`Pay ${p.employee}`} />
                                        </td>
                                        <td>
                                            <div className="font-semibold">{p.employee}</div>
                                            <div className="text-xs text-white-dark">
                                                {p.employee_no}
                                                {p.payment_status === 'withheld' && <span className="badge badge-soft-warning ms-1">Previously withheld</span>}
                                            </div>
                                        </td>
                                        <td className="text-xs">
                                            {p.bank_name ?? <span className="text-danger">No bank</span>}
                                            <div className="text-white-dark">{p.bank_account ? `•••• ${p.bank_account.slice(-4)}` : '—'}</div>
                                        </td>
                                        <td className="text-end! font-bold">{money(p.net_pay, '')}</td>
                                        <td className="min-w-[200px]">
                                            {isPaid ? (
                                                <span className="text-xs text-success">Will be paid</span>
                                            ) : (
                                                <input
                                                    className={cn('form-input form-input-sm', !reason.trim() && 'border-danger')}
                                                    placeholder="Required — why not paid?"
                                                    list="withhold-reasons"
                                                    value={reason}
                                                    onChange={(e) => setReason(p.id, e.target.value)}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <datalist id="withhold-reasons">
                        {withholdReasons.map((r) => (
                            <option key={r} value={r} />
                        ))}
                    </datalist>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select label="Paid from" required placeholder="Select account…" value={form.data.account_id} onChange={(e) => form.setData('account_id', e.target.value)} options={bankAccounts} error={form.errors.account_id} />
                    <Input label="Payment date" type="date" required value={form.data.payment_date} onChange={(e) => form.setData('payment_date', e.target.value)} error={form.errors.payment_date} />
                </div>

                {(missingReasons > 0 || (form.errors as Record<string, string>).withheld || (form.errors as Record<string, string>).payslip_ids) && (
                    <p className="form-error text-center">
                        {missingReasons > 0 ? `Enter a reason for ${missingReasons} unticked employee(s).` : (form.errors as Record<string, string>).withheld ?? (form.errors as Record<string, string>).payslip_ids}
                    </p>
                )}
                <p className="text-center text-xs text-white-dark">
                    Posts Dr 2500 Net Salaries Payable / Cr the selected account for the ticked staff only. Withheld salaries remain owed and can be paid later with “Pay remaining”.
                </p>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-success" disabled={form.processing || missingReasons > 0 || (form.data.payslip_ids.length === 0 && heldRows.length === 0)}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {form.data.payslip_ids.length === 0 ? 'Save withheld reasons' : heldRows.length ? `Pay ${form.data.payslip_ids.length} selected` : 'Pay all'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
