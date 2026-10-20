import { Link, router, usePage } from '@inertiajs/react';
import { Ban, BookOpenText, LayoutTemplate, Wallet } from 'lucide-react';
import InvoiceDocumentView from '@/components/invoice-layout/document';
import { PAPER_HEIGHT_MM, PAPER_WIDTH_MM, type InvoiceData, type Layout } from '@/components/invoice-layout/schema';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, money, titleCase } from '@/lib/utils';
import { MethodBadge, PaymentInstructionsBox, type Instructions } from '../_components/shared';

type Props = {
    invoice: {
        id: number;
        invoice_no: string;
        issue_date: string;
        due_date: string | null;
        subtotal: string;
        discount: string;
        total: string;
        paid: string;
        balance: string;
        status: string;
        notes: string | null;
        term: string | null;
        journal: { id: number; journal_no: string; status: string } | null;
        created_by: string | null;
        overdue: boolean;
        items: { id: number; description: string; category: string | null; amount: string; discount: string; net: string }[];
        payments: { id: number; payment_id: number; receipt_no: string | null; payment_date: string | null; method: string | null; reference: string | null; amount: string }[];
    };
    student: {
        id: number;
        full_name: string;
        admission_no: string;
        class: string;
        residence_type: string;
        guardian: { name: string; phone: string; email: string | null } | null;
        account_balance: string;
    } | null;
    instructions: Instructions;
    /** The school's chosen invoice layout (null = standard format below). */
    layout: Layout | null;
    document: InvoiceData | null;
};

