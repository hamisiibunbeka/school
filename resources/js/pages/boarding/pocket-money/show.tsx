import { router, useForm } from '@inertiajs/react';
import { ArrowDownLeft, ArrowUpRight, KeyRound, Lock, LockOpen, Receipt, RotateCcw, Settings } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton, IconLink, PrintButton } from '@/components/ui/actions';
import { DateRangePicker } from '@/components/ui/date-picker';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Letterhead from '@/components/ui/letterhead';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import { cn, date, dateTime, money, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import { Meta, Signature } from '../../accounting/_components/shared';
import {
    DepositModal,
    PinBadge,
    reverseTxn,
    TypeBadge,
    useCurrency,
    WithdrawModal,
    type CustodianOption,
    type StudentOption,
    type Txn,
    type WalletRow,
} from './_components/shared';

type Account = WalletRow & {
    notes: string | null;
    custodian_id: number | null;
    guardian: string | null;
    guardian_phone: string | null;
    opened_at: string | null;
};

type Props = {
    account: Account;
    filters: { from: string; to: string };
    opening: string;
    transactions: Txn[];
    totals: { in: string; out: string };
    spending: { category: string; total: string; count: number }[];
    categories: Option[];
    students: StudentOption[];
    custodians: CustodianOption[];
    methods: Option[];
};

export default function PocketMoneyStatement(props: Props) {
    const { account, filters, opening, transactions, totals, students, custodians, methods } = props;
    const spending = props.spending;
    const can = useCan();
    const manage = can('boarding.manage');
    const cur = useCurrency();
    const active = account.status === 'active';
    const [modal, setModal] = useState<'deposit' | 'withdraw' | 'settings' | 'pin' | 'close' | null>(null);
    const closing = transactions.length ? transactions[transactions.length - 1].balance_after : opening;

    const setPeriod = (from: string, to: string) => router.get(`/boarding/pocket-money/${account.id}`, { from, to }, { preserveState: true, preserveScroll: true, replace: true });

    return (
        <>
            <PageHeader
                title={`${account.student} — pocket money`}
                subtitle={`${account.admission_no}${account.class ? ` · ${account.class}` : ''}`}
                breadcrumbs={[{ title: 'Boarding', href: '/boarding/dormitories' }, { title: 'Pocket Money', href: '/boarding/pocket-money' }, { title: account.student }]}
                actions={
                    <>
                        {manage && active && (
                            <>
                                <button className="btn btn-success" onClick={() => setModal('deposit')}>
                                    <ArrowDownLeft className="h-4 w-4" /> Receive
                                </button>
                                <button className="btn btn-danger" onClick={() => setModal('withdraw')}>
                                    <ArrowUpRight className="h-4 w-4" /> Give money
                                </button>
                            </>
                        )}
                        <PrintButton label="Print statement" />
                    </>
                }
            />

            <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
                <div className="panel">
                    <div className="print-only">
                        <Letterhead title="Pocket money statement" meta={<div>Printed {dateTime(new Date().toISOString())}</div>} />
                    </div>

                    <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                        <Meta label="Student" value={`${account.student} (${account.admission_no})`} />
                        <Meta label="Class" value={account.class || '—'} />
                        <Meta label="Kept by" value={account.custodian ?? '—'} />
                        <Meta label="Period" value={`${date(filters.from)} – ${date(filters.to)}`} />
                    </div>

                    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
                        <DateRangePicker from={filters.from} to={filters.to} allowClear={false} placeholder="Choose period" onChange={setPeriod} />
                        <span className="text-xs text-white-dark">{transactions.length} transaction(s) in period</span>
                    </div>

                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="w-28">Date</th>
                                    <th className="w-28">Reference</th>
                                    <th className="w-36">Type</th>
                                    <th className="min-w-[220px]">Details</th>
                                    <th className="w-32 text-end!">In</th>
                                    <th className="w-32 text-end!">Out</th>
                                    <th className="w-32 text-end!">Balance</th>
                                    <th className="no-print w-20" />
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-white-light/40 dark:bg-[#1b2e4b]/40">
                                    <td className="whitespace-nowrap">{date(filters.from)}</td>
                                    <td colSpan={5} className="font-semibold">
                                        Opening balance
                                    </td>
                                    <td className="text-end! font-bold whitespace-nowrap">{money(opening, cur)}</td>
                                    <td className="no-print" />
                                </tr>
                                {transactions.map((t) => {
                                    const amount = Number(t.amount);
                                    const details = [
                                        t.description,
                                        t.counterparty && (t.type === 'deposit' ? `From ${t.counterparty}` : `Collected by ${t.counterparty}`),
                                        t.method && t.type === 'deposit' ? `Via ${titleCase(t.method)}` : null,
                                    ].filter(Boolean);
                                    return (
                                        <tr key={t.id} className={cn('align-top', t.reversed && 'opacity-60')}>
                                            <td className="whitespace-nowrap">
                                                <div className="font-semibold text-black dark:text-white-light">{date(t.transacted_at)}</div>
                                                <div className="text-xs text-white-dark">{t.transacted_at.slice(11, 16)}</div>
                                            </td>
                                            <td className="font-mono text-xs whitespace-nowrap">{t.reference}</td>
                                            <td>
                                                <div className="flex flex-col items-start gap-1">
                                                    <TypeBadge txn={t} />
                                                    {t.category && t.category !== 'refund' && <span className="text-xs font-semibold">{titleCase(t.category)}</span>}
                                                    {t.pin_verified && (
                                                        <span className="badge badge-soft-info inline-flex items-center gap-1" title="Student confirmed with PIN">
                                                            <KeyRound className="h-3 w-3" /> PIN
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {details.length > 0 ? (
                                                    details.map((d, i) => (
                                                        <div key={i} className={i === 0 ? 'text-black dark:text-white-light' : 'text-xs text-white-dark'}>
                                                            {d}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-white-dark">—</span>
                                                )}
                                                {t.limit_override_reason && <div className="text-xs text-warning">Limit override: {t.limit_override_reason}</div>}
                                                {t.recorded_by && <div className="mt-0.5 text-xs text-white-dark">Recorded by {t.recorded_by}</div>}
                                            </td>
                                            <td className="text-end! font-semibold whitespace-nowrap text-success">{amount > 0 ? money(amount, cur) : '—'}</td>
                                            <td className="text-end! font-semibold whitespace-nowrap text-danger">{amount < 0 ? money(-amount, cur) : '—'}</td>
                                            <td className="text-end! font-bold whitespace-nowrap text-black dark:text-white-light">{money(t.balance_after, cur)}</td>
                                            <td className="no-print">
                                                <div className="flex justify-end gap-1">
                                                    <IconLink href={`/boarding/pocket-money/transactions/${t.id}/receipt`} icon={Receipt} title="Slip" />
                                                    {manage && t.reversible && (
                                                        <IconButton icon={RotateCcw} title="Reverse" className="text-warning" onClick={() => reverseTxn(t, cur)} />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-6 text-center text-white-dark">
                                            No transactions in this period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-white-light font-extrabold dark:border-[#1b2e4b]">
                                    <td colSpan={4}>Totals / closing balance</td>
                                    <td className="text-end! whitespace-nowrap text-success">{money(totals.in, cur)}</td>
                                    <td className="text-end! whitespace-nowrap text-danger">{money(totals.out, cur)}</td>
                                    <td className="text-end! whitespace-nowrap text-black dark:text-white-light">{money(closing, cur)}</td>
                                    <td className="no-print" />
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="print-only mt-12 grid grid-cols-2 gap-10 text-xs">
                        <Signature label="Student" name={account.student} sub="I confirm this statement is correct" />
                        <Signature label="Patron / Matron" name={account.custodian} sub="Custodian of the money" />
                    </div>
                </div>

                <div className="no-print space-y-5">
                    <div className="panel">
                        <div className="text-xs font-bold tracking-wide text-white-dark uppercase">Current balance</div>
                        <div className={cn('text-3xl font-extrabold', Number(account.balance) > 0 ? 'text-success' : 'text-danger')}>{money(account.balance, cur)}</div>
                        <div className="mt-1 text-sm text-white-dark">
                            Given today {money(account.withdrawn_today ?? 0, cur)}
                            {account.daily_limit !== null && ` of ${money(account.daily_limit, cur)} limit`}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                            <PinBadge wallet={account} />
                            {!active && <span className="badge badge-soft-dark">Closed</span>}
                        </div>
                        <div className="mt-4 space-y-1 text-sm">
                            <div>
                                <span className="text-white-dark">Guardian:</span> {account.guardian ?? '—'} {account.guardian_phone && `(${account.guardian_phone})`}
                            </div>
                            <div>
                                <span className="text-white-dark">Opened:</span> {date(account.opened_at)}
                            </div>
                            {account.notes && (
                                <div>
                                    <span className="text-white-dark">Notes:</span> {account.notes}
                                </div>
                            )}
                        </div>
                        {manage && (
                            <div className="mt-4 grid gap-2">
                                <button className="btn btn-sm btn-outline-primary" onClick={() => setModal('settings')}>
                                    <Settings className="h-4 w-4" /> Limit & custodian
                                </button>
                                <button className="btn btn-sm btn-outline-info" onClick={() => setModal('pin')}>
                                    <KeyRound className="h-4 w-4" /> {account.has_pin ? 'Reset / remove PIN' : 'Set student PIN'}
                                </button>
                                {active ? (
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => setModal('close')}>
                                        <Lock className="h-4 w-4" /> Close & refund balance
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-sm btn-outline-success"
                                        onClick={() => router.post(`/boarding/pocket-money/${account.id}/reopen`, {}, { preserveScroll: true })}
                                    >
                                        <LockOpen className="h-4 w-4" /> Reopen wallet
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="panel">
                        <h5 className="mb-3 font-bold text-black dark:text-white-light">Spending in period</h5>
                        {spending.length === 0 ? (
                            <p className="text-sm text-white-dark">Nothing given out in this period.</p>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {spending.map((c) => {
                                    const pct = Number(totals.out) ? (Number(c.total) / Number(totals.out)) * 100 : 0;
                                    return (
                                        <li key={c.category}>
                                            <div className="flex justify-between">
                                                <span>
                                                    {titleCase(c.category)} <span className="text-xs text-white-dark">×{c.count}</span>
                                                </span>
                                                <b>{money(c.total, cur)}</b>
                                            </div>
                                            <div className="mt-1 h-1.5 rounded-full bg-white-light dark:bg-[#1b2e4b]">
                                                <div
                                                    className="h-1.5 rounded-full bg-primary"
                                                    style={{
                                                        width: `${Math.min(pct, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {manage && (
                <>
                    <DepositModal open={modal === 'deposit'} studentId={account.student_id} onClose={() => setModal(null)} students={students} methods={methods} />
                    <WithdrawModal wallet={modal === 'withdraw' ? account : null} onClose={() => setModal(null)} categories={props.categories} />
                    <SettingsModal open={modal === 'settings'} account={account} custodians={custodians} onClose={() => setModal(null)} />
                    <PinModal open={modal === 'pin'} account={account} onClose={() => setModal(null)} />
                    <CloseModal open={modal === 'close'} account={account} onClose={() => setModal(null)} />
                </>
            )}
        </>
    );
}

function SettingsModal({ open, account, custodians, onClose }: { open: boolean; account: Account; custodians: CustodianOption[]; onClose: () => void }) {
    const cur = useCurrency();
    const form = useForm({
        daily_limit: account.daily_limit ?? '',
        custodian_id: String(account.custodian_id ?? ''),
        notes: account.notes ?? '',
    });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put(`/boarding/pocket-money/${account.id}`, {
            preserveScroll: true,
            onSuccess: onClose,
        });
    };
    return (
        <Modal open={open} onClose={onClose} title="Wallet settings">
            <form onSubmit={submit} className="space-y-4">
                <FormGrid cols={1}>
                    <Input
                        label={`Daily limit (${cur})`}
                        type="number"
                        min={0}
                        step="any"
                        value={form.data.daily_limit}
                        onChange={(e) => form.setData('daily_limit', e.target.value)}
                        error={form.errors.daily_limit}
                        help="Most a student can draw in one day. Leave empty for no limit; going over needs a written reason."
                    />
                    <Select
                        label="Kept by (custodian)"
                        required
                        options={custodians}
                        value={form.data.custodian_id}
                        onChange={(e) => form.setData('custodian_id', e.target.value)}
                        error={form.errors.custodian_id}
                    />
                    <Input
                        label="Notes"
                        value={form.data.notes}
                        onChange={(e) => form.setData('notes', e.target.value)}
                        error={form.errors.notes}
                        placeholder="e.g. parent asked for max 2,000 per week"
                    />
                </FormGrid>
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

function PinModal({ open, account, onClose }: { open: boolean; account: Account; onClose: () => void }) {
    const form = useForm({ pin: '', pin_confirmation: '' });
    const submit = (e: FormEvent, remove = false) => {
        e.preventDefault();
        if (remove) form.transform(() => ({ pin: '', pin_confirmation: '' }));
        else form.transform((d) => d);
        form.post(`/boarding/pocket-money/${account.id}/pin`, {
            preserveScroll: true,
            onSuccess: () => (form.reset(), onClose()),
        });
    };
    const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
    return (
        <Modal open={open} onClose={onClose} title={account.has_pin ? 'Reset student PIN' : 'Set student PIN'}>
            <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-white-dark">
                    Hand the device to <b>{account.student}</b> to type a 4–6 digit PIN privately. It will be required for every withdrawal, proving the student asked for the
                    money. Five wrong attempts lock it until it is reset here.
                </p>
                <FormGrid>
                    <Input
                        label="New PIN"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        required
                        value={form.data.pin}
                        onChange={(e) => form.setData('pin', digits(e.target.value))}
                        error={form.errors.pin}
                    />
                    <Input
                        label="Repeat PIN"
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        required
                        value={form.data.pin_confirmation}
                        onChange={(e) => form.setData('pin_confirmation', digits(e.target.value))}
                    />
                </FormGrid>
                <div className="flex flex-wrap justify-center gap-3">
                    {account.has_pin && (
                        <button type="button" className="btn btn-outline-danger" disabled={form.processing} onClick={(e) => submit(e, true)}>
                            Remove PIN
                        </button>
                    )}
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        Save PIN
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function CloseModal({ open, account, onClose }: { open: boolean; account: Account; onClose: () => void }) {
    const cur = useCurrency();
    const form = useForm({ counterparty: '', description: '' });
    const hasBalance = Number(account.balance) > 0;
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/boarding/pocket-money/${account.id}/close`, {
            onSuccess: onClose,
        });
    };
    return (
        <Modal open={open} onClose={onClose} title="Close wallet">
            <form onSubmit={submit} className="space-y-4">
                <p className="text-sm">
                    {hasBalance ? (
                        <>
                            The remaining <b>{money(account.balance, cur)}</b> will be recorded as refunded and the wallet closed (e.g. end of year, student leaving). A refund slip
                            will open for signing.
                        </>
                    ) : (
                        'The wallet has no balance and will simply be closed.'
                    )}
                </p>
                {hasBalance && (
                    <Input
                        label="Collected by"
                        required
                        placeholder="Student or parent's name"
                        value={form.data.counterparty}
                        onChange={(e) => form.setData('counterparty', e.target.value)}
                        error={form.errors.counterparty}
                    />
                )}
                <Input label="Note" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} />
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-danger" disabled={form.processing}>
                        Close wallet
                    </button>
                </div>
            </form>
        </Modal>
    );
}
