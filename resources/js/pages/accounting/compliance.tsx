import { Link, useForm, usePage } from '@inertiajs/react';
import { Building2, CalendarClock, CircleCheck, ExternalLink, HandCoins, Pencil, Plus, Receipt } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DeleteButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FormGrid, Input, Select, Switch, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { cn, date, money, num, titleCase, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Obligation = {
    id: number;
    name: string;
    authority: string;
    basis: 'fixed' | 'percent_of_turnover' | 'percent_of_payroll';
    rate: string | null;
    amount: string | null;
    frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
    due_day: number | null;
    expense_account_id: number | null;
    expense_account: string | null;
    is_active: boolean;
    source_url: string | null;
    notes: string | null;
    period: { start: string; end: string; label: string };
    estimate: { base: string | null; amount: string; due_date: string };
    paid_for_period: boolean;
    last_payment: { paid_on: string; amount: string } | null;
};
type PaymentRow = {
    id: number;
    obligation: string;
    authority: string;
    period: string;
    base_amount: string | null;
    amount: string;
    paid_on: string;
    reference: string | null;
    account: string | null;
    journal_id: number | null;
    journal_no: string | null;
    by: string | null;
};
type Props = {
    obligations: Obligation[];
    payments: Paginated<PaymentRow>;
    expenseAccounts: Option[];
    cashAccounts: Option[];
    canManage: boolean;
    totals: { paid_ytd: string; due_now: string };
};

const basisLabel: Record<Obligation['basis'], string> = {
    fixed: 'Fixed amount',
    percent_of_turnover: '% of turnover (posted income)',
    percent_of_payroll: '% of gross payroll',
};

export default function Compliance({ obligations, payments, expenseAccounts, cashAccounts, canManage, totals }: Props) {
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [editing, setEditing] = useState<Obligation | 'new' | null>(null);
    const [paying, setPaying] = useState<Obligation | null>(null);

    const columns: Column<PaymentRow>[] = [
        { key: 'paid_on', header: 'Paid on', render: (p) => date(p.paid_on) },
        {
            key: 'obligation',
            header: 'Obligation',
            render: (p) => (
                <div>
                    <div className="font-semibold">{p.obligation}</div>
                    <div className="text-xs text-white-dark">{p.authority}</div>
                </div>
            ),
        },
        { key: 'period', header: 'Period' },
        { key: 'base', header: 'Base', align: 'right', render: (p) => (p.base_amount ? money(p.base_amount, '') : '—') },
        { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="font-bold">{money(p.amount, '')}</span> },
        { key: 'account', header: 'Paid from', render: (p) => p.account ?? '—' },
        { key: 'reference', header: 'Reference', render: (p) => p.reference ?? '—' },
        {
            key: 'journal',
            header: 'Journal',
            render: (p) =>
                p.journal_id ? (
                    <Link href={`/accounting/journals/${p.journal_id}`} className="font-semibold text-primary hover:underline">
                        {p.journal_no}
                    </Link>
                ) : (
                    '—'
                ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Levies & Compliance"
                subtitle="Government levies, fees and licences outside payroll — service levy, fire, OSHA, property tax and any others you add."
                breadcrumbs={[{ title: 'Accounting', href: '/accounting/accounts' }, { title: 'Levies & compliance' }]}
                actions={
                    <>
                        <Link href="/payroll/statutory" className="btn btn-outline-primary">
                            Payroll statutory rules
                        </Link>
                        {canManage && (
                            <button className="btn btn-primary" onClick={() => setEditing('new')}>
                                <Plus className="h-4 w-4" /> Add obligation
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title="Active obligations" value={num(obligations.filter((o) => o.is_active).length)} icon={Building2} tone="primary" />
                <StatCard title="Estimated due now" value={money(totals.due_now, cur)} icon={CalendarClock} tone="warning" hint="Current periods not yet paid" />
                <StatCard title="Paid this year" value={money(totals.paid_ytd, cur)} icon={HandCoins} tone="success" />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {obligations.map((o) => (
                    <div key={o.id} className={cn('panel flex flex-col', !o.is_active && 'opacity-60')}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                                <h6 className="text-base font-bold">{o.name}</h6>
                                <div className="text-xs text-white-dark">{o.authority}</div>
                            </div>
                            <span className="badge badge-soft-info">{titleCase(o.frequency)}</span>
                        </div>
                        <div className="mb-3 text-sm">
                            <strong>{o.basis === 'fixed' ? money(o.amount ?? 0, cur) : `${Number(o.rate)}%`}</strong> · {basisLabel[o.basis]}
                        </div>
                        <div className="mb-3 rounded-md bg-[#f6f8fa] p-3 text-sm dark:bg-[#1a2941]">
                            <div className="flex items-center justify-between">
                                <span className="text-white-dark">{o.period.label}</span>
                                {o.paid_for_period ? (
                                    <span className="badge badge-soft-success">
                                        <CircleCheck className="h-3 w-3" /> Paid
                                    </span>
                                ) : (
                                    <span className="badge badge-soft-warning">Due {date(o.estimate.due_date)}</span>
                                )}
                            </div>
                            {o.estimate.base !== null && (
                                <div className="mt-1 text-xs text-white-dark">
                                    {o.basis === 'percent_of_turnover' ? 'Turnover' : 'Gross payroll'}: {money(o.estimate.base, cur)} × {Number(o.rate)}%
                                </div>
                            )}
                            <div className="mt-1 text-lg font-extrabold">{money(o.estimate.amount, cur)}</div>
                        </div>
                        {o.notes && <p className="mb-3 text-xs text-white-dark">{o.notes}</p>}
                        {o.source_url && (
                            <a href={o.source_url} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" /> Legal reference
                            </a>
                        )}
                        {canManage && (
                            <div className="mt-auto flex flex-wrap items-center gap-2">
                                {o.is_active && (
                                    <button className="btn btn-sm btn-success" onClick={() => setPaying(o)}>
                                        <Receipt className="h-3.5 w-3.5" /> Record payment
                                    </button>
                                )}
                                <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing(o)}>
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                </button>
                                <DeleteButton href={`/accounting/compliance/${o.id}`} label="obligation" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="panel">
                <h5 className="mb-4 text-lg font-bold">Payment history</h5>
                <DataTable columns={columns} paginated={payments} empty="No levy payments recorded yet" />
            </div>

            {editing && <ObligationModal obligation={editing === 'new' ? null : editing} accounts={expenseAccounts} onClose={() => setEditing(null)} />}
            {paying && <PayModal obligation={paying} cashAccounts={cashAccounts} onClose={() => setPaying(null)} />}
        </>
    );
}

function ObligationModal({ obligation, accounts, onClose }: { obligation: Obligation | null; accounts: Option[]; onClose: () => void }) {
    const form = useForm({
        name: obligation?.name ?? '',
        authority: obligation?.authority ?? '',
        basis: obligation?.basis ?? 'fixed',
        rate: obligation?.rate ?? '',
        amount: obligation?.amount ?? '',
        frequency: obligation?.frequency ?? 'annual',
        due_day: obligation?.due_day ? String(obligation.due_day) : '',
        expense_account_id: obligation?.expense_account_id ? String(obligation.expense_account_id) : '',
        is_active: obligation?.is_active ?? true,
        source_url: obligation?.source_url ?? '',
        notes: obligation?.notes ?? '',
    });
    const err = form.errors as Record<string, string>;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: onClose };
        if (obligation) form.put(`/accounting/compliance/${obligation.id}`, opts);
        else form.post('/accounting/compliance', opts);
    };

    return (
        <Modal open onClose={onClose} title={obligation ? `Edit ${obligation.name}` : 'Add levy, fee or licence'} size="lg">
            <form onSubmit={submit} className="space-y-4">
                <FormGrid>
                    <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={err.name} />
                    <Input label="Authority" required value={form.data.authority} onChange={(e) => form.setData('authority', e.target.value)} error={err.authority} placeholder="e.g. Kinondoni Municipal Council" />
                    <Select
                        label="Basis"
                        value={form.data.basis}
                        onChange={(e) => form.setData('basis', e.target.value as Obligation['basis'])}
                        options={Object.entries(basisLabel).map(([value, label]) => ({ value, label }))}
                    />
                    {form.data.basis === 'fixed' ? (
                        <Input label="Amount per period (TZS)" type="number" min={0} value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value)} error={err.amount} />
                    ) : (
                        <Input label="Rate (%)" type="number" step="0.0001" min={0} max={100} value={form.data.rate} onChange={(e) => form.setData('rate', e.target.value)} error={err.rate} />
                    )}
                    <Select
                        label="Frequency"
                        value={form.data.frequency}
                        onChange={(e) => form.setData('frequency', e.target.value as Obligation['frequency'])}
                        options={['monthly', 'quarterly', 'semi_annual', 'annual'].map((f) => ({ value: f, label: titleCase(f) }))}
                    />
                    <Input
                        label="Due day (of the month after the period)"
                        type="number"
                        min={1}
                        max={31}
                        value={form.data.due_day}
                        onChange={(e) => form.setData('due_day', e.target.value)}
                        error={err.due_day}
                    />
                    <Select label="Expense account" placeholder="Statutory levies (6140)" value={form.data.expense_account_id} onChange={(e) => form.setData('expense_account_id', e.target.value)} options={accounts} />
                    <Input label="Legal reference URL" value={form.data.source_url} onChange={(e) => form.setData('source_url', e.target.value)} error={err.source_url} />
                </FormGrid>
                <Textarea label="Notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
                <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active" />
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        Save
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function PayModal({ obligation, cashAccounts, onClose }: { obligation: Obligation; cashAccounts: Option[]; onClose: () => void }) {
    const form = useForm({
        period_start: obligation.period.start,
        period_end: obligation.period.end,
        base_amount: obligation.estimate.base ?? '',
        amount: obligation.estimate.amount,
        paid_on: today(),
        reference: '',
        payment_account_id: String(cashAccounts.find((a) => a.label.includes('CRDB'))?.value ?? cashAccounts[0]?.value ?? ''),
    });
    const err = form.errors as Record<string, string>;

    const recalc = async (start: string, end: string) => {
        if (obligation.basis === 'fixed') return;
        const res = await fetch(`/accounting/compliance/${obligation.id}/estimate?period_start=${start}&period_end=${end}`, { headers: { Accept: 'application/json' } });
        if (res.ok) {
            const data = (await res.json()) as { base: string; amount: string };
            form.setData((d) => ({ ...d, period_start: start, period_end: end, base_amount: data.base, amount: data.amount }));
        }
    };

    return (
        <Modal open onClose={onClose} title={`Record payment — ${obligation.name}`} size="lg">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post(`/accounting/compliance/${obligation.id}/pay`, { preserveScroll: true, onSuccess: onClose });
                }}
                className="space-y-4"
            >
                <FormGrid>
                    <Input
                        label="Period start"
                        type="date"
                        value={form.data.period_start}
                        onChange={(e) => {
                            form.setData('period_start', e.target.value);
                            void recalc(e.target.value, form.data.period_end);
                        }}
                        error={err.period_start}
                    />
                    <Input
                        label="Period end"
                        type="date"
                        value={form.data.period_end}
                        onChange={(e) => {
                            form.setData('period_end', e.target.value);
                            void recalc(form.data.period_start, e.target.value);
                        }}
                        error={err.period_end}
                    />
                    {obligation.basis !== 'fixed' && (
                        <Input
                            label={obligation.basis === 'percent_of_turnover' ? 'Turnover for the period' : 'Gross payroll for the period'}
                            type="number"
                            value={form.data.base_amount}
                            onChange={(e) => form.setData((d) => ({ ...d, base_amount: e.target.value, amount: ((Number(e.target.value) * Number(obligation.rate)) / 100).toFixed(2) }))}
                            help={`× ${Number(obligation.rate)}% = ${money(form.data.amount, '')}`}
                        />
                    )}
                    <Input label="Amount paid (TZS)" type="number" step="0.01" min={0} value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value)} error={err.amount} />
                    <Input label="Paid on" type="date" value={form.data.paid_on} onChange={(e) => form.setData('paid_on', e.target.value)} error={err.paid_on} />
                    <Select label="Paid from" value={form.data.payment_account_id} onChange={(e) => form.setData('payment_account_id', e.target.value)} options={cashAccounts} error={err.payment_account_id} />
                    <Input label="Receipt / control number" value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} wrapperClassName="sm:col-span-2" />
                </FormGrid>
                <p className="text-xs text-white-dark">Posting: Dr {obligation.expense_account ?? 'Statutory levies'} / Cr the selected cash or bank account.</p>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-success" disabled={form.processing}>
                        <Receipt className="h-4 w-4" /> Record & post
                    </button>
                </div>
            </form>
        </Modal>
    );
}
