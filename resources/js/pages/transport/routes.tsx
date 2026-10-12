import { Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowDown, ArrowUp, Bus, Clock, MapPin, Pencil, Plus, Printer, Route as RouteIcon, Trash2, Users, Wallet, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { money, num } from '@/lib/utils';
import type { Option } from '@/types';
import OccupancyBar from '../boarding/_components/occupancy-bar';

type Stop = { id?: number | null; name: string; pickup_time: string; dropoff_time: string; sequence?: number; riders?: number };
type RouteRow = {
    id: number;
    name: string;
    description: string | null;
    fare: string;
    vehicle_id: number | null;
    vehicle: string | null;
    vehicle_status: string | null;
    driver: string | null;
    driver_phone: string | null;
    capacity: number;
    assigned: number;
    stops: Stop[];
};
type Props = {
    routes: RouteRow[];
    filters: { search: string };
    vehicles: Option[];
    stats: { routes: number; stops: number; riders: number; seats: number; revenue: string };
};

type FormData = { name: string; vehicle_id: string | number; fare: string | number; description: string; stops: Stop[] };
const blank: FormData = { name: '', vehicle_id: '', fare: '', description: '', stops: [{ id: null, name: '', pickup_time: '06:30', dropoff_time: '16:30' }] };

export default function Routes({ routes, filters: initial, vehicles, stats }: Props) {
    const can = useCan();
    const manage = can('transport.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<RouteRow | null>(null);
    const form = useForm<FormData>(blank);

    const openForm = (r: RouteRow | null) => {
        setEditing(r);
        form.clearErrors();
        form.setData(
            r
                ? {
                      name: r.name,
                      vehicle_id: r.vehicle_id ?? '',
                      fare: r.fare,
                      description: r.description ?? '',
                      stops: r.stops.map((s) => ({ id: s.id, name: s.name, pickup_time: s.pickup_time, dropoff_time: s.dropoff_time })),
                  }
                : blank,
        );
        setOpen(true);
    };

    const setStop = (i: number, patch: Partial<Stop>) => form.setData('stops', form.data.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    const moveStop = (i: number, dir: -1 | 1) => {
        const stops = [...form.data.stops];
        const j = i + dir;
        if (j < 0 || j >= stops.length) return;
        [stops[i], stops[j]] = [stops[j], stops[i]];
        form.setData('stops', stops);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/transport/routes/${editing.id}`, opts);
        else form.post('/transport/routes', opts);
    };

    const remove = async (r: RouteRow) => {
        const { confirmed } = await confirm({ title: `Delete route ${r.name}?`, text: 'Stops are deleted with it.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/transport/routes/${r.id}`, { preserveScroll: true });
    };

    const errors = form.errors as Record<string, string>;

    return (
        <>
            <PageHeader
                title="Routes & Stops"
                subtitle="Bus routes, ordered stops with pickup and drop-off times, fares and capacity."
                breadcrumbs={[{ title: 'Transport', href: '/transport/vehicles' }, { title: 'Routes' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Add route
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Routes" value={num(stats.routes)} icon={RouteIcon} tone="primary" hint={`${stats.stops} stops`} />
                <StatCard title="Riders" value={num(stats.riders)} icon={Users} tone="success" />
                <StatCard title="Seats on routes" value={num(stats.seats)} icon={Bus} tone="info" hint={`${num(Math.max(0, stats.seats - stats.riders))} free`} />
                <StatCard title="Fare value / term" value={money(stats.revenue, cur)} icon={Wallet} tone="secondary" />
            </div>

            <div className="mb-5 flex justify-end">
                <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search route or stop…" />
            </div>

            {routes.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No routes" description="Create a route, attach a vehicle and add its stops." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {routes.map((r) => (
                        <div key={r.id} className="panel">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-lg font-bold text-black dark:text-white-light">{r.name}</h5>
                                    <div className="text-xs text-white-dark">{r.description}</div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                        <span className="badge badge-soft-primary">
                                            <Bus className="me-1 inline h-3 w-3" />
                                            {r.vehicle ?? 'No vehicle'}
                                        </span>
                                        {r.driver && (
                                            <span className="badge badge-soft-dark">
                                                {r.driver} {r.driver_phone && `· ${r.driver_phone}`}
                                            </span>
                                        )}
                                        <span className="badge badge-soft-success">{money(r.fare, cur)} / term</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Link href={`/transport/routes/${r.id}/manifest`} className="btn btn-sm btn-outline-dark" title="Print manifest">
                                        <Printer className="h-3.5 w-3.5" /> Manifest
                                    </Link>
                                    {manage && (
                                        <>
                                            <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openForm(r)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => remove(r)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mb-4">
                                <div className="mb-1 text-xs font-bold text-white-dark uppercase">Capacity vs assigned</div>
                                <OccupancyBar value={r.assigned} max={r.capacity} />
                            </div>
                            <ol className="relative ms-3 border-s-2 border-dashed border-primary/40">
                                {r.stops.map((s, i) => (
                                    <li key={s.id ?? i} className="mb-3 ms-5 last:mb-0">
                                        <span className="absolute -start-[9px] mt-1 grid h-4 w-4 place-content-center rounded-full bg-primary text-[9px] font-bold text-white">{i + 1}</span>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-1 font-semibold">
                                                <MapPin className="h-3.5 w-3.5 text-primary" /> {s.name}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-white-dark">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> {s.pickup_time || '—'} / {s.dropoff_time || '—'}
                                                </span>
                                                <span className="badge badge-soft-info">{s.riders ?? 0} riders</span>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                                {r.stops.length === 0 && <li className="ms-5 text-sm text-white-dark">No stops defined.</li>}
                            </ol>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add route'} size="xl">
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid cols={3}>
                        <Input label="Route name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={errors.name} placeholder="e.g. Route A — Mbezi" />
                        <Select label="Vehicle" placeholder="— None —" options={vehicles} value={form.data.vehicle_id} onChange={(e) => form.setData('vehicle_id', e.target.value)} error={errors.vehicle_id} />
                        <Input label={`Fare per term (${cur})`} type="number" min={0} step="500" required value={form.data.fare} onChange={(e) => form.setData('fare', e.target.value)} error={errors.fare} />
                    </FormGrid>
                    <Input label="Description" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={errors.description} />

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h6 className="font-bold">Stops (in order)</h6>
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => form.setData('stops', [...form.data.stops, { id: null, name: '', pickup_time: '', dropoff_time: '' }])}>
                                <Plus className="h-3.5 w-3.5" /> Add stop
                            </button>
                        </div>
                        {errors.stops && <p className="form-error mb-2">{errors.stops}</p>}
                        <div className="space-y-2">
                            {form.data.stops.map((s, i) => (
                                <div key={i} className="grid grid-cols-12 items-start gap-2 rounded-md border border-white-light p-2 dark:border-[#1b2e4b]">
                                    <div className="col-span-12 flex items-center gap-2 sm:col-span-5">
                                        <span className="grid h-7 w-7 shrink-0 place-content-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
                                        <div className="w-full">
                                            <input className="form-input" placeholder="Stop name" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} />
                                            {errors[`stops.${i}.name`] && <p className="form-error">{errors[`stops.${i}.name`]}</p>}
                                        </div>
                                    </div>
                                    <div className="col-span-5 sm:col-span-3">
                                        <input type="time" className="form-input" title="Pickup (morning)" value={s.pickup_time} onChange={(e) => setStop(i, { pickup_time: e.target.value })} />
                                    </div>
                                    <div className="col-span-5 sm:col-span-3">
                                        <input type="time" className="form-input" title="Drop-off (afternoon)" value={s.dropoff_time} onChange={(e) => setStop(i, { dropoff_time: e.target.value })} />
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1">
                                        <div className="flex flex-col">
                                            <button type="button" className="text-white-dark hover:text-primary" onClick={() => moveStop(i, -1)} title="Move up">
                                                <ArrowUp className="h-3.5 w-3.5" />
                                            </button>
                                            <button type="button" className="text-white-dark hover:text-primary" onClick={() => moveStop(i, 1)} title="Move down">
                                                <ArrowDown className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <button type="button" className="text-danger" title="Remove stop" onClick={() => form.setData('stops', form.data.stops.filter((_, j) => j !== i))}>
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-white-dark">Times: morning pickup / afternoon drop-off. Removing a stop detaches any students assigned to it.</p>
                    </div>

                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save route
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
