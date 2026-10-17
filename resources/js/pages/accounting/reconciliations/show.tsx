import { Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, ListChecks, Lock, LockOpen, Pencil, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PrintButton } from '@/components/ui/actions';
import { DateInput } from '@/components/ui/date-picker';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import Letterhead from '@/components/ui/letterhead';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, dateTime, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import { Amt, fmt, showErrors } from '../_components/report';
import { AuditTrail, Signature, type Audit } from '../_components/shared';
import type { RecRow } from './index';

type Line = {
    id: number;
    journal_id: number;
    journal_no: string;
    date: string;
    type: string;
    reference: string | null;
    narration: string | null;
    debit: string;
    credit: string;
    cleared: boolean;
};
type Outstanding = { id: number; date: string; journal_no: string; reference: string | null; narration: string | null; debit: string; credit: string };
type Summary = {
    cleared_in: string;
    cleared_out: string;
    computed_closing: string;
    difference: string;
    in_transit: string;
    unpresented: string;
    adjusted_balance: string;
    book_balance: string;
    unexplained: string;
};
type Props = {
    reconciliation: RecRow & { account_sub_type: string; notes: string | null; can_review: boolean; can_reopen: boolean };
    summary: Summary;
    lines: Line[];
    outstanding: Outstanding[];
    counterAccounts: Option[];
    defaults: { charges: number | null; income: number | null };
    audits: Audit[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function Figure({ label, value, tone, hint }: { label: string; value: number | string; tone?: string; hint?: string }) {
    return (
        <div className="rounded-lg border border-white-light p-3 dark:border-[#1b2e4b]">
            <div className="text-[11px] font-bold tracking-wide text-white-dark uppercase">{label}</div>
            <div className={cn('font-mono text-lg font-extrabold', tone)}>{fmt(value)}</div>
            {hint && <div className="text-[11px] text-white-dark">{hint}</div>}
        </div>
    );
}

export default function ReconciliationShow({ reconciliation: rec, summary, lines, outstanding, counterAccounts, defaults, audits }: Props) {
    const can = useCan();
    const manage = can('accounting.manage');
    const draft = rec.status === 'draft';
    const editable = draft && manage;

    const serverCleared = lines.filter((l) => l.cleared).map((l) => l.id);
    const [cleared, setCleared] = useState<Set<number>>(() => new Set(serverCleared));
    const [search, setSearch] = useState('');
    const [view, setView] = useState('all');
    const [upTo, setUpTo] = useState(rec.statement_date);
    const [modal, setModal] = useState<'entry' | 'details' | null>(null);
    const [busy, setBusy] = useState(false);

    // Re-sync after the server changes the list (statement entry posted, details edited, saved).
    const serverKey = serverCleared.join(',') + '|' + lines.length;
    useEffect(() => {
        setCleared(new Set(serverCleared));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverKey]);

    const dirty = serverCleared.length !== cleared.size || serverCleared.some((id) => !cleared.has(id));

    let clearedIn = 0;
    let clearedOut = 0;
    let inTransit = 0;
    let unpresented = 0;
    for (const l of lines) {
        if (cleared.has(l.id)) {
            clearedIn += Number(l.debit);
            clearedOut += Number(l.credit);
        } else {
            inTransit += Number(l.debit);
            unpresented += Number(l.credit);
        }
    }
    const computedClosing = r2(Number(rec.opening_balance) + clearedIn - clearedOut);
    const difference = draft ? r2(Number(rec.closing_balance) - computedClosing) : Number(summary.difference);
    const balanced = Math.abs(difference) < 0.005;

    const q = search.trim().toLowerCase();
    const visible = lines.filter((l) => {
        if (view === 'uncleared' && cleared.has(l.id)) return false;
        if (view === 'cleared' && !cleared.has(l.id)) return false;
        if (view === 'in' && !Number(l.debit)) return false;
        if (view === 'out' && !Number(l.credit)) return false;
        if (!q) return true;
        return [l.journal_no, l.reference, l.narration, fmt(l.debit), fmt(l.credit), String(Number(l.debit) || Number(l.credit))].some((v) => (v ?? '').toLowerCase().includes(q));
    });
    const allVisibleTicked = visible.length > 0 && visible.every((l) => cleared.has(l.id));

    const toggle = (id: number) =>
        setCleared((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const tickVisible = (on: boolean) =>
        setCleared((prev) => {
            const next = new Set(prev);
            visible.forEach((l) => (on ? next.add(l.id) : next.delete(l.id)));
            return next;
        });
    const tickUpTo = () =>
        setCleared((prev) => {
            const next = new Set(prev);
            lines.filter((l) => l.date <= upTo).forEach((l) => next.add(l.id));
            return next;
        });

    const ids = () => [...cleared];
    const done = { preserveScroll: true, onError: showErrors, onFinish: () => setBusy(false) };
    const save = () => {
        setBusy(true);
        router.put(`/accounting/reconciliations/${rec.id}/lines`, { line_ids: ids() }, done);
    };
    const complete = async () => {
        const { confirmed } = await confirm({
            title: 'Complete this reconciliation?',
            text: 'The ticked entries will be locked to this statement. A different user should then review and sign it off.',
            confirmText: 'Complete & lock',
        });
        if (!confirmed) return;
        setBusy(true);
        router.post(`/accounting/reconciliations/${rec.id}/complete`, { line_ids: ids() }, done);
    };
    const review = async () => {
        const { confirmed } = await confirm({ title: 'Sign off this reconciliation?', text: 'Confirm you have checked it against the statement.', confirmText: 'Sign off' });
        if (confirmed) router.post(`/accounting/reconciliations/${rec.id}/review`, {}, { preserveScroll: true, onError: showErrors });
    };
    const reopen = async () => {
        const { confirmed, value } = await confirm({
            title: 'Reopen this reconciliation?',
            text: 'It will be unlocked for changes and lose its review sign-off.',
            input: 'textarea',
            inputPlaceholder: 'Reason',
            confirmText: 'Reopen',
            danger: true,
        });
        if (confirmed) router.post(`/accounting/reconciliations/${rec.id}/reopen`, { reason: value }, { preserveScroll: true, onError: showErrors });
    };
    const destroy = async () => {
        const { confirmed } = await confirm({
            title: 'Delete this draft?',
            text: 'All ticks are released. Statement entries already posted stay in the ledger.',
            confirmText: 'Delete',
            danger: true,
        });
        if (confirmed) router.delete(`/accounting/reconciliations/${rec.id}`, { onError: showErrors });
    };

    const entry = useForm({ direction: 'out', date: rec.statement_date, amount: '', account_id: '', description: '', reference: '' });
    const openEntry = () => {
        entry.clearErrors();
        entry.setData({
            direction: 'out',
            date: rec.statement_date,
            amount: '',
            account_id: defaults.charges ? String(defaults.charges) : '',
            description: 'Bank charges',
            reference: '',
        });
        setModal('entry');
    };
    const submitEntry = (e: FormEvent) => {
        e.preventDefault();
        entry.transform((d) => ({ ...d, line_ids: ids() }));
        entry.post(`/accounting/reconciliations/${rec.id}/adjustment`, { preserveScroll: true, onSuccess: () => setModal(null) });
    };

    const details = useForm({ statement_date: rec.statement_date, opening_balance: rec.opening_balance, closing_balance: rec.closing_balance, notes: rec.notes ?? '' });
    const openDetails = () => {
        details.clearErrors();
        details.setData({ statement_date: rec.statement_date, opening_balance: rec.opening_balance, closing_balance: rec.closing_balance, notes: rec.notes ?? '' });
        setModal('details');
    };
    const submitDetails = (e: FormEvent) => {
        e.preventDefault();
        details.transform((d) => ({ ...d, line_ids: ids() }));
        details.put(`/accounting/reconciliations/${rec.id}`, { preserveScroll: true, onSuccess: () => setModal(null) });
    };

    return (
        <>
            <PageHeader
                title={`Reconciliation — ${rec.account}`}
                subtitle={`Statement to ${date(rec.statement_date)}${rec.notes ? ` · ${rec.notes}` : ''}`}
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Bank Reconciliation', href: '/accounting/reconciliations' }, { title: date(rec.statement_date) }]}
                actions={
                    <>
                        {editable && (
                            <>
                                <button className="btn btn-outline-danger" onClick={destroy}>
                                    <Trash2 className="h-4 w-4" /> Delete draft
                                </button>
                                <button className="btn btn-outline-primary" onClick={openDetails}>
                                    <Pencil className="h-4 w-4" /> Statement details
                                </button>
                            </>
                        )}
                        {rec.can_review && (
                            <button className="btn btn-success" onClick={review}>
                                <ShieldCheck className="h-4 w-4" /> Review & sign off
                            </button>
                        )}
                        {manage && rec.can_reopen && (
                            <button className="btn btn-outline-warning" onClick={reopen}>
                                <LockOpen className="h-4 w-4" /> Reopen
                            </button>
                        )}
                        {!draft && <PrintButton label="Print reconciliation" />}
                    </>
                }
            />

            <div className="no-print mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Figure label="Statement opening" value={rec.opening_balance} />
                <Figure label="+ Cleared money in" value={draft ? clearedIn : summary.cleared_in} tone="text-success" />
                <Figure label="− Cleared money out" value={draft ? clearedOut : summary.cleared_out} tone="text-danger" />
                <Figure label="= Cleared balance" value={draft ? computedClosing : summary.computed_closing} />
                <Figure label="Statement closing" value={rec.closing_balance} />
                <div className={cn('rounded-lg p-3', balanced ? 'bg-success-light dark:bg-success-dark-light' : 'bg-danger-light dark:bg-danger-dark-light')}>
                    <div className="text-[11px] font-bold tracking-wide text-white-dark uppercase">Difference</div>
                    <div className={cn('font-mono text-lg font-extrabold', balanced ? 'text-success' : 'text-danger')}>{fmt(difference)}</div>
                    <div className="text-[11px] text-white-dark">{balanced ? 'Balanced' : 'Must be zero to complete'}</div>
                </div>
            </div>

            {draft ? (
                <div className="panel mb-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h5 className="text-lg font-bold">Tick every entry that appears on the statement</h5>
                            <p className="text-xs text-white-dark">Unticked entries are carried forward as outstanding (deposits in transit or unpresented payments).</p>
                        </div>
                        {editable && (
                            <div className="flex flex-wrap gap-2">
                                <button className="btn btn-outline-secondary" onClick={openEntry}>
                                    <Plus className="h-4 w-4" /> Statement entry missing from books
                                </button>
                                <button className="btn btn-outline-primary" disabled={busy || !dirty} onClick={save}>
                                    <Save className="h-4 w-4" /> Save progress
                                </button>
                                <button className="btn btn-success" disabled={busy || !balanced} onClick={complete} title={balanced ? '' : 'The difference must be zero'}>
                                    <Lock className="h-4 w-4" /> Complete
                                </button>
                            </div>
                        )}
                    </div>
                    {dirty && <p className="mb-3 text-xs font-semibold text-warning">You have unsaved ticks.</p>}

                    <div className="mb-3 flex flex-wrap items-end gap-2">
                        <input className="form-input w-full sm:w-64" placeholder="Search ref, journal, amount…" value={search} onChange={(e) => setSearch(e.target.value)} />
                        <select className="form-select w-auto" value={view} onChange={(e) => setView(e.target.value)}>
                            <option value="all">All entries ({lines.length})</option>
                            <option value="uncleared">Not ticked ({lines.length - cleared.size})</option>
                            <option value="cleared">Ticked ({cleared.size})</option>
                            <option value="in">Money in only</option>
                            <option value="out">Money out only</option>
                        </select>
                        {editable && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white-dark">Tick all up to</span>
                                <DateInput className="form-input w-36" value={upTo} max={rec.statement_date} onChange={(e) => setUpTo(e.target.value)} />
                                <button className="btn btn-sm btn-outline-primary" onClick={tickUpTo}>
                                    <ListChecks className="h-4 w-4" /> Tick
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="table-responsive">
                        <table className="table table-compact">
                            <thead>
                                <tr>
                                    <th className="w-10">
                                        {editable && (
                                            <input
                                                type="checkbox"
                                                className="form-checkbox"
                                                checked={allVisibleTicked}
                                                onChange={(e) => tickVisible(e.target.checked)}
                                                title="Tick all shown"
                                            />
                                        )}
                                    </th>
                                    <th>Date</th>
                                    <th>Journal</th>
                                    <th>Reference</th>
                                    <th>Details</th>
                                    <th className="text-end!">Money in</th>
                                    <th className="text-end!">Money out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((l) => {
                                    const on = cleared.has(l.id);
                                    return (
                                        <tr
                                            key={l.id}
                                            className={cn(editable && 'cursor-pointer', on && 'bg-success-light/40 dark:bg-success-dark-light/30')}
                                            onClick={() => editable && toggle(l.id)}
                                        >
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    className="form-checkbox"
                                                    checked={on}
                                                    disabled={!editable}
                                                    onChange={() => toggle(l.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </td>
                                            <td className="whitespace-nowrap">{date(l.date)}</td>
                                            <td>
                                                <Link
                                                    href={`/accounting/journals/${l.journal_id}`}
                                                    className="font-mono text-xs text-primary hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {l.journal_no}
                                                </Link>
                                                <div className="text-[11px] text-white-dark">{titleCase(l.type)}</div>
                                            </td>
                                            <td className="font-mono text-xs">{l.reference ?? '—'}</td>
                                            <td className="max-w-sm text-sm">{l.narration}</td>
                                            <td className="text-end!">{Number(l.debit) ? <Amt value={l.debit} className="text-success" /> : ''}</td>
                                            <td className="text-end!">{Number(l.credit) ? <Amt value={l.credit} className="text-danger" /> : ''}</td>
                                        </tr>
                                    );
                                })}
                                {visible.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="py-6 text-center text-white-dark">
                                            No entries match.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="print-only">
                        <Letterhead title="Bank Reconciliation Statement" meta={<div>{rec.account}</div>} />
                    </div>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-lg font-bold">Reconciliation statement as at {date(rec.statement_date)}</h5>
                        <StatusBadge status={rec.status} label={draft ? 'In progress' : undefined} />
                    </div>
                    <table className="table table-compact w-full">
                        <tbody>
                            <tr>
                                <td className="font-semibold">Balance per statement</td>
                                <td className="text-end!">
                                    <Amt value={rec.closing_balance} bold />
                                </td>
                            </tr>
                            <tr>
                                <td>Add: deposits recorded in the books, not yet on the statement</td>
                                <td className="text-end!">
                                    <Amt value={draft ? inTransit : summary.in_transit} />
                                </td>
                            </tr>
                            <tr>
                                <td>Less: payments recorded in the books, not yet on the statement</td>
                                <td className="text-end!">
                                    (<Amt value={draft ? unpresented : summary.unpresented} />)
                                </td>
                            </tr>
                            <tr className="border-t-2 border-white-light dark:border-[#1b2e4b]">
                                <td className="font-semibold">Adjusted bank balance</td>
                                <td className="text-end!">
                                    <Amt value={draft ? r2(Number(rec.closing_balance) + inTransit - unpresented) : summary.adjusted_balance} bold />
                                </td>
                            </tr>
                            <tr>
                                <td className="font-semibold">Balance per books ({rec.account})</td>
                                <td className="text-end!">
                                    <Amt value={summary.book_balance} bold />
                                </td>
                            </tr>
                            {(() => {
                                const unexplained = draft ? r2(Number(rec.closing_balance) + inTransit - unpresented - Number(summary.book_balance)) : Number(summary.unexplained);
                                return Math.abs(unexplained) >= 0.005 ? (
                                    <tr>
                                        <td className="text-warning">
                                            <span className="inline-flex items-center gap-1">
                                                <AlertTriangle className="h-4 w-4" /> Unexplained difference
                                            </span>
                                            <div className="text-xs text-white-dark">
                                                Usually the statement opening balance does not match the books (check the first reconciliation of this account).
                                            </div>
                                        </td>
                                        <td className="text-end!">
                                            <Amt value={unexplained} bold className="text-warning" />
                                        </td>
                                    </tr>
                                ) : (
                                    <tr>
                                        <td colSpan={2} className="text-success">
                                            <span className="inline-flex items-center gap-1 font-semibold">
                                                <CheckCircle2 className="h-4 w-4" /> Adjusted bank balance agrees with the books
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })()}
                        </tbody>
                    </table>

                    {!draft && outstanding.length > 0 && (
                        <>
                            <h6 className="mt-6 mb-2 text-sm font-bold">Outstanding items at {date(rec.statement_date)}</h6>
                            <div className="table-responsive">
                                <table className="table table-compact">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Journal</th>
                                            <th>Reference</th>
                                            <th>Details</th>
                                            <th className="text-end!">In transit</th>
                                            <th className="text-end!">Unpresented</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {outstanding.map((o) => (
                                            <tr key={o.id}>
                                                <td className="whitespace-nowrap">{date(o.date)}</td>
                                                <td className="font-mono text-xs">{o.journal_no}</td>
                                                <td className="font-mono text-xs">{o.reference ?? '—'}</td>
                                                <td className="text-sm">{o.narration}</td>
                                                <td className="text-end!">{Number(o.debit) ? <Amt value={o.debit} /> : ''}</td>
                                                <td className="text-end!">{Number(o.credit) ? <Amt value={o.credit} /> : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {!draft && <div className="mt-6 text-xs text-white-dark">{lines.length} entries cleared on this statement.</div>}

                    <div className="mt-12 grid grid-cols-2 gap-6 text-center text-xs">
                        <Signature label="Prepared by" name={rec.preparer} sub={rec.completed_at ? dateTime(rec.completed_at) : 'Not completed'} />
                        <Signature label="Reviewed by" name={rec.reviewer} sub={rec.reviewed_at ? dateTime(rec.reviewed_at) : 'Not reviewed'} />
                    </div>
                </div>

                <AuditTrail audits={audits} />
            </div>

            <Modal open={modal === 'entry'} onClose={() => setModal(null)} title="Statement entry missing from the books">
                <form onSubmit={submitEntry} className="space-y-4">
                    <p className="text-sm text-white-dark">
                        For items the bank recorded that you have not: bank charges, interest earned, direct debits. It is posted to the ledger immediately and ticked.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {(['out', 'in'] as const).map((d) => (
                            <button
                                key={d}
                                type="button"
                                className={cn('btn', entry.data.direction === d ? (d === 'out' ? 'btn-danger' : 'btn-success') : 'btn-outline-dark')}
                                onClick={() =>
                                    entry.setData((x) => ({
                                        ...x,
                                        direction: d,
                                        account_id: d === 'out' ? (defaults.charges ? String(defaults.charges) : '') : defaults.income ? String(defaults.income) : '',
                                        description: d === 'out' ? 'Bank charges' : 'Interest earned',
                                    }))
                                }
                            >
                                {d === 'out' ? 'Money out (charge, debit)' : 'Money in (interest, credit)'}
                            </button>
                        ))}
                    </div>
                    <FormGrid>
                        <Field label="Date" required error={entry.errors.date}>
                            <DateInput className="form-input" value={entry.data.date} max={rec.statement_date} onChange={(e) => entry.setData('date', e.target.value)} />
                        </Field>
                        <Input
                            label="Amount"
                            type="number"
                            min={0.01}
                            step="any"
                            required
                            value={entry.data.amount}
                            onChange={(e) => entry.setData('amount', e.target.value)}
                            error={entry.errors.amount}
                        />
                    </FormGrid>
                    <Select
                        label={entry.data.direction === 'out' ? 'Expense account' : 'Income account'}
                        required
                        placeholder="Choose account"
                        options={counterAccounts}
                        value={entry.data.account_id}
                        onChange={(e) => entry.setData('account_id', e.target.value)}
                        error={entry.errors.account_id}
                    />
                    <FormGrid>
                        <Input
                            label="Description"
                            required
                            value={entry.data.description}
                            onChange={(e) => entry.setData('description', e.target.value)}
                            error={entry.errors.description}
                        />
                        <Input
                            label="Statement reference"
                            value={entry.data.reference}
                            onChange={(e) => entry.setData('reference', e.target.value)}
                            error={entry.errors.reference}
                        />
                    </FormGrid>
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setModal(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={entry.processing}>
                            Post & tick
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={modal === 'details'} onClose={() => setModal(null)} title="Statement details">
                <form onSubmit={submitDetails} className="space-y-4">
                    <Field label="Statement end date" required error={details.errors.statement_date}>
                        <DateInput className="form-input" value={details.data.statement_date} onChange={(e) => details.setData('statement_date', e.target.value)} />
                    </Field>
                    <FormGrid>
                        <Input
                            label="Opening balance"
                            type="number"
                            step="any"
                            required
                            value={details.data.opening_balance}
                            onChange={(e) => details.setData('opening_balance', e.target.value)}
                            error={details.errors.opening_balance}
                        />
                        <Input
                            label="Closing balance"
                            type="number"
                            step="any"
                            required
                            value={details.data.closing_balance}
                            onChange={(e) => details.setData('closing_balance', e.target.value)}
                            error={details.errors.closing_balance}
                        />
                    </FormGrid>
                    <Input label="Notes" value={details.data.notes} onChange={(e) => details.setData('notes', e.target.value)} error={details.errors.notes} />
                    <p className="text-xs text-white-dark">Moving the date earlier un-ticks entries dated after it.</p>
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setModal(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={details.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
