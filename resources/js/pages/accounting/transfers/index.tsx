import { Link, router, useForm } from '@inertiajs/react';
import { ArrowRight, ArrowRightLeft, CheckCircle2, Hourglass, Landmark, Plus, Receipt, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { DateInput, DateRangePicker } from '@/components/ui/date-picker';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, money, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { Amt, showErrors } from '../_components/report';

export type TransferRow = {
    id: number;
    transfer_no: string;
    date: string;
    from_account_id: number;
    from_account: string | null;
    to_account_id: number;
    to_account: string | null;
    amount: string;
    charges: string;
    charge_account_id: number | null;
    total_out: string;
    method: string;
    reference: string | null;
    description: string;
    status: string;
    created_by: number | null;
    creator: string | null;
    approver: string | null;
    journal_id: number | null;
    can_approve: boolean;
};

type CashAccount = Option & { sub_type: string; balance: string };

type Props = {
    transfers: Paginated<TransferRow>;
    filters: { search: string; status: string; account: string; from: string; to: string };
    stats: { pending: number; pending_amount: string; posted_month: string; charges_month: string };
    accounts: CashAccount[];
    chargeAccounts: Option[];
    defaultChargeAccount: number | null;
    methods: Option[];
    statuses: Option[];
};

const blank = { date: today(), from_account_id: '', to_account_id: '', amount: '', charges: '', charge_account_id: '', method: 'bank_transfer', reference: '', description: '' };

export default function TransfersIndex({ transfers, filters: initial, stats, accounts, chargeAccounts, defaultChargeAccount, methods, statuses }: Props) {
    const can = useCan();
    const manage = can('accounting.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [editing, setEditing] = useState<TransferRow | 'new' | null>(null);
    const form = useForm(blank);

    const from = accounts.find((a) => String(a.value) === String(form.data.from_account_id));
    const totalOut = Number(form.data.amount || 0) + Number(form.data.charges || 0);
    const short = from && from.sub_type !== 'bank' && totalOut > Number(from.balance);
    const overdraft = from && from.sub_type === 'bank' && totalOut > Number(from.balance);

    const open = (t: TransferRow | 'new') => {
        form.clearErrors();
        form.setData(
            t === 'new'
                ? { ...blank, charge_account_id: defaultChargeAccount ? String(defaultChargeAccount) : '' }
                : {
                      date: t.date,
                      from_account_id: String(t.from_account_id),
                      to_account_id: String(t.to_account_id),
                      amount: t.amount,
                      charges: Number(t.charges) ? t.charges : '',
                      charge_account_id: t.charge_account_id ? String(t.charge_account_id) : defaultChargeAccount ? String(defaultChargeAccount) : '',
                      method: t.method,
                      reference: t.reference ?? '',
                      description: t.description,
                  },
        );
        setEditing(t);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setEditing(null) };
        if (editing === 'new') form.post('/accounting/transfers', opts);
        else if (editing) form.put(`/accounting/transfers/${editing.id}`, opts);
    };

    const approve = async (t: TransferRow) => {
        const { confirmed } = await confirm({
            title: `Approve ${t.transfer_no}?`,
            text: `Move ${money(t.amount)} from ${t.from_account} to ${t.to_account}${Number(t.charges) ? ` (+ ${money(t.charges)} charges)` : ''} and post it to the ledger.`,
            confirmText: 'Approve & post',
        });
        if (confirmed) router.post(`/accounting/transfers/${t.id}/approve`, {}, { preserveScroll: true, onError: showErrors });
    };
    const reject = async (t: TransferRow) => {
        const { confirmed, value } = await confirm({ title: `Reject ${t.transfer_no}?`, input: 'textarea', inputPlaceholder: 'Reason', confirmText: 'Reject', danger: true });
        if (confirmed) router.post(`/accounting/transfers/${t.id}/reject`, { reason: value }, { preserveScroll: true, onError: showErrors });
    };

    const columns: Column<TransferRow>[] = [
        {
            key: 'no',
            header: 'Transfer',
            render: (t) => (
                <Link href={`/accounting/transfers/${t.id}`} className="block">
                    <div className="font-mono font-bold text-primary">{t.transfer_no}</div>
                    <div className="text-xs text-white-dark">{date(t.date)}</div>
                </Link>
            ),
        },
        {
            key: 'route',
            header: 'From → To',
            render: (t) => (
                <div className="text-sm">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                        {t.from_account} <ArrowRight className="h-3.5 w-3.5 text-white-dark" /> {t.to_account}
                    </div>
                    <div className="line-clamp-1 max-w-sm text-xs text-white-dark">
                        {t.description}
                        {t.reference ? ` · Ref ${t.reference}` : ''}
                    </div>
                </div>
            ),
        },
        { key: 'amount', header: 'Amount', align: 'right', render: (t) => <Amt value={t.amount} bold /> },
        { key: 'charges', header: 'Charges', align: 'right', render: (t) => (Number(t.charges) ? <Amt value={t.charges} /> : <span className="text-white-dark">—</span>) },
        {
            key: 'status',
            header: 'Status',
            render: (t) => (
                <div>
                    <StatusBadge status={t.status} />
                    <div className="mt-0.5 text-xs text-white-dark">{t.status === 'pending' ? `by ${t.creator ?? '—'}` : t.approver ? `by ${t.approver}` : ''}</div>
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (t) => (
                <div className="flex justify-end gap-1">
                    {t.can_approve && (
                        <>
                            <IconButton icon={CheckCircle2} title="Approve & post" className="text-success" onClick={() => approve(t)} />
                            <IconButton icon={XCircle} title="Reject" className="text-danger" onClick={() => reject(t)} />
                        </>
                    )}
                    <RowActions
                        view={`/accounting/transfers/${t.id}`}
                        onEdit={manage && t.status === 'pending' ? () => open(t) : undefined}
                        destroy={manage && ['pending', 'rejected'].includes(t.status) ? `/accounting/transfers/${t.id}` : undefined}
                        label="transfer"
                    />
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Fund Transfers"
                subtitle="Move money between the school's own cash, bank and mobile-money accounts — banking cash, sweeping M-Pesa collections, moving funds between banks."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Fund Transfers' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => open('new')}>
                            <Plus className="h-4 w-4" /> New transfer
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard
                    title="Awaiting approval"
                    value={String(stats.pending)}
                    icon={Hourglass}
                    tone={stats.pending ? 'warning' : 'success'}
                    hint={money(stats.pending_amount)}
                />
                <StatCard title="Transferred this month" value={money(stats.posted_month)} icon={ArrowRightLeft} tone="primary" />
                <StatCard title="Transfer charges (month)" value={money(stats.charges_month)} icon={Receipt} tone="danger" />
                <StatCard title="Cash & bank accounts" value={String(accounts.length)} icon={Landmark} tone="info" hint="Available for transfers" />
            </div>

            <div className="panel">
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Transfer no., reference…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                    <FilterSelect value={filters.account} onChange={(v) => setFilter('account', v)} options={accounts} placeholder="Any account" />
                    <DateRangePicker
                        from={filters.from}
                        to={filters.to}
                        onChange={(f, t) => {
                            setFilter('from', f);
                            setFilter('to', t);
                        }}
                    />
                </FilterBar>
                <DataTable
                    columns={columns}
                    paginated={transfers}
                    empty="No transfers yet"
                    emptyDescription="Record money moved between your cash, bank and mobile-money accounts."
                />
            </div>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New fund transfer' : 'Edit transfer'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Select
                            label="From account"
                            required
                            placeholder="Money leaves…"
                            options={accounts.map((a) => ({ value: a.value, label: `${a.label} (${money(a.balance)})` }))}
                            value={form.data.from_account_id}
                            onChange={(e) => form.setData('from_account_id', e.target.value)}
                            error={form.errors.from_account_id}
                        />
                        <Select
                            label="To account"
                            required
                            placeholder="Money arrives…"
                            options={accounts
                                .filter((a) => String(a.value) !== form.data.from_account_id)
                                .map((a) => ({ value: a.value, label: `${a.label} (${money(a.balance)})` }))}
                            value={form.data.to_account_id}
                            onChange={(e) => form.setData('to_account_id', e.target.value)}
                            error={form.errors.to_account_id}
                        />
                        <Input
                            label="Amount"
                            type="number"
                            min={1}
                            step="any"
                            required
                            value={form.data.amount}
                            onChange={(e) => form.setData('amount', e.target.value)}
                            error={form.errors.amount}
                        />
                        <Field label="Date" required error={form.errors.date}>
                            <DateInput className="form-input" value={form.data.date} max={today()} onChange={(e) => form.setData('date', e.target.value)} />
                        </Field>
                        <Select
                            label="Method"
                            required
                            options={methods}
                            value={form.data.method}
                            onChange={(e) => form.setData('method', e.target.value)}
                            error={form.errors.method}
                        />
                        <Input
                            label="Reference"
                            value={form.data.reference}
                            onChange={(e) => form.setData('reference', e.target.value)}
                            error={form.errors.reference}
                            placeholder="Deposit slip / transaction ID"
                        />
                    </FormGrid>

                    <div className="rounded-md border border-dashed border-white-light p-3 dark:border-[#1b2e4b]">
                        <div className="mb-2 text-xs font-bold tracking-wide text-white-dark uppercase">Bank / transfer charges (optional)</div>
                        <FormGrid>
                            <Input
                                label="Charges"
                                type="number"
                                min={0}
                                step="any"
                                value={form.data.charges}
                                onChange={(e) => form.setData('charges', e.target.value)}
                                error={form.errors.charges}
                                help="Deducted from the source account on top of the amount."
                            />
                            <Select
                                label="Charge expense account"
                                placeholder="Choose account"
                                options={chargeAccounts}
                                value={form.data.charge_account_id}
                                onChange={(e) => form.setData('charge_account_id', e.target.value)}
                                error={form.errors.charge_account_id}
                            />
                        </FormGrid>
                    </div>

                    <Input
                        label="Description"
                        required
                        value={form.data.description}
                        onChange={(e) => form.setData('description', e.target.value)}
                        error={form.errors.description}
                        placeholder="e.g. Banking of cash fees collections"
                    />

                    {from && totalOut > 0 && (
                        <div
                            className={`rounded-md p-3 text-sm ${short ? 'bg-danger-light text-danger dark:bg-danger-dark-light' : overdraft ? 'bg-warning-light text-warning dark:bg-warning-dark-light' : 'bg-primary-light dark:bg-primary-dark-light'}`}
                        >
                            {money(totalOut)} leaves {from.label}; balance now {money(from.balance)}.
                            {short && ' Not enough funds — cash and mobile-money accounts cannot go below zero, so approval will be refused.'}
                            {overdraft && ' This will overdraw the bank account.'}
                        </div>
                    )}
                    <p className="text-xs text-white-dark">The transfer is posted to the ledger only after a different user with accounting rights approves it.</p>

                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {editing === 'new' ? 'Submit for approval' : 'Save changes'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
