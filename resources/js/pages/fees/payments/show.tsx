import { Link, router, usePage } from '@inertiajs/react';
import { BookOpenText, Plus, XCircle } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, dateTime, money } from '@/lib/utils';
import { MethodBadge } from '../_components/shared';

type Props = {
    payment: {
        id: number;
        receipt_no: string;
        payment_date: string;
        amount: string;
        amount_words: string;
        unallocated: string;
        method: string;
        reference: string | null;
        payer_name: string | null;
        notes: string | null;
        status: string;
        void_reason: string | null;
        account: string | null;
        received_by: string | null;
        created_at: string | null;
        journal: { id: number; journal_no: string; status: string } | null;
        allocations: { id: number; invoice_id: number; invoice_no: string | null; term: string | null; invoice_total: string; amount: string; invoice_balance: string }[];
        balance_after: string;
    };
    student: { id: number; full_name: string; admission_no: string; class: string; current_balance: string } | null;
};

export default function ReceiptShow({ payment, student }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const isVoid = payment.status === 'void';

    const voidReceipt = async () => {
        const { confirmed, value } = await confirm({
            title: `Void receipt ${payment.receipt_no}?`,
            text: 'The ledger journal will be reversed and invoice balances restored. The receipt is kept on record as VOID. A reason is required.',
            confirmText: 'Void receipt',
            danger: true,
            input: 'textarea',
            inputPlaceholder: 'Reason (e.g. duplicate entry, bounced cheque)…',
        });
        if (confirmed && value) router.post(`/fees/payments/${payment.id}/void`, { reason: value }, { preserveScroll: true });
    };

    const balanceAfter = Number(payment.balance_after);

    return (
        <>
            <PageHeader
                title={`Receipt ${payment.receipt_no}`}
                subtitle={student ? `${student.full_name} · ${student.admission_no}` : undefined}
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Receipts', href: '/fees/payments' }, { title: payment.receipt_no }]}
                actions={
                    <>
                        {student && (
                            <Link href={`/fees/statements/${student.id}`} className="btn btn-outline-info">
                                <BookOpenText className="h-4 w-4" /> Statement
                            </Link>
                        )}
                        {can('fees.manage') && !isVoid && (
                            <button className="btn btn-outline-danger" onClick={voidReceipt}>
                                <XCircle className="h-4 w-4" /> Void
                            </button>
                        )}
                        {can('fees.manage') && (
                            <Link href={`/fees/payments/create${student ? `?student=${student.id}` : ''}`} className="btn btn-outline-primary">
                                <Plus className="h-4 w-4" /> New payment
                            </Link>
                        )}
                        <PrintButton label="Print receipt" />
                    </>
                }
            />

            <div className="panel relative mx-auto max-w-3xl overflow-hidden print:max-w-none print:border-0 print:shadow-none">
                {isVoid && (
                    <div className="pointer-events-none absolute inset-0 grid place-content-center">
                        <span className="-rotate-[25deg] rounded-lg border-8 border-danger/40 px-10 py-2 text-7xl font-black tracking-widest text-danger/30">VOID</span>
                    </div>
                )}
                <Letterhead
                    title="Official Receipt"
                    meta={
                        <div className="space-y-0.5">
                            <div>
                                Receipt No: <strong className="text-black dark:text-white-light">{payment.receipt_no}</strong>
                            </div>
                            <div>Date: {date(payment.payment_date)}</div>
                            <div className="pt-1">
                                <StatusBadge status={payment.status} />
                            </div>
                        </div>
                    }
                />

                {isVoid && (
                    <div className="mb-5 rounded-md border border-danger/30 bg-danger-light p-3 text-sm text-danger dark:bg-danger-dark-light">
                        <strong>This receipt was voided.</strong> Reason: {payment.void_reason}
                    </div>
                )}

                <div className="mb-6 space-y-3 text-sm">
                    <div className="flex flex-wrap gap-x-2 border-b border-dashed border-white-light pb-2 dark:border-[#1b2e4b]">
                        <span className="text-white-dark">Received from:</span>
                        <strong className="text-black dark:text-white-light">{payment.payer_name ?? student?.full_name}</strong>
                    </div>
                    <div className="flex flex-wrap gap-x-2 border-b border-dashed border-white-light pb-2 dark:border-[#1b2e4b]">
                        <span className="text-white-dark">On behalf of student:</span>
                        <strong className="text-black dark:text-white-light">
                            {student?.full_name} ({student?.admission_no}) — {student?.class || '—'}
                        </strong>
                    </div>
                    <div className="flex flex-wrap gap-x-2 border-b border-dashed border-white-light pb-2 dark:border-[#1b2e4b]">
                        <span className="text-white-dark">The sum of:</span>
                        <strong className="text-black italic dark:text-white-light">{payment.amount_words}</strong>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span>
                            <span className="text-white-dark">Payment method: </span>
                            <MethodBadge method={payment.method} />
                        </span>
                        {payment.reference && (
                            <span>
                                <span className="text-white-dark">Reference: </span>
                                <strong className="font-mono">{payment.reference}</strong>
                            </span>
                        )}
                        {payment.account && <span className="text-xs text-white-dark">Deposited to {payment.account}</span>}
                    </div>
                </div>

                <div className="mb-6 flex items-center justify-between rounded-md bg-success-light px-5 py-4 dark:bg-success-dark-light">
                    <span className="font-bold text-success uppercase">Amount paid</span>
                    <span className={cn('text-3xl font-extrabold text-success', isVoid && 'line-through')}>{money(payment.amount, cur, 2)}</span>
                </div>

                <div className="mb-2 text-xs font-bold tracking-wide text-white-dark uppercase">Applied to</div>
                <div className="table-responsive mb-4">
                    <table className="table-compact table">
                        <thead>
                            <tr>
                                <th>Invoice</th>
                                <th>Term</th>
                                <th className="text-end!">Invoice total</th>
                                <th className="text-end!">Amount applied</th>
                                <th className="text-end!">Invoice balance now</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payment.allocations.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center text-white-dark">
                                        {isVoid ? 'Allocations were removed when the receipt was voided.' : 'Not applied to any invoice — held as credit on account.'}
                                    </td>
                                </tr>
                            )}
                            {payment.allocations.map((a) => (
                                <tr key={a.id}>
                                    <td>
                                        <Link href={`/fees/invoices/${a.invoice_id}`} className="font-semibold text-primary hover:underline">
                                            {a.invoice_no}
                                        </Link>
                                    </td>
                                    <td>{a.term ?? '—'}</td>
                                    <td className="text-end!">{money(a.invoice_total, cur)}</td>
                                    <td className="text-end! font-semibold">{money(a.amount, cur)}</td>
                                    <td className="text-end!">{money(a.invoice_balance, cur)}</td>
                                </tr>
                            ))}
                            {Number(payment.unallocated) > 0 && (
                                <tr>
                                    <td colSpan={3} className="text-info">
                                        Unapplied credit (applied automatically to the next invoice)
                                    </td>
                                    <td className="text-end! font-semibold text-info">{money(payment.unallocated, cur)}</td>
                                    <td />
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {!isVoid && (
                    <div className="mb-6 flex justify-end">
                        <div className="w-full max-w-xs space-y-1 text-sm">
                            <div className="flex justify-between border-t-2 border-primary pt-2 text-base">
                                <span className="font-bold">{balanceAfter < 0 ? 'Credit after this payment' : 'Balance after this payment'}</span>
                                <span className={cn('font-extrabold', balanceAfter > 0 ? 'text-danger' : 'text-success')}>{money(Math.abs(balanceAfter), cur)}</span>
                            </div>
                            {student && Number(student.current_balance) !== balanceAfter && (
                                <div className="flex justify-between text-xs text-white-dark">
                                    <span>Current outstanding (today)</span>
                                    <span>{money(student.current_balance, cur)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {payment.notes && <p className="mb-4 text-sm text-white-dark">Note: {payment.notes}</p>}

                <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-white-dark">
                    <div>
                        <div className="border-t border-dark/40 pt-1">Received by: {payment.received_by ?? '—'}</div>
                    </div>
                    <div className="text-end">
                        <div className="border-t border-dark/40 pt-1">Official stamp</div>
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-white-light pt-3 text-xs text-white-dark dark:border-[#1b2e4b]">
                    <span>Recorded {dateTime(payment.created_at)}</span>
                    {payment.journal && (
                        <span className="no-print">
                            Ledger: {can('accounting.view') ? <Link href={`/accounting/journals/${payment.journal.id}`} className="text-primary hover:underline">{payment.journal.journal_no}</Link> : payment.journal.journal_no} ({payment.journal.status})
                        </span>
                    )}
                    <span>Keep this receipt as proof of payment.</span>
                </div>
            </div>
        </>
    );
}
