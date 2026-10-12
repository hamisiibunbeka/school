import { Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Info, Link2, Lock, Pencil, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import { Input, Textarea } from '@/components/ui/form';
import Letterhead from '@/components/ui/letterhead';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { confirm } from '@/lib/swal';
import { date, dateTime, titleCase, today } from '@/lib/utils';
import { fmtZero, showErrors } from '../_components/report';
import { AuditTrail, Banner, Meta, Signature, type Audit } from '../_components/shared';
import { amountInWords } from '../_components/words';

type Line = { id: number; account_id: number; code: string; account: string; is_control: boolean; narration: string | null; debit: string; credit: string };
type Journal = {
    id: number;
    journal_no: string;
    date: string;
    type: string;
    reference: string | null;
    narration: string;
    total: string;
    status: string;
    creator: string | null;
    approver: string | null;
    created_by: number | null;
    created_at: string | null;
    posted_at: string | null;
    source: { label: string; url: string | null; type: string } | null;
    reversal_of: { id: number; journal_no: string } | null;
    reversed_by: { id: number; journal_no: string; date: string } | null;
    rejection_reason: string | null;
    lines: Line[];
};
type Props = {
    journal: Journal;
    audits: Audit[];
    permissions: { edit: boolean; submit: boolean; approve: boolean; reverse: boolean; is_maker: boolean };
    reverseBlockedReason: string | null;
};

export default function JournalShow({ journal, audits, permissions, reverseBlockedReason }: Props) {
    const [rejectOpen, setRejectOpen] = useState(false);
    const [reverseOpen, setReverseOpen] = useState(false);
    const reject = useForm({ reason: '' });
    const reverse = useForm({ reason: '', date: today() });

    const totalDr = journal.lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCr = journal.lines.reduce((s, l) => s + Number(l.credit), 0);

    const submit = async () => {
        const { confirmed } = await confirm({ title: 'Submit for approval?', text: 'A different user with accounting rights must approve and post it.', confirmText: 'Submit' });
        if (confirmed) router.post(`/accounting/journals/${journal.id}/submit`, {}, { preserveScroll: true, onError: showErrors });
    };
    const approve = async () => {
        const { confirmed } = await confirm({ title: `Approve & post ${journal.journal_no}?`, text: 'Posting updates the ledger. Posted journals cannot be edited — only reversed.', confirmText: 'Approve & post' });
        if (confirmed) router.post(`/accounting/journals/${journal.id}/approve`, {}, { preserveScroll: true, onError: showErrors });
    };
    const destroy = async () => {
        const { confirmed } = await confirm({ title: `Delete ${journal.journal_no}?`, text: 'Unposted journal will be removed.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/accounting/journals/${journal.id}`);
    };

    return (
        <>
            <PageHeader
                title={`Journal ${journal.journal_no}`}
                subtitle={journal.narration}
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Journals', href: '/accounting/journals' }, { title: journal.journal_no }]}
                actions={
                    <>
                        {permissions.edit && (
                            <>
                                <Link href={`/accounting/journals/${journal.id}/edit`} className="btn btn-outline-primary">
                                    <Pencil className="h-4 w-4" /> Edit
                                </Link>
                                <button type="button" className="btn btn-outline-danger" onClick={destroy}>
                                    <Trash2 className="h-4 w-4" /> Delete
                                </button>
                            </>
                        )}
                        {permissions.submit && (
                            <button type="button" className="btn btn-info" onClick={submit}>
                                <Send className="h-4 w-4" /> Submit
                            </button>
                        )}
                        {permissions.approve && (
                            <>
                                <button type="button" className="btn btn-outline-danger" onClick={() => setRejectOpen(true)}>
                                    <XCircle className="h-4 w-4" /> Reject
                                </button>
                                <button type="button" className="btn btn-success" onClick={approve}>
                                    <CheckCircle2 className="h-4 w-4" /> Approve & post
                                </button>
                            </>
                        )}
                        {permissions.reverse && (
                            <button type="button" className="btn btn-outline-warning" onClick={() => setReverseOpen(true)}>
                                <Undo2 className="h-4 w-4" /> Reverse
                            </button>
                        )}
                        <PrintButton label="Print voucher" />
                    </>
                }
            />

            <div className="no-print space-y-3">
                {journal.status === 'submitted' && permissions.is_maker && !permissions.approve && (
                    <Banner tone="info" icon={Info} title="Awaiting checker">
                        You prepared this journal. Separation of duties requires another user with accounting rights to approve and post it.
                    </Banner>
                )}
                {journal.status === 'rejected' && (
                    <Banner tone="danger" icon={XCircle} title="Rejected">
                        {journal.rejection_reason ?? 'Returned to the maker.'}
                    </Banner>
                )}
                {journal.reversed_by && (
                    <Banner tone="warning" icon={Undo2} title="Reversed">
                        This journal was reversed by{' '}
                        <Link href={`/accounting/journals/${journal.reversed_by.id}`} className="font-bold underline">
                            {journal.reversed_by.journal_no}
                        </Link>{' '}
                        on {date(journal.reversed_by.date)}.
                    </Banner>
                )}
                {journal.reversal_of && (
                    <Banner tone="info" icon={Undo2} title="Reversal journal">
                        Mirror-image reversal of{' '}
                        <Link href={`/accounting/journals/${journal.reversal_of.id}`} className="font-bold underline">
                            {journal.reversal_of.journal_no}
                        </Link>
                        .
                    </Banner>
                )}
                {reverseBlockedReason && (
                    <Banner tone="secondary" icon={Lock} title="Sub-ledger journal">
                        {reverseBlockedReason}
                    </Banner>
                )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="print-only">
                        <Letterhead title="Journal Voucher" meta={<div className="font-mono font-bold">{journal.journal_no}</div>} />
                    </div>
                    <div className="mb-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                        <Meta label="Journal no." value={<span className="font-mono">{journal.journal_no}</span>} />
                        <Meta label="Date" value={date(journal.date)} />
                        <Meta label="Type" value={titleCase(journal.type)} />
                        <Meta label="Status" value={<StatusBadge status={journal.status} />} />
                        <Meta label="Reference" value={journal.reference ?? '—'} />
                        <Meta
                            label="Source"
                            value={
                                journal.source ? (
                                    journal.source.url ? (
                                        <Link href={journal.source.url} className="inline-flex items-center gap-1 text-primary hover:underline">
                                            <Link2 className="h-3.5 w-3.5" /> {journal.source.label}
                                        </Link>
                                    ) : (
                                        journal.source.label
                                    )
                                ) : (
                                    'Manual entry'
                                )
                            }
                        />
                        <Meta label="Posted at" value={dateTime(journal.posted_at)} />
                        <Meta label="Amount" value={<span className="font-mono font-bold">{fmtZero(journal.total)}</span>} />
                    </div>
                    <div className="mb-4 rounded-md bg-[#fbfbfb] p-3 text-sm dark:bg-[#121c2c]">
                        <span className="font-semibold">Narration: </span>
                        {journal.narration}
                    </div>

                    <div className="table-responsive">
                        <table className="table table-compact">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Account</th>
                                    <th>Narration</th>
                                    <th className="text-end!">Debit</th>
                                    <th className="text-end!">Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {journal.lines.map((l) => (
                                    <tr key={l.id}>
                                        <td className="font-mono">{l.code}</td>
                                        <td>
                                            <Link href={`/accounting/ledger?account=${l.account_id}&from=${journal.date}&to=${journal.date}`} className={`font-semibold hover:underline ${Number(l.credit) > 0 ? 'ps-6' : ''}`}>
                                                {l.account}
                                            </Link>
                                            {l.is_control && <Lock className="ms-1 inline h-3 w-3 text-warning" />}
                                        </td>
                                        <td className="text-xs text-white-dark">{l.narration ?? '—'}</td>
                                        <td className="text-end! font-mono">{Number(l.debit) ? fmtZero(l.debit) : ''}</td>
                                        <td className="text-end! font-mono">{Number(l.credit) ? fmtZero(l.credit) : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-black/40 dark:border-white/30">
                                    <td colSpan={3} className="text-end! font-extrabold uppercase">
                                        Totals
                                    </td>
                                    <td className="text-end! font-mono font-extrabold underline decoration-double">{fmtZero(totalDr)}</td>
                                    <td className="text-end! font-mono font-extrabold underline decoration-double">{fmtZero(totalCr)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="mt-3 text-xs text-white-dark italic">Amount in words: {amountInWords(journal.total)}</p>

                    <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs">
                        <Signature label="Prepared by (maker)" name={journal.creator} sub={dateTime(journal.created_at)} />
                        <Signature label="Approved & posted by (checker)" name={journal.approver} sub={journal.posted_at ? dateTime(journal.posted_at) : ''} />
                        <Signature label="Received / Verified" name={null} sub="" />
                    </div>
                </div>

                <AuditTrail audits={audits} />
            </div>

            <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={`Reject ${journal.journal_no}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        reject.post(`/accounting/journals/${journal.id}/reject`, { preserveScroll: true, onSuccess: () => setRejectOpen(false), onError: showErrors });
                    }}
                >
                    <Textarea label="Reason for rejection" required value={reject.data.reason} onChange={(e) => reject.setData('reason', e.target.value)} error={reject.errors.reason} rows={4} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setRejectOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-danger" disabled={reject.processing}>
                            Reject journal
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={reverseOpen} onClose={() => setReverseOpen(false)} title={`Reverse ${journal.journal_no}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        reverse.post(`/accounting/journals/${journal.id}/reverse`, { onSuccess: () => setReverseOpen(false), onError: showErrors });
                    }}
                >
                    <div className="flex gap-2 rounded-md bg-warning-light p-3 text-xs text-warning dark:bg-warning-dark-light">
                        <AlertTriangle className="h-4 w-4 shrink-0" />A mirror-image journal will be posted on the reversal date. The original stays in the ledger for the audit trail.
                    </div>
                    <Input label="Reversal date" type="date" required value={reverse.data.date} onChange={(e) => reverse.setData('date', e.target.value)} error={reverse.errors.date} />
                    <Textarea label="Reason" required value={reverse.data.reason} onChange={(e) => reverse.setData('reason', e.target.value)} error={reverse.errors.reason} rows={3} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setReverseOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-warning" disabled={reverse.processing}>
                            Post reversal
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
