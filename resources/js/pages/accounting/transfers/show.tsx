import { Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowRight, Ban, CheckCircle2, Info, XCircle } from 'lucide-react';
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
import type { TransferRow } from './index';

type Transfer = TransferRow & {
    charge_account: string | null;
    created_at: string | null;
    rejection_reason: string | null;
    void_reason: string | null;
    journal: { id: number; journal_no: string; status: string; lines: { id: number; code: string; account: string; debit: string; credit: string }[] } | null;
};

export default function TransferShow({ transfer: t, audits }: { transfer: Transfer; audits: Audit[] }) {
    const can = useCan();
    const { school, auth } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [mode, setMode] = useState<'reject' | 'void' | null>(null);
    const reason = useForm({ reason: '' });
    const isMaker = t.created_by === auth.user?.id;

    const approve = async () => {
        const { confirmed } = await confirm({
            title: `Approve ${t.transfer_no}?`,
            text: `Post ${money(t.amount, cur)} from ${t.from_account} to ${t.to_account} to the ledger.`,
            confirmText: 'Approve & post',
        });
        if (confirmed) router.post(`/accounting/transfers/${t.id}/approve`, {}, { preserveScroll: true, onError: showErrors });
    };

    return (
        <>
            <PageHeader
                title={`Fund transfer ${t.transfer_no}`}
                subtitle={t.description}
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Fund Transfers', href: '/accounting/transfers' }, { title: t.transfer_no }]}
                actions={
                    <>
                        {t.can_approve && (
                            <>
                                <button type="button" className="btn btn-outline-danger" onClick={() => setMode('reject')}>
                                    <XCircle className="h-4 w-4" /> Reject
                                </button>
                                <button type="button" className="btn btn-success" onClick={approve}>
                                    <CheckCircle2 className="h-4 w-4" /> Approve & post
                                </button>
                            </>
                        )}
                        {can('accounting.manage') && t.status === 'posted' && (
                            <button type="button" className="btn btn-outline-warning" onClick={() => setMode('void')}>
                                <Ban className="h-4 w-4" /> Void
                            </button>
                        )}
                        <PrintButton label="Print transfer" />
                    </>
                }
            />

            <div className="no-print mb-5 space-y-3">
                {t.status === 'pending' && isMaker && !auth.user?.is_super_admin && (
                    <Banner tone="info" icon={Info} title="Awaiting approval">
                        You raised this transfer; a different user with accounting rights must approve it.
                    </Banner>
                )}
                {t.status === 'rejected' && (
                    <Banner tone="danger" icon={XCircle} title="Rejected">
                        {t.rejection_reason ?? '—'}
                    </Banner>
                )}
                {t.status === 'void' && (
                    <Banner tone="warning" icon={Ban} title="Voided">
                        {t.void_reason ?? 'The transfer journal has been reversed.'}
                    </Banner>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="print-only">
                        <Letterhead title="Fund Transfer Voucher" meta={<div className="font-mono font-bold">{t.transfer_no}</div>} />
                    </div>

                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3 text-lg font-bold text-black dark:text-white-light">
                            <span>{t.from_account}</span>
                            <ArrowRight className="h-5 w-5 text-primary" />
                            <span>{t.to_account}</span>
                        </div>
                        <div className="text-end">
                            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">Amount</div>
                            <div className="font-mono text-2xl font-extrabold text-primary">
                                {cur} {fmtZero(t.amount)}
                            </div>
                            <StatusBadge status={t.status} />
                        </div>
                    </div>

                    <div className="mb-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                        <Meta label="Transfer no." value={<span className="font-mono">{t.transfer_no}</span>} />
                        <Meta label="Date" value={date(t.date)} />
                        <Meta label="Method" value={titleCase(t.method)} />
                        <Meta label="Reference" value={t.reference ?? '—'} />
                        <Meta label="Charges" value={Number(t.charges) ? `${cur} ${fmtZero(t.charges)}` : '—'} />
                        <Meta label="Total leaving source" value={`${cur} ${fmtZero(t.total_out)}`} />
                        {t.charge_account && <Meta label="Charges posted to" value={t.charge_account} />}
                    </div>

                    <div className="mb-4 rounded-md bg-[#fbfbfb] p-3 text-sm dark:bg-[#121c2c]">
                        <div>
                            <span className="font-semibold">Being: </span>
                            {t.description}
                        </div>
                        <div className="mt-1 text-xs text-white-dark italic">Amount in words: {amountInWords(t.amount)}</div>
                    </div>

                    {t.journal && (
                        <>
                            <h6 className="mb-2 text-sm font-bold">
                                Ledger posting —{' '}
                                <Link href={`/accounting/journals/${t.journal.id}`} className="font-mono text-primary hover:underline">
                                    {t.journal.journal_no}
                                </Link>{' '}
                                <StatusBadge status={t.journal.status} />
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
                                        {t.journal.lines.map((l) => (
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

                    <div className="mt-12 grid grid-cols-2 gap-6 text-center text-xs">
                        <Signature label="Prepared by" name={t.creator} sub={dateTime(t.created_at)} />
                        <Signature label="Approved by" name={t.approver} sub="" />
                    </div>
                </div>

                <AuditTrail audits={audits} />
            </div>

            <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === 'void' ? `Void ${t.transfer_no}` : `Reject ${t.transfer_no}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        reason.post(`/accounting/transfers/${t.id}/${mode}`, {
                            preserveScroll: true,
                            onSuccess: () => {
                                setMode(null);
                                reason.reset();
                            },
                            onError: showErrors,
                        });
                    }}
                >
                    {mode === 'void' && (
                        <p className="text-sm text-white-dark">Voiding posts a reversal journal dated today; the original transfer journal remains in the ledger.</p>
                    )}
                    <Textarea label="Reason" required value={reason.data.reason} onChange={(e) => reason.setData('reason', e.target.value)} error={reason.errors.reason} rows={3} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setMode(null)}>
                            Cancel
                        </button>
                        <button className={mode === 'void' ? 'btn btn-warning' : 'btn btn-danger'} disabled={reason.processing}>
                            {mode === 'void' ? 'Void transfer' : 'Reject transfer'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
