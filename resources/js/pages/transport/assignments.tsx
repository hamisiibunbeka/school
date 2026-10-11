import { Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, Bus, LogOut, Plus, Printer, UserCheck, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DeleteButton, IconButton } from '@/components/ui/actions';
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
import OccupancyBar from '../boarding/_components/occupancy-bar';
import SearchSelect from '../boarding/_components/search-select';

type Row = {
    id: number;
    student_id: number;
    student: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    route_id: number;
    route: string;
    stop: string | null;
    pickup_time: string | null;
    start_date: string;
    end_date: string | null;
    status: string;
};
type RouteOption = Option & { name: string; free: number; capacity: number; assigned: number; stops: Option[] };
type Props = {
    assignments: Paginated<Row>;
    filters: { search: string; route: string; status: string };
    routes: RouteOption[];
    students: Option[];
    stats: { active: number; day_students: number; seats: number; full_routes: number };
};

export default function Assignments({ assignments, filters: initial, routes, students, stats }: Props) {
    const can = useCan();
    const manage = can('transport.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const form = useForm({ student_id: '', transport_route_id: '', route_stop_id: '', start_date: today(), end_date: '' });
    const route = routes.find((r) => String(r.value) === form.data.transport_route_id);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/transport/assignments', { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const end = async (r: Row) => {
        const { confirmed, value } = await confirm({ title: `End transport for ${r.student}?`, text: 'The seat is released today. Give a reason.', confirmText: 'End assignment', danger: true, input: 'textarea' });
        if (confirmed) router.post(`/transport/assignments/${r.id}/end`, { end_date: today(), reason: value }, { preserveScroll: true });
    };

    const columns: Column<Row>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (r) => (
                <div className="flex items-center gap-3">
                    <Avatar name={r.student} src={r.photo_url} />
                    <div>
                        <Link href={`/students/${r.student_id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {r.student}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {r.admission_no} · {r.class}
                        </div>
                    </div>
                </div>
            ),
        },
        { key: 'route', header: 'Route', render: (r) => <span className="font-semibold">{r.route}</span> },
        { key: 'stop', header: 'Stop', render: (r) => (r.stop ? `${r.stop}${r.pickup_time ? ` · ${r.pickup_time}` : ''}` : <span className="text-warning">No stop</span>) },
        { key: 'period', header: 'Effective', render: (r) => `${date(r.start_date)} → ${r.end_date ? date(r.end_date) : 'ongoing'}` },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) =>
                manage ? (
                    <div className="flex justify-end gap-1">
                        {r.status === 'active' && <IconButton icon={LogOut} title="End assignment" className="text-warning" onClick={() => end(r)} />}
                        <DeleteButton href={`/transport/assignments/${r.id}`} label="assignment" />
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Transport Assignments"
                subtitle="Day students on each route and stop, with effective dates."
                breadcrumbs={[{ title: 'Transport', href: '/transport/vehicles' }, { title: 'Assignments' }]}
                actions={
                    manage && (
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                form.reset();
                                form.clearErrors();
                                if (filters.route) form.setData('transport_route_id', String(filters.route));
                                setOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" /> Assign student
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Students on transport" value={num(stats.active)} icon={UserCheck} tone="primary" />
                <StatCard title="Day students" value={num(stats.day_students)} icon={Users} tone="info" hint={`${stats.day_students ? Math.round((stats.active / stats.day_students) * 100) : 0}% use transport`} />
                <StatCard title="Seats available" value={num(Math.max(0, stats.seats - stats.active))} icon={Bus} tone="success" hint={`of ${num(stats.seats)}`} />
                <StatCard title="Full routes" value={num(stats.full_routes)} icon={AlertTriangle} tone={stats.full_routes ? 'warning' : 'success'} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {routes.map((r) => (
                    <div key={r.value} className="panel">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <button type="button" className="truncate text-start font-bold hover:text-primary" onClick={() => setFilter('route', String(r.value))}>
                                {r.name}
                            </button>
                            <Link href={`/transport/routes/${r.value}/manifest`} className="text-white-dark hover:text-primary" title="Print manifest">
                                <Printer className="h-4 w-4" />
                            </Link>
                        </div>
                        <OccupancyBar value={r.assigned} max={r.capacity} />
                    </div>
                ))}
            </div>

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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student…" />
                    <FilterSelect value={filters.route} onChange={(v) => setFilter('route', v)} options={routes.map((r) => ({ value: r.value, label: r.name }))} placeholder="All routes" />
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
                <DataTable columns={columns} paginated={assignments} empty="No transport assignments" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Assign student to route" size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <SearchSelect
                        label="Day student"
                        required
                        options={students}
                        value={form.data.student_id}
                        onChange={(v) => form.setData('student_id', v)}
                        error={form.errors.student_id}
                        help="Only active day students without a current route are listed."
                    />
                    <FormGrid>
                        <Select
                            label="Route"
                            required
                            placeholder="Select route…"
                            options={routes.map((r) => ({ value: r.value, label: r.free === 0 ? `${r.label} — FULL` : r.label }))}
                            value={form.data.transport_route_id}
                            onChange={(e) => form.setData((d) => ({ ...d, transport_route_id: e.target.value, route_stop_id: '' }))}
                            error={form.errors.transport_route_id}
                        />
                        <Select
                            label="Stop"
                            required
                            placeholder={route ? 'Select stop…' : 'Pick a route first'}
                            options={route?.stops ?? []}
                            value={form.data.route_stop_id}
                            onChange={(e) => form.setData('route_stop_id', e.target.value)}
                            error={form.errors.route_stop_id}
                        />
                        <Input label="Start date" type="date" required value={form.data.start_date} onChange={(e) => form.setData('start_date', e.target.value)} error={form.errors.start_date} />
                        <Input label="End date (optional)" type="date" value={form.data.end_date} onChange={(e) => form.setData('end_date', e.target.value)} error={form.errors.end_date} />
                    </FormGrid>
                    {route && (
                        <div className="rounded-md bg-primary-light p-3 text-sm text-primary dark:bg-primary-dark-light">
                            {route.name}: {route.assigned} of {route.capacity} seats taken — {route.free} free.
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Assign
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
