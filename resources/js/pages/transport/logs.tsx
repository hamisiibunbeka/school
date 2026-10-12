import { useForm, usePage } from '@inertiajs/react';
import { AlertOctagon, Droplets, Fuel, Plus, Wallet, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { compact, date, exportCsv, money, num, titleCase, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { DateRangePicker } from '@/components/ui/date-picker';

type Log = {
    id: number;
    vehicle_id: number;
    vehicle: string;
    type: string;
    date: string;
    amount: string;
    litres: string | null;
    odometer: number | null;
    description: string | null;
    recorded_by: string | null;
};
type PerVehicle = { id: number; vehicle: string; fuel: string; maintenance: string; other: string; total: string; litres: string; distance: number | null };
type Props = {
    logs: Paginated<Log>;
    filters: { search: string; vehicle: string; type: string; from: string; to: string };
    vehicles: Option[];
    types: Option[];
    perVehicle: PerVehicle[];
    chart: { months: string[]; series: { name: string; data: number[] }[] };
    stats: { total: string; fuel: string; litres: string; maintenance: string; incidents: number };
};

const typeTone: Record<string, string> = {
    fuel: 'badge-soft-info',
    maintenance: 'badge-soft-primary',
    repair: 'badge-soft-warning',
    inspection: 'badge-soft-secondary',
    trip: 'badge-soft-success',
    incident: 'badge-soft-danger',
};

type FormData = { vehicle_id: string | number; type: string; date: string; amount: string | number; litres: string | number; odometer: string | number; description: string };
const blank: FormData = { vehicle_id: '', type: 'fuel', date: today(), amount: '', litres: '', odometer: '', description: '' };

export default function Logs({ logs, filters: initial, vehicles, types, perVehicle, chart, stats }: Props) {
    const can = useCan();
    const manage = can('transport.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Log | null>(null);
    const form = useForm<FormData>(blank);

    const openForm = (l: Log | null) => {
        setEditing(l);
        form.clearErrors();
        form.setData(
            l
                ? { vehicle_id: l.vehicle_id, type: l.type, date: l.date, amount: l.amount, litres: l.litres ?? '', odometer: l.odometer ?? '', description: l.description ?? '' }
                : { ...blank, vehicle_id: filters.vehicle || '' },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/transport/logs/${editing.id}`, opts);
        else form.post('/transport/logs', opts);
    };

    const columns: Column<Log>[] = [
        { key: 'date', header: 'Date', render: (l) => date(l.date) },
        { key: 'vehicle', header: 'Vehicle', render: (l) => <span className="font-semibold">{l.vehicle}</span> },
        { key: 'type', header: 'Type', render: (l) => <span className={`badge ${typeTone[l.type] ?? 'badge-soft-dark'}`}>{titleCase(l.type)}</span> },
        { key: 'description', header: 'Details', render: (l) => <span className="line-clamp-2 max-w-[260px]">{l.description ?? '—'}</span> },
        { key: 'litres', header: 'Litres', align: 'right', render: (l) => (l.litres ? num(l.litres, 1) : '—') },
        { key: 'odometer', header: 'Odometer', align: 'right', render: (l) => (l.odometer ? `${num(l.odometer)} km` : '—') },
        { key: 'amount', header: 'Cost', align: 'right', render: (l) => <span className="font-semibold">{money(l.amount, cur)}</span> },
        { key: 'actions', header: '', align: 'right', render: (l) => (manage ? <RowActions onEdit={() => openForm(l)} destroy={`/transport/logs/${l.id}`} label="log entry" /> : null) },
    ];

    return (
        <>
            <PageHeader
                title="Vehicle Logs & Costs"
                subtitle="Fuel, maintenance, repairs, inspections, trips and incidents."
                breadcrumbs={[{ title: 'Transport', href: '/transport/vehicles' }, { title: 'Logs' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('vehicle-costs', [
                                    ['Vehicle', 'Fuel', 'Maintenance/Repairs', 'Other', 'Total', 'Litres', 'Distance (km)'],
                                    ...perVehicle.map((v) => [v.vehicle, v.fuel, v.maintenance, v.other, v.total, v.litres, v.distance]),
                                ])
                            }
                        >
                            Export summary
                        </button>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Record log
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Total cost" value={money(stats.total, cur)} icon={Wallet} tone="primary" hint="Within current filters" />
                <StatCard title="Fuel" value={money(stats.fuel, cur)} icon={Fuel} tone="info" hint={`${num(stats.litres, 0)} litres`} />
                <StatCard title="Maintenance & repairs" value={money(stats.maintenance, cur)} icon={Wrench} tone="warning" />
                <StatCard title="Incidents" value={num(stats.incidents)} icon={AlertOctagon} tone={stats.incidents ? 'danger' : 'success'} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
                <div className="panel xl:col-span-3">
                    <h5 className="mb-4 text-lg font-semibold dark:text-white-light">Monthly running cost by vehicle</h5>
                    {chart.series.length ? (
                        <Chart
                            type="bar"
                            height={300}
                            series={chart.series}
                            options={{
                                chart: { stacked: true },
                                plotOptions: { bar: { borderRadius: 4, columnWidth: '45%' } },
                                xaxis: { categories: chart.months },
                                yaxis: { labels: { formatter: (v: number) => compact(v) } },
                                tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                            }}
                        />
                    ) : (
                        <EmptyState title="No costs in the last 6 months" />
                    )}
                </div>
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 text-lg font-semibold dark:text-white-light">Cost per vehicle</h5>
                    <DataTable
                        rows={perVehicle}
                        compact
                        empty="No logs"
                        columns={[
                            {
                                key: 'vehicle',
                                header: 'Vehicle',
                                render: (v) => (
                                    <button type="button" className="font-semibold hover:text-primary" onClick={() => setFilter('vehicle', String(v.id))}>
                                        {v.vehicle}
                                    </button>
                                ),
                            },
                            { key: 'fuel', header: 'Fuel', align: 'right', render: (v) => compact(v.fuel) },
                            { key: 'maintenance', header: 'Maint.', align: 'right', render: (v) => compact(v.maintenance) },
                            { key: 'total', header: 'Total', align: 'right', render: (v) => <span className="font-bold">{money(v.total, cur)}</span> },
                            {
                                key: 'per_km',
                                header: 'Per km',
                                align: 'right',
                                render: (v) => (v.distance ? money(Number(v.total) / v.distance, cur) : '—'),
                            },
                        ]}
                    />
                </div>
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search details…" />
                    <FilterSelect value={filters.vehicle} onChange={(v) => setFilter('vehicle', v)} options={vehicles} placeholder="All vehicles" />
                    <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={types} placeholder="All types" />
                    <DateRangePicker from={filters.from} to={filters.to} onChange={(f, t) => { setFilter('from', f); setFilter('to', t); }} />
                </FilterBar>
                <DataTable columns={columns} paginated={logs} empty="No vehicle logs" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit log entry' : 'Record vehicle log'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid cols={3}>
                        <Select label="Vehicle" required placeholder="Select…" options={vehicles} value={form.data.vehicle_id} onChange={(e) => form.setData('vehicle_id', e.target.value)} error={form.errors.vehicle_id} />
                        <Select label="Type" required options={types} value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} error={form.errors.type} />
                        <Input label="Date" type="date" required max={today()} value={form.data.date} onChange={(e) => form.setData('date', e.target.value)} error={form.errors.date} />
                        <Input label={`Cost (${cur})`} type="number" min={0} required value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value)} error={form.errors.amount} />
                        <Input label="Litres" type="number" step="0.01" min={0} required={form.data.type === 'fuel'} value={form.data.litres} onChange={(e) => form.setData('litres', e.target.value)} error={form.errors.litres} />
                        <Input label="Odometer (km)" type="number" min={0} value={form.data.odometer} onChange={(e) => form.setData('odometer', e.target.value)} error={form.errors.odometer} />
                    </FormGrid>
                    <Input label="Details" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} placeholder="e.g. Full tank at Puma Mwenge; brake pads replaced" />
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
        </>
    );
}
