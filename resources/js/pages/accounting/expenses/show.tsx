import { Link, router, useForm, usePage } from '@inertiajs/react';
import { Ban, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import { Textarea } from '@/components/ui/form';
import Letterhead from '@/components/ui/letterhead';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, dateTime, money, titleCase } from '@/lib/utils';
import { fmtZero, showErrors } from '../_components/report';
import { AuditTrail, Banner, Meta, Signature, type Audit } from '../_components/shared';
import { amountInWords } from '../_components/words';
import type { ExpenseRow } from './index';

type Expense = ExpenseRow & {
    supplier_phone: string | null;
    supplier_tin: string | null;
    created_at: string | null;
    rejection_reason: string | null;
    void_reason: string | null;
    journal: { id: number; journal_no: string; status: string; lines: { id: number; code: string; account: string; debit: string; credit: string }[] } | null;
};

export default function ExpenseShow({ expense, audits }: { expense: Expense; audits: Audit[] }) {
    const can = useCan();
    const { school, auth } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [mode, setMode] = useState<'reject' | 'void' | null>(null);
    const reason = useForm({ reason: '' });
    const isMaker = expense.created_by === auth.user?.id;

    const approve = async () => {
        const { confirmed } = await confirm({ title: `Approve ${expense.voucher_no}?`, text: `Pay ${money(expense.amount, cur)} to ${expense.payee_name} and post it to the ledger.`, confirmText: 'Approve & pay' });
        if (confirmed) router.post(`/accounting/expenses/${expense.id}/approve`, {}, { preserveScroll: true, onError: showErrors });
    };
    const destroy = async () => {
        const { confirmed } = await confirm({ title: `Delete ${expense.voucher_no}?`, text: 'Only unpaid vouchers can be deleted.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/accounting/expenses/${expense.id}`, { onError: showErrors });
    };

    return (
        <>
            <PageHeader
                title={`Payment voucher ${expense.voucher_no}`}
                subtitle={expense.description}
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Expenses', href: '/accounting/expenses' }, { title: expense.voucher_no }]}
                actions={
                    <>
                        {expense.can_approve && (
                            <>
                                <button type="button" className="btn btn-outline-danger" onClick={() => setMode('reject')}>
                                    <XCircle className="h-4 w-4" /> Reject
                                </button>
                                <button type="button" className="btn btn-success" onClick={approve}>
                                    <CheckCircle2 className="h-4 w-4" /> Approve & pay
                                </button>
                            </>
                        )}
                        {can('accounting.manage') && expense.status === 'paid' && (
                            <button type="button" className="btn btn-outline-warning" onClick={() => setMode('void')}>
                                <Ban className="h-4 w-4" /> Void
                            </button>
                        )}
                        {can('accounting.manage') && ['pending', 'rejected'].includes(expense.status) && (
                            <button type="button" className="btn btn-outline-danger" onClick={destroy}>
                                <Trash2 className="h-4 w-4" /> Delete
                            </button>
                        )}
                        <PrintButton label="Print voucher" />
                    </>
                }
            />

            <div className="no-print mb-5 space-y-3">
                {expense.status === 'pending' && isMaker && !auth.user?.is_super_admin && (
                    <Banner tone="info" icon={Info} title="Awaiting approval">
                        You raised this voucher; a different user with accounting rights must approve it.
                    </Banner>
                )}
                {expense.status === 'rejected' && (
                    <Banner tone="danger" icon={XCircle} title="Rejected">
                        {expense.rejection_reason ?? '—'}
                    </Banner>
                )}
                {expense.status === 'void' && (
                    <Banner tone="warning" icon={Ban} title="Voided">
                        {expense.void_reason ?? 'The payment journal has been reversed.'}
                    </Banner>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="print-only">
                        <Letterhead title="Payment Voucher" meta={<div className="font-mono font-bold">{expense.voucher_no}</div>} />
                    </div>
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">Pay to</div>
                            <div className="text-xl font-extrabold text-black dark:text-white-light">{expense.payee_name}</div>
                            {expense.supplier_tin && <div className="text-xs text-white-dark">TIN: {expense.supplier_tin}</div>}
                            {expense.supplier_phone && <div className="text-xs text-white-dark">{expense.supplier_phone}</div>}
                        </div>
                        <div className="text-end">
                            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">Amount</div>
                            <div className="font-mono text-2xl font-extrabold text-primary">
                                {cur} {fmtZero(expense.amount)}
                            </div>
                            <StatusBadge status={expense.status} />
                        </div>
                    </div>

                    <div className="mb-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                        <Meta label="Voucher no." value={<span className="font-mono">{expense.voucher_no}</span>} />
                        <Meta label="Date" value={date(expense.date)} />
                        <Meta label="Method" value={titleCase(expense.payment_method)} />
                        <Meta label="Expense account" value={expense.expense_account} />
                        <Meta label="Paid from" value={expense.payment_account} />
                        <Meta label="Reference" value={expense.reference ?? '—'} />
                    </div>

                    <div className="mb-4 rounded-md bg-[#fbfbfb] p-3 text-sm dark:bg-[#121c2c]">
                        <div>
                            <span className="font-semibold">Being payment for: </span>
                            {expense.description}
                        </div>
                        <div className="mt-1 text-xs italic text-white-dark">Amount in words: {amountInWords(expense.amount)}</div>
                    </div>

                    {expense.journal && (
                        <>
                            <h6 className="mb-2 text-sm font-bold">
                                Ledger posting —{' '}
                                <Link href={`/accounting/journals/${expense.journal.id}`} className="font-mono text-primary hover:underline">
                                    {expense.journal.journal_no}
                                </Link>{' '}
                                <StatusBadge status={expense.journal.status} />
                            </h6>
                            <div className="table-responsive">
                                <table className="table table-compact">
                                    <thead>
                                        <tr>
                                            <th>Account</th>
                                            <th className="text-end!">Debit</th>
                                            <th className="text-end!">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {expense.journal.lines.map((l) => (
                                            <tr key={l.id}>
                                                <td>
                                                    <span className="font-mono">{l.code}</span> · {l.account}
                                                </td>
                                                <td className="text-end! font-mono">{Number(l.debit) ? fmtZero(l.debit) : ''}</td>
                                                <td className="text-end! font-mono">{Number(l.credit) ? fmtZero(l.credit) : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    <div className="mt-12 grid grid-cols-3 gap-6 text-center text-xs">
                        <Signature label="Prepared by" name={expense.creator} sub={dateTime(expense.created_at)} />
                        <Signature label="Approved by" name={expense.approver} sub="" />
                        <Signature label="Received by (payee)" name={null} sub="Signature & date" />
                    </div>
                </div>

                <AuditTrail audits={audits} />
            </div>

            <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === 'void' ? `Void ${expense.voucher_no}` : `Reject ${expense.voucher_no}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        reason.post(`/accounting/expenses/${expense.id}/${mode}`, {
                            preserveScroll: true,
                            onSuccess: () => {
                                setMode(null);
                                reason.reset();
                            },
                            onError: showErrors,
                        });
                    }}
                >
                    {mode === 'void' && <p className="text-sm text-white-dark">Voiding posts a reversal journal dated today; the original payment journal remains in the ledger.</p>}
                    <Textarea label="Reason" required value={reason.data.reason} onChange={(e) => reason.setData('reason', e.target.value)} error={reason.errors.reason} rows={3} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setMode(null)}>
                            Cancel
                        </button>
                        <button className={mode === 'void' ? 'btn btn-warning' : 'btn btn-danger'} disabled={reason.processing}>
                            {mode === 'void' ? 'Void voucher' : 'Reject voucher'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
