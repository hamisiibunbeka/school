import { Link, router, useForm } from '@inertiajs/react';
import { Ban, CalendarClock, CheckCircle2, Download, Hourglass, Plus, Receipt, Wallet, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { compact, date, exportCsv, money, num, titleCase, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { Amt, showErrors } from '../_components/report';

export type ExpenseRow = {
    id: number;
    voucher_no: string;
    date: string;
    expense_account_id: number;
    expense_account: string | null;
    payment_account_id: number;
    payment_account: string | null;
    supplier_id: number | null;
    supplier: string | null;
    payee: string | null;
    payee_name: string;
    amount: string;
    description: string;
    reference: string | null;
    payment_method: string;
    status: string;
    created_by: number | null;
    creator: string | null;
    approver: string | null;
    journal_id: number | null;
    can_approve: boolean;
};

type Props = {
    expenses: Paginated<ExpenseRow>;
    filters: { search: string; status: string; account: string; method: string; from: string; to: string };
    stats: { pending: number; pending_amount: string; paid_month: string; paid_year: string; rejected: number };
    byAccount: { name: string; total: string }[];
    statuses: Option[];
    methods: Option[];
    expenseAccounts: Option[];
    cashAccounts: Option[];
    suppliers: Option[];
};

const blank = { date: today(), expense_account_id: '', payment_account_id: '', supplier_id: '', payee: '', amount: '', description: '', reference: '', payment_method: 'bank_transfer' };

export default function ExpensesIndex({ expenses, filters: initial, stats, byAccount, statuses, methods, expenseAccounts, cashAccounts, suppliers }: Props) {
    const can = useCan();
    const manage = can('accounting.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ExpenseRow | null>(null);
    const [rejecting, setRejecting] = useState<ExpenseRow | null>(null);
    const form = useForm(blank);
    const rejectForm = useForm({ reason: '' });

    const openForm = (e: ExpenseRow | null) => {
        setEditing(e);
        form.clearErrors();
        form.setData(
            e
                ? {
                      date: e.date,
                      expense_account_id: String(e.expense_account_id),
                      payment_account_id: String(e.payment_account_id),
                      supplier_id: e.supplier_id ? String(e.supplier_id) : '',
                      payee: e.payee ?? '',
                      amount: String(Number(e.amount)),
                      description: e.description,
                      reference: e.reference ?? '',
                      payment_method: e.payment_method,
                  }
                : blank,
        );
        setOpen(true);
    };

    const submit = (ev: FormEvent) => {
        ev.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/accounting/expenses/${editing.id}`, opts);
        else form.post('/accounting/expenses', opts);
    };

    const approve = async (e: ExpenseRow) => {
        const { confirmed } = await confirm({
            title: `Approve ${e.voucher_no}?`,
            text: `Pay ${money(e.amount)} to ${e.payee_name}. This posts Dr ${e.expense_account} / Cr ${e.payment_account}.`,
            confirmText: 'Approve & pay',
        });
        if (confirmed) router.post(`/accounting/expenses/${e.id}/approve`, {}, { preserveScroll: true, onError: showErrors });
    };

    const columns: Column<ExpenseRow>[] = [
        {
            key: 'voucher',
            header: 'Voucher',
            render: (e) => (
                <div>
                    <Link href={`/accounting/expenses/${e.id}`} className="font-mono font-bold text-primary hover:underline">
                        {e.voucher_no}
                    </Link>
                    <div className="text-xs text-white-dark">{date(e.date)}</div>
                </div>
            ),
        },
        {
            key: 'payee',
            header: 'Payee / Description',
            render: (e) => (
                <div className="max-w-xs">
                    <div className="font-semibold text-black dark:text-white-light">{e.payee_name}</div>
                    <div className="line-clamp-1 text-xs text-white-dark">{e.description}</div>
                </div>
            ),
        },
        { key: 'account', header: 'Expense account', render: (e) => <span className="text-xs">{e.expense_account}</span> },
        {
            key: 'paid_from',
            header: 'Paid from',
            render: (e) => (
                <div className="text-xs">
                    <div>{e.payment_account}</div>
                    <div className="text-white-dark">{titleCase(e.payment_method)}</div>
                </div>
            ),
        },
        { key: 'amount', header: 'Amount', align: 'right', render: (e) => <Amt value={e.amount} bold /> },
        {
            key: 'status',
            header: 'Status',
            render: (e) => (
                <div>
                    <StatusBadge status={e.status} />
                    <div className="mt-0.5 text-[11px] text-white-dark">{e.approver ? `by ${e.approver}` : e.creator ? `raised by ${e.creator}` : ''}</div>
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (e) => (
                <RowActions view={`/accounting/expenses/${e.id}`} onEdit={manage && e.status === 'pending' ? () => openForm(e) : undefined}>
                    {e.can_approve && (
                        <>
                            <IconButton icon={CheckCircle2} title="Approve & pay" className="text-success" onClick={() => approve(e)} />
                            <IconButton
                                icon={XCircle}
                                title="Reject"
                                className="text-danger"
                                onClick={() => {
                                    rejectForm.reset();
                                    setRejecting(e);
                                }}
                            />
                        </>
                    )}
                </RowActions>
            ),
        },
    ];

    const exportRows = () =>
        exportCsv('payment-vouchers', [
            ['Voucher', 'Date', 'Payee', 'Description', 'Expense account', 'Paid from', 'Method', 'Reference', 'Amount', 'Status'],
            ...expenses.data.map((e) => [e.voucher_no, e.date, e.payee_name, e.description, e.expense_account, e.payment_account, e.payment_method, e.reference, e.amount, e.status]),
        ]);

    return (
        <>
            <PageHeader
                title="Expenses & Payment Vouchers"
                subtitle="Raise vouchers, approve with separation of duties, and post payments to the ledger."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Expenses' }]}
                actions={
                    <>
                        <button type="button" className="btn btn-outline-primary" onClick={exportRows}>
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        {manage && (
                            <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> New voucher
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="grid grid-cols-2 gap-4 xl:col-span-2">
                    <button type="button" className="text-start" onClick={() => setFilter('status', 'pending')}>
                        <StatCard title="Awaiting approval" value={num(stats.pending)} icon={Hourglass} tone="warning" hint={money(stats.pending_amount)} />
                    </button>
                    <StatCard title="Paid this month" value={money(stats.paid_month)} icon={CalendarClock} tone="primary" />
                    <StatCard title="Paid this year" value={money(stats.paid_year)} icon={Wallet} tone="success" />
                    <button type="button" className="text-start" onClick={() => setFilter('status', 'rejected')}>
                        <StatCard title="Rejected" value={num(stats.rejected)} icon={Ban} tone="danger" />
                    </button>
                </div>
                <div className="panel">
                    <h6 className="mb-2 text-sm font-bold text-black dark:text-white-light">Paid expenses by account (YTD)</h6>
                    {byAccount.length ? (
                        <Chart
                            type="donut"
                            height={220}
                            series={byAccount.slice(0, 8).map((b) => Number(b.total))}
                            options={{
                                labels: byAccount.slice(0, 8).map((b) => b.name),
                                legend: { show: false },
                                stroke: { show: false },
                                tooltip: { y: { formatter: (v: number) => money(v) } },
                                plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Total', formatter: (w) => compact(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)) } } } } },
                            }}
                        />
                    ) : (
                        <div className="grid h-[220px] place-content-center text-sm text-white-dark">
                            <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
                            No paid vouchers yet
                        </div>
                    )}
                </div>
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Voucher, payee, description…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="All statuses" />
                    <FilterSelect value={filters.account} onChange={(v) => setFilter('account', v)} options={expenseAccounts} placeholder="All expense accounts" />
                    <FilterSelect value={filters.method} onChange={(v) => setFilter('method', v)} options={methods} placeholder="Any method" />
                    <input type="date" className="form-input w-full sm:w-40" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} title="From" />
                    <input type="date" className="form-input w-full sm:w-40" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} title="To" />
                </FilterBar>
                <DataTable columns={columns} paginated={expenses} empty="No vouchers found" emptyDescription="Try other filters or raise a new payment voucher." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit voucher ${editing.voucher_no}` : 'New payment voucher'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Date" type="date" required value={form.data.date} onChange={(e) => form.setData('date', e.target.value)} error={form.errors.date} />
                        <Input label={`Amount (${'TZS'})`} required inputMode="decimal" value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value.replace(/[^0-9.]/g, ''))} error={form.errors.amount} />
                        <Select label="Expense account" required value={form.data.expense_account_id} onChange={(e) => form.setData('expense_account_id', e.target.value)} options={expenseAccounts} placeholder="Select…" error={form.errors.expense_account_id} />
                        <Select label="Paid from (cash / bank)" required value={form.data.payment_account_id} onChange={(e) => form.setData('payment_account_id', e.target.value)} options={cashAccounts} placeholder="Select…" error={form.errors.payment_account_id} />
                        <Select label="Supplier" value={form.data.supplier_id} onChange={(e) => form.setData('supplier_id', e.target.value)} options={suppliers} placeholder="— not a registered supplier —" error={form.errors.supplier_id} />
                        <Input label="Payee name" value={form.data.payee} onChange={(e) => form.setData('payee', e.target.value)} error={form.errors.payee} help="Required when no supplier is chosen" />
                        <Select label="Payment method" required value={form.data.payment_method} onChange={(e) => form.setData('payment_method', e.target.value)} options={methods} error={form.errors.payment_method} />
                        <Input label="Reference (cheque / invoice / txn no.)" value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} error={form.errors.reference} />
                        <Textarea label="Description" required value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} wrapperClassName="sm:col-span-2" rows={2} />
                    </FormGrid>
                    <p className="text-xs text-white-dark">The voucher stays pending until a different user approves it; approval posts Dr expense / Cr cash-bank to the ledger.</p>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {editing ? 'Save changes' : 'Raise voucher'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.voucher_no ?? ''}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        rejectForm.post(`/accounting/expenses/${rejecting?.id}/reject`, { preserveScroll: true, onSuccess: () => setRejecting(null), onError: showErrors });
                    }}
                >
                    <Textarea label="Reason" required value={rejectForm.data.reason} onChange={(e) => rejectForm.setData('reason', e.target.value)} error={rejectForm.errors.reason} rows={3} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setRejecting(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-danger" disabled={rejectForm.processing}>
                            Reject voucher
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
