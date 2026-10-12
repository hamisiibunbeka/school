import { router, useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Clock, DoorOpen, Hourglass, LogIn, LogOut, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, dateTime, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import SearchSelect from './_components/search-select';

type Pass = {
    id: number;
    student_id: number;
    student: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    reason: string;
    departure_at: string;
    expected_return_at: string;
    returned_at: string | null;
    pickup_person: string | null;
    pickup_phone: string | null;
    status: string;
    is_overdue: boolean;
    approved_by: string | null;
};
type StudentOption = Option & { guardian: string | null; guardian_phone: string | null };
type Props = {
    passes: Paginated<Pass>;
    filters: { search: string; status: string };
    students: StudentOption[];
    stats: { pending: number; approved: number; out: number; overdue: number; returned_month: number };
};

const nowLocal = (addHours = 0) => {
    const d = new Date(Date.now() + addHours * 3600 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
};

const blank = { student_id: '', reason: '', departure_at: nowLocal(), expected_return_at: nowLocal(48), pickup_person: '', pickup_phone: '' };

export default function LeavePasses({ passes, filters: initial, students, stats }: Props) {
    const can = useCan();
    const manage = can('boarding.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Pass | null>(null);
    const form = useForm(blank);

    const openForm = (p: Pass | null) => {
        setEditing(p);
        form.clearErrors();
        form.setData(
            p
                ? { student_id: String(p.student_id), reason: p.reason, departure_at: p.departure_at, expected_return_at: p.expected_return_at, pickup_person: p.pickup_person ?? '', pickup_phone: p.pickup_phone ?? '' }
                : { ...blank, departure_at: nowLocal(), expected_return_at: nowLocal(48) },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/boarding/leave-passes/${editing.id}`, opts);
        else form.post('/boarding/leave-passes', opts);
    };

    const act = async (p: Pass, action: 'approve' | 'reject' | 'depart' | 'return' | 'delete') => {
        const texts = {
            approve: { title: `Approve leave for ${p.student}?`, text: `Pickup: ${p.pickup_person ?? '—'} (${p.pickup_phone ?? '—'})`, confirmText: 'Approve' },
            reject: { title: `Reject leave for ${p.student}?`, text: 'Give a reason — it is kept in the audit trail.', confirmText: 'Reject' },
            depart: { title: `Record departure of ${p.student}?`, text: `Confirm the student is leaving now with ${p.pickup_person ?? 'the authorised pickup person'}.`, confirmText: 'Student has left' },
            return: { title: `Record return of ${p.student}?`, text: 'Confirm the student has reported back to the dormitory.', confirmText: 'Student returned' },
            delete: { title: 'Delete this leave pass?', text: 'This cannot be undone.', confirmText: 'Delete' },
        }[action];
        const { confirmed, value } = await confirm({ ...texts, danger: action === 'reject' || action === 'delete', input: action === 'reject' ? 'textarea' : undefined });
        if (!confirmed) return;
        if (action === 'delete') router.delete(`/boarding/leave-passes/${p.id}`, { preserveScroll: true });
        else router.post(`/boarding/leave-passes/${p.id}/${action}`, action === 'reject' ? { reason: value } : {}, { preserveScroll: true });
    };

    const columns: Column<Pass>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (p) => (
                <div className="flex items-center gap-3">
                    <Avatar name={p.student} src={p.photo_url} />
                    <div>
                        <div className="font-bold text-black dark:text-white-light">{p.student}</div>
                        <div className="text-xs text-white-dark">
                            {p.admission_no} · {p.class}
                        </div>
                    </div>
                </div>
            ),
        },
        { key: 'reason', header: 'Reason', render: (p) => <span className="line-clamp-2 max-w-[220px]">{p.reason}</span> },
        {
            key: 'pickup',
            header: 'Pickup person',
            render: (p) => (
                <div>
                    <div className="font-semibold">{p.pickup_person ?? '—'}</div>
                    <div className="text-xs text-white-dark">{p.pickup_phone}</div>
                </div>
            ),
        },
        {
            key: 'dates',
            header: 'Departure → Return',
            render: (p) => (
                <div className="text-xs">
                    <div>{dateTime(p.departure_at)}</div>
                    <div className={cn(p.is_overdue && 'font-bold text-danger')}>
                        → {dateTime(p.expected_return_at)}
                        {p.returned_at && <span className="block text-success">Back {dateTime(p.returned_at)}</span>}
                    </div>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (p) => (p.is_overdue ? <StatusBadge status="overdue" label="Overdue" /> : <StatusBadge status={p.status} />),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (p) =>
                manage ? (
                    <div className="flex justify-end gap-1">
                        {p.status === 'pending' && <IconButton icon={CheckCircle2} title="Approve" className="text-success" onClick={() => act(p, 'approve')} />}
                        {['pending', 'approved'].includes(p.status) && <IconButton icon={XCircle} title="Reject" className="text-danger" onClick={() => act(p, 'reject')} />}
                        {p.status === 'approved' && <IconButton icon={LogOut} title="Record departure" className="text-warning" onClick={() => act(p, 'depart')} />}
                        {p.status === 'out' && <IconButton icon={LogIn} title="Record return" className="text-primary" onClick={() => act(p, 'return')} />}
                        {['pending', 'approved'].includes(p.status) && <IconButton icon={Pencil} title="Edit" className="text-primary" onClick={() => openForm(p)} />}
                        {['pending', 'rejected'].includes(p.status) && <IconButton icon={Trash2} title="Delete" className="text-danger" onClick={() => act(p, 'delete')} />}
                    </div>
                ) : null,
        },
    ];

    const selectedStudent = students.find((s) => String(s.value) === form.data.student_id);

    return (
        <>
            <PageHeader
                title="Leave & Exeat Passes"
                subtitle="Weekend and home leave with guardian authorisation, departure and return tracking."
                breadcrumbs={[{ title: 'Boarding', href: '/boarding/dormitories' }, { title: 'Leave passes' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> New leave pass
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Pending approval" value={num(stats.pending)} icon={Hourglass} tone="warning" hint={`${stats.approved} approved, not yet left`} />
                <StatCard title="Currently out" value={num(stats.out)} icon={DoorOpen} tone="info" />
                <StatCard title="Overdue returns" value={num(stats.overdue)} icon={AlertTriangle} tone={stats.overdue ? 'danger' : 'success'} />
                <StatCard title="Returned this month" value={num(stats.returned_month)} icon={Clock} tone="success" />
            </div>

            {stats.overdue > 0 && filters.status !== 'overdue' && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-light p-4 text-danger dark:bg-danger-dark-light">
                    <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-5 w-5" /> {stats.overdue} student{stats.overdue > 1 ? 's have' : ' has'} not returned by the expected time. Contact the guardians.
                    </div>
                    <button className="btn btn-sm btn-danger" onClick={() => setFilter('status', 'overdue')}>
                        Show overdue
                    </button>
                </div>
            )}

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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student or pickup person…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={['pending', 'approved', 'out', 'overdue', 'returned', 'rejected'].map((s) => ({ value: s, label: s === 'out' ? 'Out of school' : s[0].toUpperCase() + s.slice(1) }))}
                        placeholder="All statuses"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={passes} empty="No leave passes found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit leave pass' : 'New leave pass'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <SearchSelect
                        label="Boarding student"
                        required
                        options={students}
                        value={form.data.student_id}
                        disabled={!!editing}
                        onChange={(v, o) =>
                            form.setData((d) => ({
                                ...d,
                                student_id: v,
                                pickup_person: d.pickup_person || o?.guardian || '',
                                pickup_phone: d.pickup_phone || o?.guardian_phone || '',
                            }))
                        }
                        error={form.errors.student_id}
                        help={selectedStudent?.guardian ? `Primary guardian: ${selectedStudent.guardian} · ${selectedStudent.guardian_phone ?? ''}` : undefined}
                    />
                    <Input label="Reason" required value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} error={form.errors.reason} placeholder="e.g. Weekend home visit, medical appointment" />
                    <FormGrid>
                        <Input label="Departure" type="datetime-local" required value={form.data.departure_at} onChange={(e) => form.setData('departure_at', e.target.value)} error={form.errors.departure_at} />
                        <Input label="Expected return" type="datetime-local" required value={form.data.expected_return_at} onChange={(e) => form.setData('expected_return_at', e.target.value)} error={form.errors.expected_return_at} />
                        <Input label="Authorised pickup person" required value={form.data.pickup_person} onChange={(e) => form.setData('pickup_person', e.target.value)} error={form.errors.pickup_person} />
                        <Input label="Pickup phone" required value={form.data.pickup_phone} onChange={(e) => form.setData('pickup_phone', e.target.value)} error={form.errors.pickup_phone} />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {editing ? 'Save changes' : 'Submit request'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
