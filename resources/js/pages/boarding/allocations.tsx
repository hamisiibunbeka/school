import { router, useForm } from '@inertiajs/react';
import { ArrowRightLeft, BedDouble, Building2, CircleOff, History, LogOut, Plus, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, num, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import SearchSelect from './_components/search-select';

type Row = {
    id: number;
    student_id: number;
    student: string;
    admission_no: string;
    photo_url: string | null;
    gender: string;
    class: string;
    dormitory: string;
    room: string;
    room_id: number;
    bed_no: string | null;
    start_date: string;
    end_date: string | null;
    status: string;
};
type Unallocated = { id: number; full_name: string; admission_no: string; gender: string; class: string };
type RoomOption = Option & { gender: string; free: number };
type Props = {
    allocations: Paginated<Row>;
    filters: { search: string; dormitory: string; status: string };
    unallocated: Unallocated[];
    boarders: (Option & { gender: string })[];
    rooms: RoomOption[];
    dormitories: Option[];
    currentYear: string | null;
    stats: { active: number; unallocated: number; capacity: number; ended: number };
};

export default function Allocations({ allocations, filters: initial, unallocated, boarders, rooms, dormitories, currentYear, stats }: Props) {
    const can = useCan();
    const manage = can('boarding.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [transferring, setTransferring] = useState<Row | null>(null);
    const form = useForm({ student_id: '', dormitory_room_id: '', bed_no: '', start_date: today() });
    const transfer = useForm({ dormitory_room_id: '', bed_no: '', date: today() });

    const studentGender = boarders.find((b) => String(b.value) === form.data.student_id)?.gender;
    const roomChoices = (gender?: string) =>
        rooms.filter((r) => !gender || r.gender === 'mixed' || r.gender === gender).map((r) => ({ ...r, label: r.free === 0 ? `${r.label} — FULL` : r.label }));

    const allocate = (s?: Unallocated) => {
        form.clearErrors();
        form.setData({ student_id: s ? String(s.id) : '', dormitory_room_id: '', bed_no: '', start_date: today() });
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/boarding/allocations', { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const endAllocation = async (row: Row) => {
        const { confirmed, value } = await confirm({
            title: `End allocation for ${row.student}?`,
            text: 'The bed becomes free immediately. Give a reason (e.g. moved to day school, transferred).',
            confirmText: 'End allocation',
            danger: true,
            input: 'textarea',
        });
        if (confirmed) router.post(`/boarding/allocations/${row.id}/end`, { end_date: today(), reason: value }, { preserveScroll: true });
    };

    const columns: Column<Row>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (r) => (
                <div className="flex items-center gap-3">
                    <Avatar name={r.student} src={r.photo_url} />
                    <div>
                        <a href={`/students/${r.student_id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {r.student}
                        </a>
                        <div className="text-xs text-white-dark">
                            {r.admission_no} · {r.class || '—'}
                        </div>
                    </div>
                </div>
            ),
        },
        { key: 'dormitory', header: 'Dormitory', render: (r) => <span className="font-semibold">{r.dormitory}</span> },
        { key: 'room', header: 'Room / Bed', render: (r) => `${r.room}${r.bed_no ? ` · Bed ${r.bed_no}` : ''}` },
        { key: 'period', header: 'Period', render: (r) => `${date(r.start_date)} → ${r.end_date ? date(r.end_date) : 'present'}` },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) =>
                manage && r.status === 'active' ? (
                    <div className="flex justify-end gap-1">
                        <IconButton
                            icon={ArrowRightLeft}
                            title="Transfer to another room"
                            className="text-primary"
                            onClick={() => {
                                transfer.clearErrors();
                                transfer.setData({ dormitory_room_id: '', bed_no: '', date: today() });
                                setTransferring(r);
                            }}
                        />
                        <IconButton icon={LogOut} title="End allocation" className="text-danger" onClick={() => endAllocation(r)} />
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Bed Allocations"
                subtitle={`Rooming list for boarding students${currentYear ? ` — ${currentYear}` : ''}.`}
                breadcrumbs={[{ title: 'Boarding', href: '/boarding/dormitories' }, { title: 'Allocations' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => allocate()}>
                            <Plus className="h-4 w-4" /> Allocate bed
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Active allocations" value={num(stats.active)} icon={BedDouble} tone="primary" />
                <StatCard title="Total beds" value={num(stats.capacity)} icon={Building2} tone="info" hint={`${num(Math.max(0, stats.capacity - stats.active))} free`} />
                <StatCard title="Unallocated boarders" value={num(stats.unallocated)} icon={UserX} tone={stats.unallocated ? 'warning' : 'success'} />
                <StatCard title="Ended allocations" value={num(stats.ended)} icon={History} tone="secondary" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <FilterBar
                        actions={
                            Object.values(filters).some(Boolean) && (
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                    Clear filters
                                </button>
                            )
                        }
                    >
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student…" />
                        <FilterSelect value={filters.dormitory} onChange={(v) => setFilter('dormitory', v)} options={dormitories} placeholder="All dormitories" />
                        <FilterSelect
                            value={filters.status}
                            onChange={(v) => setFilter('status', v)}
                            options={[
                                { value: 'active', label: 'Active' },
                                { value: 'ended', label: 'Ended' },
                            ]}
                            placeholder="All statuses"
                        />
                    </FilterBar>
                    <DataTable columns={columns} paginated={allocations} empty="No allocations found" />
                </div>

                <div className="panel h-fit">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-semibold dark:text-white-light">Awaiting a bed</h5>
                        <span className="badge badge-soft-warning">{unallocated.length}</span>
                    </div>
                    {unallocated.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center text-white-dark">
                            <CircleOff className="h-8 w-8" />
                            <span className="text-sm">Every active boarder has a bed.</span>
                        </div>
                    ) : (
                        <ul className="max-h-[520px] space-y-2 overflow-y-auto pe-1">
                            {unallocated.map((s) => (
                                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-white-light p-2 dark:border-[#1b2e4b]">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Avatar name={s.full_name} className="h-8 w-8" />
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold">{s.full_name}</div>
                                            <div className="truncate text-xs text-white-dark">
                                                {s.admission_no} · {s.class} · {s.gender === 'male' ? 'Boy' : 'Girl'}
                                            </div>
                                        </div>
                                    </div>
                                    {manage && (
                                        <button className="btn btn-sm btn-outline-primary shrink-0" onClick={() => allocate(s)}>
                                            Allocate
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Allocate bed" size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <SearchSelect
                        label="Boarding student"
                        required
                        options={boarders}
                        value={form.data.student_id}
                        onChange={(v) => {
                            form.setData((d) => ({ ...d, student_id: v, dormitory_room_id: '' }));
                        }}
                        placeholder="Type a name or admission no…"
                        error={form.errors.student_id}
                    />
                    <FormGrid>
                        <Select
                            label="Dormitory / room"
                            required
                            placeholder="Select room…"
                            value={form.data.dormitory_room_id}
                            onChange={(e) => form.setData('dormitory_room_id', e.target.value)}
                            options={roomChoices(studentGender)}
                            error={form.errors.dormitory_room_id}
                            help={studentGender ? `Showing ${studentGender === 'male' ? 'boys' : 'girls'} and mixed dormitories.` : undefined}
                        />
                        <Input label="Bed no." value={form.data.bed_no} onChange={(e) => form.setData('bed_no', e.target.value)} error={form.errors.bed_no} placeholder="e.g. 4A" />
                        <Input label="Start date" type="date" required value={form.data.start_date} onChange={(e) => form.setData('start_date', e.target.value)} error={form.errors.start_date} />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Allocate
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!transferring} onClose={() => setTransferring(null)} title={`Transfer ${transferring?.student ?? ''}`}>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        transfer.post(`/boarding/allocations/${transferring?.id}/transfer`, { preserveScroll: true, onSuccess: () => setTransferring(null) });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm text-white-dark">
                        Currently in <strong>{transferring?.dormitory}</strong> / {transferring?.room}
                        {transferring?.bed_no ? ` bed ${transferring.bed_no}` : ''}. The current allocation is ended and a new one starts on the date below.
                    </p>
                    <Select
                        label="New room"
                        required
                        placeholder="Select room…"
                        value={transfer.data.dormitory_room_id}
                        onChange={(e) => transfer.setData('dormitory_room_id', e.target.value)}
                        options={roomChoices(transferring?.gender).filter((r) => r.value !== transferring?.room_id)}
                        error={transfer.errors.dormitory_room_id}
                    />
                    <FormGrid>
                        <Input label="Bed no." value={transfer.data.bed_no} onChange={(e) => transfer.setData('bed_no', e.target.value)} error={transfer.errors.bed_no} />
                        <Input label="Effective date" type="date" required value={transfer.data.date} onChange={(e) => transfer.setData('date', e.target.value)} error={transfer.errors.date} />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setTransferring(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={transfer.processing}>
                            Transfer
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