export default function InvoiceShow({ invoice, student, instructions, layout, document }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const canCancel = can('fees.manage') && invoice.status !== 'cancelled' && Number(invoice.paid) === 0;

    const cancel = async () => {
        const { confirmed, value } = await confirm({
            title: `Cancel invoice ${invoice.invoice_no}?`,
            text: 'Its ledger journal will be reversed. This cannot be undone. Please give a reason.',
            confirmText: 'Cancel invoice',
            danger: true,
            input: 'textarea',
            inputPlaceholder: 'Reason for cancellation…',
        });
        if (confirmed && value) router.post(`/fees/invoices/${invoice.id}/cancel`, { reason: value }, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader
                title={`Invoice ${invoice.invoice_no}`}
                subtitle={student ? `${student.full_name} · ${student.admission_no}` : undefined}
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Invoices', href: '/fees/invoices' }, { title: invoice.invoice_no }]}
                actions={
                    <>
                        {student && (
                            <Link href={`/fees/statements/${student.id}`} className="btn btn-outline-info">
                                <BookOpenText className="h-4 w-4" /> Statement
                            </Link>
                        )}
                        {canCancel && (
                            <button className="btn btn-outline-danger" onClick={cancel}>
                                <Ban className="h-4 w-4" /> Cancel invoice
                            </button>
                        )}
                        {can('fees.manage') && student && Number(invoice.balance) > 0 && invoice.status !== 'cancelled' && (
                            <Link href={`/fees/payments/create?student=${student.id}`} className="btn btn-success">
                                <Wallet className="h-4 w-4" /> Collect payment
                            </Link>
                        )}
                        <PrintButton label="Print invoice" />
                    </>
                }
            />

            {layout && document && (
                <>
                    {/* Paper size and margins come from the layout, so printing matches the preview. */}
                    <style>{`@media print { @page { size: ${PAPER_WIDTH_MM[layout.page.paper]}mm ${PAPER_HEIGHT_MM[layout.page.paper]}mm; margin: 0; } }`}</style>
                    {invoice.status === 'cancelled' && (
                        <div className="no-print mx-auto mb-4 max-w-4xl rounded-md border border-danger/30 bg-danger-light p-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">
                            This invoice has been cancelled and its ledger entry reversed. {invoice.notes}
                        </div>
                    )}
                    <div className="overflow-x-auto print:overflow-visible">
                        <InvoiceDocumentView layout={layout} data={document} />
                    </div>
                    <div className="no-print mt-4 flex flex-wrap justify-center gap-4 text-xs text-white-dark">
                        <span className="flex items-center gap-1.5">
                            <LayoutTemplate className="h-3.5 w-3.5" /> Printed with your school's invoice layout
                            {can('administration.manage') && (
                                <Link href="/admin/settings/invoice-layout/designer" className="text-primary hover:underline">
                                    (customise)
                                </Link>
                            )}
                        </span>
                        {invoice.journal && (
                            <span>
                                Ledger:{' '}
                                {can('accounting.view') ? (
                                    <Link href={`/accounting/journals/${invoice.journal.id}`} className="text-primary hover:underline">
                                        {invoice.journal.journal_no}
                                    </Link>
                                ) : (
                                    invoice.journal.journal_no
                                )}{' '}
                                ({invoice.journal.status})
                            </span>
                        )}
                    </div>
                </>
            )}

            {!(layout && document) && (

            <div className="panel mx-auto max-w-4xl print:max-w-none print:border-0 print:shadow-none">
                <Letterhead
                    title="Fee Invoice"
                    meta={
                        <div className="space-y-0.5">
                            <div>
                                Invoice No: <strong className="text-black dark:text-white-light">{invoice.invoice_no}</strong>
                            </div>
                            <div>Issue date: {date(invoice.issue_date)}</div>
                            <div className={cn(invoice.overdue && 'font-bold text-danger')}>Due date: {date(invoice.due_date)}</div>
                            <div className="pt-1">
                                <StatusBadge status={invoice.status} />
                            </div>
                        </div>
                    }
                />

                {invoice.status === 'cancelled' && (
                    <div className="mb-5 rounded-md border border-danger/30 bg-danger-light p-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">
                        This invoice has been cancelled and its ledger entry reversed. {invoice.notes}
                    </div>
                )}

                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    <div>
                        <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">Bill to</div>
                        <div className="text-base font-bold text-black dark:text-white-light">{student?.full_name}</div>
                        <div className="text-sm">Adm. No: {student?.admission_no}</div>
                        <div className="text-sm">
                            Class: {student?.class || '—'} · {titleCase(student?.residence_type)}
                        </div>
                        {student?.guardian && (
                            <div className="mt-1 text-sm text-white-dark">
                                Parent/Guardian: {student.guardian.name} · {student.guardian.phone}
                            </div>
                        )}
                    </div>
                    <div className="sm:text-end">
                        <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">Period</div>
                        <div className="font-semibold">{invoice.term ?? 'General'}</div>
                        <div className="mt-3 inline-block rounded-md bg-primary-light px-4 py-2 text-start dark:bg-primary-dark-light">
                            <div className="text-xs font-bold text-primary uppercase">Amount due</div>
                            <div className="text-2xl font-extrabold text-primary">{money(invoice.balance, cur)}</div>
                        </div>
                    </div>
                </div>

                <div className="table-responsive mb-6">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Description</th>
                                <th className="text-end!">Amount</th>
                                <th className="text-end!">Discount</th>
                                <th className="text-end!">Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.items.map((it, i) => (
                                <tr key={it.id}>
                                    <td>{i + 1}</td>
                                    <td>
                                        <div className="font-semibold">{it.description}</div>
                                        {it.category && it.category !== it.description && <div className="text-xs text-white-dark">{it.category}</div>}
                                    </td>
                                    <td className="text-end!">{money(it.amount, cur)}</td>
                                    <td className="text-end! text-success">{Number(it.discount) > 0 ? `− ${money(it.discount, cur)}` : '—'}</td>
                                    <td className="text-end! font-semibold">{money(it.net, cur)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mb-6 grid gap-6 sm:grid-cols-2">
                    <div>
                        <div className="mb-2 text-xs font-bold tracking-wide text-white-dark uppercase">Payments applied</div>
                        {invoice.payments.length === 0 ? (
                            <p className="text-sm text-white-dark">No payments applied yet.</p>
                        ) : (
                            <table className="table-compact table">
                                <tbody>
                                    {invoice.payments.map((p) => (
                                        <tr key={p.id}>
                                            <td>
                                                <Link href={`/fees/payments/${p.payment_id}`} className="font-semibold text-primary hover:underline">
                                                    {p.receipt_no}
                                                </Link>
                                                <div className="text-xs text-white-dark">{date(p.payment_date)}</div>
                                            </td>
                                            <td>{p.method && <MethodBadge method={p.method} />}</td>
                                            <td className="text-end! font-semibold">{money(p.amount, cur)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-white-dark">Subtotal</span>
                            <span>{money(invoice.subtotal, cur)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white-dark">Discounts</span>
                            <span className="text-success">− {money(invoice.discount, cur)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span>Invoice total</span>
                            <span>{money(invoice.total, cur)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white-dark">Paid</span>
                            <span>− {money(invoice.paid, cur)}</span>
                        </div>
                        <div className="flex justify-between border-t-2 border-primary pt-2 text-base">
                            <span className="font-extrabold">Balance due</span>
                            <span className={cn('font-extrabold', Number(invoice.balance) > 0 ? 'text-danger' : 'text-success')}>{money(invoice.balance, cur)}</span>
                        </div>
                        {student && Number(student.account_balance) !== Number(invoice.balance) && (
                            <div className="flex justify-between text-xs text-white-dark">
                                <span>Total outstanding on account</span>
                                <span>{money(student.account_balance, cur)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {invoice.status !== 'cancelled' && Number(invoice.balance) > 0 && <PaymentInstructionsBox instructions={instructions} reference={student?.admission_no} />}

                {invoice.notes && invoice.status !== 'cancelled' && <p className="mt-4 text-sm text-white-dark">Note: {invoice.notes}</p>}

                <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-white-light pt-3 text-xs text-white-dark dark:border-[#1b2e4b]">
                    <span>Issued by: {invoice.created_by ?? 'System'}</span>
                    {invoice.journal && (
                        <span className="no-print">
                            Ledger: {can('accounting.view') ? <Link href={`/accounting/journals/${invoice.journal.id}`} className="text-primary hover:underline">{invoice.journal.journal_no}</Link> : invoice.journal.journal_no} ({invoice.journal.status})
                        </span>
                    )}
                    <span>This is a computer-generated invoice.</span>
                </div>
            </div>
            )}
        </>
    );
}
