import { Link, router, useForm } from '@inertiajs/react';
import { BedDouble, Building2, DoorOpen, Pencil, Plus, ShieldCheck, Trash2, UserX, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import OccupancyBar from './_components/occupancy-bar';

type Room = { id: number; name: string; capacity: number; occupied: number };
type Dorm = {
    id: number;
    name: string;
    gender: string;
    capacity: number;
    occupied: number;
    description: string | null;
    caretakers: Caretaker[];
    rooms: Room[];
};
type Caretaker = { employee_id: number; role: string; name: string | null; phone: string | null };
type CaretakerInput = { employee_id: string | number; role: string };
type Props = {
    dormitories: Dorm[];
    staff: Option[];
    stats: { dormitories: number; rooms: number; capacity: number; occupied: number; boarders: number; unallocated: number; out_on_leave: number; overdue: number };
};

const genderLabel: Record<string, string> = { male: 'Boys', female: 'Girls', mixed: 'Mixed' };
const roleLabel: Record<string, string> = { patron: 'Patron', matron: 'Matron', assistant: 'Assistant' };
const defaultRole = (gender: string) => (gender === 'female' ? 'matron' : 'patron');
const genderTone: Record<string, string> = { male: 'badge-soft-info', female: 'badge-soft-secondary', mixed: 'badge-soft-dark' };

export default function Dormitories({ dormitories, staff, stats }: Props) {
    const can = useCan();
    const manage = can('boarding.manage');
    const [dormOpen, setDormOpen] = useState(false);
    const [editing, setEditing] = useState<Dorm | null>(null);
    const [roomFor, setRoomFor] = useState<{ dorm: Dorm; room: Room | null } | null>(null);
    const dormForm = useForm({ name: '', gender: 'male', description: '', caretakers: [] as CaretakerInput[] });
    const roomForm = useForm({ name: '', capacity: '6' as string | number });

    const openDorm = (d: Dorm | null) => {
        setEditing(d);
        dormForm.clearErrors();
        dormForm.setData(
            d
                ? { name: d.name, gender: d.gender, description: d.description ?? '', caretakers: d.caretakers.map((c) => ({ employee_id: c.employee_id, role: c.role })) }
                : { name: '', gender: 'male', description: '', caretakers: [{ employee_id: '', role: 'patron' }] },
        );
        setDormOpen(true);
    };

    const setCaretaker = (i: number, patch: Partial<CaretakerInput>) =>
        dormForm.setData(
            'caretakers',
            dormForm.data.caretakers.map((c, j) => (j === i ? { ...c, ...patch } : c)),
        );
    const caretakerError = (i: number) => {
        const errors = dormForm.errors as Record<string, string | undefined>;
        return errors[`caretakers.${i}.employee_id`] ?? errors[`caretakers.${i}.role`];
    };

    const openRoom = (dorm: Dorm, room: Room | null) => {
        roomForm.clearErrors();
        roomForm.setData(room ? { name: room.name, capacity: room.capacity } : { name: `Room ${dorm.rooms.length + 1}`, capacity: 6 });
        setRoomFor({ dorm, room });
    };

    const submitDorm = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setDormOpen(false) };
        if (editing) dormForm.put(`/boarding/dormitories/${editing.id}`, opts);
        else dormForm.post('/boarding/dormitories', opts);
    };

    const submitRoom = (e: FormEvent) => {
        e.preventDefault();
        if (!roomFor) return;
        const opts = { preserveScroll: true, onSuccess: () => setRoomFor(null) };
        if (roomFor.room) roomForm.put(`/boarding/rooms/${roomFor.room.id}`, opts);
        else roomForm.post(`/boarding/dormitories/${roomFor.dorm.id}/rooms`, opts);
    };

    const remove = async (url: string, label: string) => {
        const { confirmed } = await confirm({ title: `Delete this ${label}?`, text: 'This cannot be undone.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(url, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader
                title="Boarding & Dormitories"
                subtitle="Hostels, rooms, capacities and live occupancy."
                breadcrumbs={[{ title: 'Boarding' }, { title: 'Dormitories' }]}
                actions={
                    <>
                        <Link href="/boarding/allocations" className="btn btn-outline-primary">
                            <BedDouble className="h-4 w-4" /> Bed allocations
                        </Link>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openDorm(null)}>
                                <Plus className="h-4 w-4" /> Add dormitory
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Dormitories" value={num(stats.dormitories)} icon={Building2} tone="primary" hint={`${num(stats.rooms)} rooms`} />
                <StatCard
                    title="Beds occupied"
                    value={`${num(stats.occupied)} / ${num(stats.capacity)}`}
                    icon={BedDouble}
                    tone="success"
                    hint={`${num(Math.max(0, stats.capacity - stats.occupied))} beds free`}
                />
                <StatCard
                    title="Unallocated boarders"
                    value={num(stats.unallocated)}
                    icon={UserX}
                    tone={stats.unallocated ? 'warning' : 'info'}
                    hint={`${num(stats.boarders)} active boarders`}
                />
                <StatCard
                    title="Out on leave"
                    value={num(stats.out_on_leave)}
                    icon={Users}
                    tone={stats.overdue ? 'danger' : 'secondary'}
                    hint={stats.overdue ? `${stats.overdue} overdue return` : 'None overdue'}
                />
            </div>

            {stats.capacity > 0 && (
                <div className="panel mb-6">
                    <div className="mb-3 flex items-center justify-between">
                        <h5 className="text-lg font-semibold dark:text-white-light">Overall occupancy</h5>
                        <span className="text-xs text-white-dark">All dormitories</span>
                    </div>
                    <OccupancyBar value={stats.occupied} max={stats.capacity} />
                </div>
            )}

            {dormitories.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No dormitories yet" description="Add a dormitory, then its rooms and bed capacity." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {dormitories.map((d) => (
                        <div key={d.id} className="panel">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="grid h-11 w-11 place-content-center rounded-xl bg-primary-light text-primary dark:bg-primary-dark-light">
                                        <Building2 className="h-5 w-5" />
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h5 className="text-lg font-bold text-black dark:text-white-light">{d.name}</h5>
                                            <span className={`badge ${genderTone[d.gender] ?? 'badge-soft-dark'}`}>{genderLabel[d.gender] ?? titleCase(d.gender)}</span>
                                        </div>
                                        {d.caretakers.length === 0 ? (
                                            <div className="flex items-center gap-1 text-xs text-warning">
                                                <ShieldCheck className="h-3.5 w-3.5" /> No patron / matron assigned
                                            </div>
                                        ) : (
                                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white-dark">
                                                {d.caretakers.map((c) => (
                                                    <span key={c.employee_id} className="inline-flex items-center gap-1">
                                                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                                        <span className="font-semibold text-black dark:text-white-light">{roleLabel[c.role] ?? titleCase(c.role)}:</span> {c.name}
                                                        {c.phone && <span>· {c.phone}</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {manage && (
                                    <div className="flex gap-1">
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => openRoom(d, null)}>
                                            <Plus className="h-3.5 w-3.5" /> Room
                                        </button>
                                        <button className="btn btn-sm btn-outline-dark" title="Edit" onClick={() => openDorm(d)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => remove(`/boarding/dormitories/${d.id}`, 'dormitory')}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            {d.description && <p className="mb-3 text-sm text-white-dark">{d.description}</p>}
                            <OccupancyBar value={d.occupied} max={d.capacity} className="mb-5" />

                            {d.rooms.length === 0 ? (
                                <p className="rounded-md border border-dashed border-white-light p-4 text-center text-sm text-white-dark dark:border-[#1b2e4b]">No rooms yet.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {d.rooms.map((r) => (
                                        <div key={r.id} className="group rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                                            <div className="mb-2 flex items-center justify-between">
                                                <div className="flex items-center gap-2 font-semibold">
                                                    <DoorOpen className="h-4 w-4 text-primary" /> {r.name}
                                                </div>
                                                {manage && (
                                                    <div className="flex gap-1 opacity-70 group-hover:opacity-100">
                                                        <button type="button" className="text-primary" title="Edit room" onClick={() => openRoom(d, r)}>
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button type="button" className="text-danger" title="Delete room" onClick={() => remove(`/boarding/rooms/${r.id}`, 'room')}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <OccupancyBar value={r.occupied} max={r.capacity} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Modal open={dormOpen} onClose={() => setDormOpen(false)} title={editing ? 'Edit dormitory' : 'Add dormitory'}>
                <form onSubmit={submitDorm} className="space-y-4">
                    <Input
                        label="Name"
                        required
                        value={dormForm.data.name}
                        onChange={(e) => dormForm.setData('name', e.target.value)}
                        error={dormForm.errors.name}
                        placeholder="e.g. Kilimanjaro House"
                    />
                    <FormGrid>
                        <Select
                            label="Gender policy"
                            required
                            value={dormForm.data.gender}
                            onChange={(e) => dormForm.setData('gender', e.target.value)}
                            error={dormForm.errors.gender}
                            options={[
                                { value: 'male', label: 'Boys' },
                                { value: 'female', label: 'Girls' },
                                { value: 'mixed', label: 'Mixed' },
                            ]}
                        />
                    </FormGrid>
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label className="mb-0">Patrons / matrons</label>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() =>
                                    dormForm.setData('caretakers', [
                                        ...dormForm.data.caretakers,
                                        { employee_id: '', role: dormForm.data.caretakers.length ? 'assistant' : defaultRole(dormForm.data.gender) },
                                    ])
                                }
                            >
                                <Plus className="h-3.5 w-3.5" /> Add
                            </button>
                        </div>
                        {dormForm.data.caretakers.length === 0 && <p className="text-xs text-white-dark">Nobody assigned yet.</p>}
                        <div className="space-y-2">
                            {dormForm.data.caretakers.map((c, i) => (
                                <div key={i}>
                                    <div className="flex items-start gap-2">
                                        <select className="form-select flex-1" value={c.employee_id} onChange={(e) => setCaretaker(i, { employee_id: e.target.value })}>
                                            <option value="">— Select staff member —</option>
                                            {staff.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                        <select className="form-select w-36" value={c.role} onChange={(e) => setCaretaker(i, { role: e.target.value })}>
                                            {Object.entries(roleLabel).map(([v, l]) => (
                                                <option key={v} value={v}>
                                                    {l}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn btn-outline-danger px-2.5"
                                            title="Remove"
                                            onClick={() =>
                                                dormForm.setData(
                                                    'caretakers',
                                                    dormForm.data.caretakers.filter((_, j) => j !== i),
                                                )
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {caretakerError(i) && <p className="mt-1 text-xs text-danger">{caretakerError(i)}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <Input
                        label="Description"
                        value={dormForm.data.description}
                        onChange={(e) => dormForm.setData('description', e.target.value)}
                        error={dormForm.errors.description}
                    />
                    <p className="text-xs text-white-dark">Capacity is calculated automatically from the rooms you add.</p>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setDormOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={dormForm.processing}>
                            Save dormitory
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!roomFor} onClose={() => setRoomFor(null)} title={roomFor?.room ? `Edit ${roomFor.room.name}` : `Add room to ${roomFor?.dorm.name ?? ''}`} size="sm">
                <form onSubmit={submitRoom} className="space-y-4">
                    <Input label="Room name / number" required value={roomForm.data.name} onChange={(e) => roomForm.setData('name', e.target.value)} error={roomForm.errors.name} />
                    <Input
                        label="Beds (capacity)"
                        type="number"
                        min={1}
                        required
                        value={roomForm.data.capacity}
                        onChange={(e) => roomForm.setData('capacity', e.target.value)}
                        error={roomForm.errors.capacity}
                    />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setRoomFor(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={roomForm.processing}>
                            Save room
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
