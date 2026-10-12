import { router, useForm } from '@inertiajs/react';
import { CalendarCheck, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FormGrid, Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, num } from '@/lib/utils';
import { Amt, showErrors } from './_components/report';

type Year = {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
    is_current: boolean;
    journals: number;
    pending: number;
    income: string;
    expenses: string;
    surplus: string;
    reopen_reason: string | null;
};

export default function FiscalYears({ years }: { years: Year[] }) {
    const can = useCan();
    const manage = can('accounting.manage');
    const [editing, setEditing] = useState<Year | null>(null);
    const [open, setOpen] = useState(false);
    const [reopening, setReopening] = useState<Year | null>(null);
    const form = useForm({ name: '', start_date: '', end_date: '' });
    const reopen = useForm({ reason: '' });

    const openForm = (y: Year | null) => {
        setEditing(y);
        form.clearErrors();
        if (y) form.setData({ name: y.name, start_date: y.start_date, end_date: y.end_date });
        else {
            const last = years[0];
            const nextYear = last ? Number(last.end_date.slice(0, 4)) + 1 : new Date().getFullYear();
            form.setData({ name: `FY ${nextYear}`, start_date: `${nextYear}-01-01`, end_date: `${nextYear}-12-31` });
        }
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/accounting/fiscal-years/${editing.id}`, opts);
        else form.post('/accounting/fiscal-years', opts);
    };

    const close = async (y: Year) => {
        const { confirmed } = await confirm({
            title: `Close ${y.name}?`,
            text: 'Closing locks the period: no journal, voucher, receipt or payroll can be posted with a date in this year until it is reopened.',
            confirmText: 'Close year',
            danger: true,
        });
        if (confirmed) router.post(`/accounting/fiscal-years/${y.id}/close`, {}, { preserveScroll: true, onError: showErrors });
    };

    const destroy = async (y: Year) => {
        const { confirmed } = await confirm({ title: `Delete ${y.name}?`, text: 'Only years without journals can be deleted.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/accounting/fiscal-years/${y.id}`, { preserveScroll: true });
    };

    const columns: Column<Year>[] = [
        {
            key: 'name',
            header: 'Fiscal year',
            render: (y) => (
                <div>
                    <div className="font-bold text-black dark:text-white-light">
                        {y.name} {y.is_current && <span className="badge badge-soft-primary ms-1">Current</span>}
                    </div>
                    <div className="text-xs text-white-dark">
                        {date(y.start_date)} – {date(y.end_date)}
                    </div>
                </div>
            ),
        },
        {
            key: 'journals',
            header: 'Journals',
            align: 'center',
            render: (y) => (
                <div className="text-xs">
                    <div className="font-bold">{num(y.journals)} posted</div>
                    {y.pending > 0 && <div className="text-warning">{y.pending} unposted</div>}
                </div>
            ),
        },
        { key: 'income', header: 'Income', align: 'right', render: (y) => <Amt value={y.income} zero /> },
        { key: 'expenses', header: 'Expenses', align: 'right', render: (y) => <Amt value={y.expenses} zero /> },
        { key: 'surplus', header: 'Surplus / (deficit)', align: 'right', render: (y) => <Amt value={y.surplus} bold zero /> },
        {
            key: 'status',
            header: 'Status',
            render: (y) => (
                <div>
                    <StatusBadge status={y.status} />
                    {y.reopen_reason && y.status === 'open' && <div className="mt-0.5 max-w-[200px] truncate text-[11px] text-white-dark" title={y.reopen_reason}>Reopened: {y.reopen_reason}</div>}
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (y) =>
                manage ? (
                    <div className="flex justify-end gap-1">
                        {y.status === 'open' ? (
                            <>
                                <IconButton icon={Pencil} title="Edit" className="text-primary" onClick={() => openForm(y)} />
                                <IconButton icon={Lock} title="Close year" className="text-danger" onClick={() => close(y)} />
                                {y.journals === 0 && y.pending === 0 && <IconButton icon={Trash2} title="Delete" className="text-danger" onClick={() => destroy(y)} />}
                            </>
                        ) : (
                            <IconButton
                                icon={LockOpen}
                                title="Reopen year"
                                className="text-warning"
                                onClick={() => {
                                    reopen.reset();
                                    setReopening(y);
                                }}
                            />
                        )}
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Fiscal Years"
                subtitle="Accounting periods and period locking. Posting into a closed year is blocked by the ledger."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Fiscal Years' }]}
                actions={
                    manage && (
                        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> New fiscal year
                        </button>
                    )
                }
            />

            <div className="panel">
                <DataTable columns={columns} rows={years} empty="No fiscal years defined" />
                <div className="mt-4 flex items-start gap-2 rounded-md bg-info-light p-3 text-xs text-info dark:bg-info-dark-light">
                    <CalendarCheck className="h-4 w-4 shrink-0" />
                    Before closing a year, post or reject all submitted journals and pending vouchers dated in it. Reopening requires a reason and is recorded in the audit log.
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New fiscal year'}>
                <form onSubmit={submit} className="space-y-4">
                    <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                    <FormGrid>
                        <Input label="Start date" type="date" required value={form.data.start_date} onChange={(e) => form.setData('start_date', e.target.value)} error={form.errors.start_date} />
                        <Input label="End date" type="date" required value={form.data.end_date} onChange={(e) => form.setData('end_date', e.target.value)} error={form.errors.end_date} />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!reopening} onClose={() => setReopening(null)} title={`Reopen ${reopening?.name ?? ''}`}>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        reopen.post(`/accounting/fiscal-years/${reopening?.id}/reopen`, { preserveScroll: true, onSuccess: () => setReopening(null) });
                    }}
                >
                    <p className="text-sm text-white-dark">Reopening allows postings into this period again. This is an authorised, audited action (SRS 4.10).</p>
                    <Textarea label="Reason for reopening" required value={reopen.data.reason} onChange={(e) => reopen.setData('reason', e.target.value)} error={reopen.errors.reason} rows={3} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setReopening(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-warning" disabled={reopen.processing}>
                            Reopen year
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
