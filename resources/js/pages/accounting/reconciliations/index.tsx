import { Link, useForm } from '@inertiajs/react';
import { CheckCircle2, Landmark, PlayCircle, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { DateInput } from '@/components/ui/date-picker';
import { Field, FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cn, date, money, today } from '@/lib/utils';
import { Amt } from '../_components/report';

type AccountCard = {
    id: number;
    code: string;
    name: string;
    sub_type: string;
    is_active: boolean;
    book_balance: string;
    last_statement_date: string | null;
    last_closing: string | null;
    draft_id: number | null;
    suggested_opening: string;
    unreconciled: number;
};

export type RecRow = {
    id: number;
    account_id: number;
    account: string | null;
    statement_date: string;
    opening_balance: string;
    closing_balance: string;
    book_balance: string | null;
    status: string;
    prepared_by: number | null;
    preparer: string | null;
    reviewer: string | null;
    completed_at: string | null;
    reviewed_at: string | null;
};

export default function ReconciliationsIndex({ accounts, history }: { accounts: AccountCard[]; history: RecRow[] }) {
    const can = useCan();
    const manage = can('accounting.manage');
    const [starting, setStarting] = useState<AccountCard | null>(null);
    const form = useForm({ account_id: '', statement_date: today(), opening_balance: '', closing_balance: '', notes: '' });

    const start = (a: AccountCard) => {
        form.clearErrors();
        form.setData({ account_id: String(a.id), statement_date: today(), opening_balance: a.suggested_opening, closing_balance: '', notes: '' });
        setStarting(a);
    };
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/accounting/reconciliations', { onSuccess: () => setStarting(null) });
    };

    const daysSince = (d: string | null) => (d ? Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000) : null);

    const columns: Column<RecRow>[] = [
        {
            key: 'account',
            header: 'Account',
            render: (r) => (
                <Link href={`/accounting/reconciliations/${r.id}`} className="font-semibold text-primary hover:underline">
                    {r.account}
                </Link>
            ),
        },
        { key: 'date', header: 'Statement date', render: (r) => date(r.statement_date) },
        { key: 'closing', header: 'Statement closing', align: 'right', render: (r) => <Amt value={r.closing_balance} /> },
        {
            key: 'book',
            header: 'Book balance',
            align: 'right',
            render: (r) => (r.book_balance !== null ? <Amt value={r.book_balance} /> : <span className="text-white-dark">—</span>),
        },
        {
            key: 'status',
            header: 'Status',
            render: (r) => (
                <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={r.status} label={r.status === 'draft' ? 'In progress' : undefined} />
                    {r.reviewer && (
                        <span className="badge badge-soft-success inline-flex items-center gap-1" title={`Reviewed by ${r.reviewer}`}>
                            <ShieldCheck className="h-3 w-3" /> Reviewed
                        </span>
                    )}
                    {r.status === 'completed' && !r.reviewer && <span className="badge badge-soft-warning">Awaiting review</span>}
                </div>
            ),
        },
        { key: 'by', header: 'Prepared / reviewed by', render: (r) => <span className="text-sm">{[r.preparer, r.reviewer].filter(Boolean).join(' / ') || '—'}</span> },
    ];

    return (
        <>
            <PageHeader
                title="Bank Reconciliation"
                subtitle="Match each bank and mobile-money account against its statement, so the books are proven to agree with the bank."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Bank Reconciliation' }]}
            />

            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {accounts.map((a) => {
                    const age = daysSince(a.last_statement_date);
                    const Icon = a.sub_type === 'mobile_money' ? Smartphone : Landmark;
                    return (
                        <div key={a.id} className={cn('panel flex flex-col', !a.is_active && 'opacity-60')}>
                            <div className="mb-3 flex items-start gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-primary-light text-primary dark:bg-primary-dark-light">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <div className="truncate font-bold text-black dark:text-white-light">{a.name}</div>
                                    <div className="font-mono text-xs text-white-dark">{a.code}</div>
                                </div>
                            </div>
                            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Book balance</div>
                                    <div className="font-mono font-bold">{money(a.book_balance)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Reconciled to</div>
                                    {a.last_statement_date ? (
                                        <div className={cn('font-semibold', age !== null && age > 45 ? 'text-danger' : age !== null && age > 35 ? 'text-warning' : 'text-success')}>
                                            {date(a.last_statement_date)}
                                        </div>
                                    ) : (
                                        <div className="font-semibold text-danger">Never</div>
                                    )}
                                </div>
                            </div>
                            <div className="mb-4 text-xs text-white-dark">{a.unreconciled} ledger entries not yet matched to a statement</div>
                            <div className="mt-auto">
                                {a.draft_id ? (
                                    <Link href={`/accounting/reconciliations/${a.draft_id}`} className="btn btn-warning w-full">
                                        <PlayCircle className="h-4 w-4" /> Continue reconciliation
                                    </Link>
                                ) : manage ? (
                                    <button className="btn btn-primary w-full" onClick={() => start(a)}>
                                        <CheckCircle2 className="h-4 w-4" /> Reconcile a statement
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
                {accounts.length === 0 && <p className="text-sm text-white-dark">No bank or mobile-money accounts in the chart of accounts.</p>}
            </div>

            <div className="panel">
                <h5 className="mb-4 text-lg font-bold">Reconciliation history</h5>
                <DataTable
                    columns={columns}
                    rows={history}
                    empty="No reconciliations yet"
                    emptyDescription="Reconcile each bank and mobile-money account every month when the statement arrives."
                />
            </div>

            <Modal open={!!starting} onClose={() => setStarting(null)} title={`Reconcile ${starting?.name ?? ''}`}>
                <form onSubmit={submit} className="space-y-4">
                    <p className="text-sm text-white-dark">Enter the figures exactly as they appear on the bank or mobile-money statement.</p>
                    <Field label="Statement end date" required error={form.errors.statement_date}>
                        <DateInput className="form-input" value={form.data.statement_date} max={today()} onChange={(e) => form.setData('statement_date', e.target.value)} />
                    </Field>
                    <FormGrid>
                        <Input
                            label="Opening balance (statement)"
                            type="number"
                            step="any"
                            required
                            value={form.data.opening_balance}
                            onChange={(e) => form.setData('opening_balance', e.target.value)}
                            error={form.errors.opening_balance}
                            help={starting?.last_closing ? 'Carried from the last reconciliation.' : 'Suggested from the opening balance in the books.'}
                        />
                        <Input
                            label="Closing balance (statement)"
                            type="number"
                            step="any"
                            required
                            value={form.data.closing_balance}
                            onChange={(e) => form.setData('closing_balance', e.target.value)}
                            error={form.errors.closing_balance}
                        />
                    </FormGrid>
                    <Input
                        label="Notes"
                        value={form.data.notes}
                        onChange={(e) => form.setData('notes', e.target.value)}
                        error={form.errors.notes}
                        placeholder="e.g. October 2026 statement"
                    />
                    {form.errors.account_id && <p className="text-sm text-danger">{form.errors.account_id}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setStarting(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Start reconciling
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
