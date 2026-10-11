import { Link, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, Bus, Fuel, Plus, Route as RouteIcon, ShieldAlert, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cn, date, exportCsv, money, num } from '@/lib/utils';
import type { Option } from '@/types';
import OccupancyBar from '../boarding/_components/occupancy-bar';

type Flag = 'ok' | 'due' | 'expired' | null;
type Vehicle = {
    id: number;
    registration_no: string;
    make: string | null;
    model: string | null;
    capacity: number;
    driver_id: number | null;
    driver: string | null;
    driver_phone: string | null;
    insurance_expiry: string | null;
    inspection_expiry: string | null;
    next_service_date: string | null;
    status: string;
    compliance: { insurance: Flag; inspection: Flag; service: Flag };
    has_issue: boolean;
    routes: string[];
    assigned: number;
    cost_ytd: string;
};
type Props = {
    vehicles: Vehicle[];
    filters: { search: string; status: string; compliance: string };
    drivers: Option[];
    statuses: Option[];
    stats: { total: number; active: number; seats: number; riders: number; issues: number; expired: number; cost_month: string };
};

const blank = { registration_no: '', make: '', model: '', capacity: '' as string | number, driver_id: '' as string | number, insurance_expiry: '', inspection_expiry: '', next_service_date: '', status: 'active' };

function ComplianceDate({ value, flag }: { value: string | null; flag: Flag }) {
    if (!value) return <span className="text-white-dark">—</span>;
    return (
        <span
            className={cn(
                'badge whitespace-nowrap',
                flag === 'expired' ? 'badge-soft-danger' : flag === 'due' ? 'badge-soft-warning' : 'badge-soft-success',
            )}
            title={flag === 'expired' ? 'Expired' : flag === 'due' ? 'Due within 30 days' : 'Valid'}
        >
            {flag === 'expired' && '⚠ '}
            {date(value)}
        </span>
    );
}

export default function Vehicles({ vehicles, filters: initial, drivers, statuses, stats }: Props) {
    const can = useCan();
    const manage = can('transport.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Vehicle | null>(null);
    const form = useForm(blank);

    const openForm = (v: Vehicle | null) => {
        setEditing(v);
        form.clearErrors();
        form.setData(
            v
                ? {
                      registration_no: v.registration_no,
                      make: v.make ?? '',
                      model: v.model ?? '',
                      capacity: v.capacity,
                      driver_id: v.driver_id ?? '',
                      insurance_expiry: v.insurance_expiry ?? '',
                      inspection_expiry: v.inspection_expiry ?? '',
                      next_service_date: v.next_service_date ?? '',
                      status: v.status,
                  }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/transport/vehicles/${editing.id}`, opts);
        else form.post('/transport/vehicles', opts);
    };

    const columns: Column<Vehicle>[] = [
        {
            key: 'vehicle',
            header: 'Vehicle',
            render: (v) => (
                <div className="flex items-center gap-3">
                    <span className={cn('grid h-10 w-10 place-content-center rounded-lg', v.has_issue ? 'bg-danger-light text-danger dark:bg-danger-dark-light' : 'bg-primary-light text-primary dark:bg-primary-dark-light')}>
                        <Bus className="h-5 w-5" />
                    </span>
                    <div>
                        <div className="font-bold text-black dark:text-white-light">{v.registration_no}</div>
                        <div className="text-xs text-white-dark">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</div>
                    </div>
                </div>
            ),
        },
        {
            key: 'driver',
            header: 'Driver',
            render: (v) => (
                <div>
                    <div className="font-semibold">{v.driver ?? '—'}</div>
                    <div className="text-xs text-white-dark">{v.driver_phone}</div>
                </div>
            ),
        },
        {
            key: 'usage',
            header: 'Seats used',
            render: (v) => (
                <div className="min-w-[120px]">
                    <OccupancyBar value={v.assigned} max={v.capacity} />
                    <div className="mt-1 truncate text-xs text-white-dark">{v.routes.join(', ') || 'No route'}</div>
                </div>
            ),
        },
        { key: 'insurance', header: 'Insurance', render: (v) => <ComplianceDate value={v.insurance_expiry} flag={v.compliance.insurance} /> },
        { key: 'inspection', header: 'Inspection', render: (v) => <ComplianceDate value={v.inspection_expiry} flag={v.compliance.inspection} /> },
        { key: 'service', header: 'Next service', render: (v) => <ComplianceDate value={v.next_service_date} flag={v.compliance.service} /> },
        { key: 'cost', header: 'Cost YTD', align: 'right', render: (v) => money(v.cost_ytd, cur) },
        { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (v) => (manage ? <RowActions onEdit={() => openForm(v)} destroy={`/transport/vehicles/${v.id}`} label="vehicle" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Transport Fleet"
                subtitle="Buses and vans, drivers, compliance dates and running costs."
                breadcrumbs={[{ title: 'Transport' }, { title: 'Vehicles' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('vehicles', [
                                    ['Registration', 'Make', 'Model', 'Capacity', 'Driver', 'Insurance expiry', 'Inspection expiry', 'Next service', 'Status', 'Assigned students'],
                                    ...vehicles.map((v) => [v.registration_no, v.make, v.model, v.capacity, v.driver, v.insurance_expiry, v.inspection_expiry, v.next_service_date, v.status, v.assigned]),
                                ])
                            }
                        >
                            Export CSV
                        </button>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Add vehicle
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Fleet" value={num(stats.total)} icon={Bus} tone="primary" hint={`${stats.active} active`} />
                <StatCard title="Students riding" value={`${num(stats.riders)} / ${num(stats.seats)}`} icon={Users} tone="success" hint="Assigned / seats" />
                <StatCard title="Compliance alerts" value={num(stats.issues)} icon={ShieldAlert} tone={stats.expired ? 'danger' : stats.issues ? 'warning' : 'success'} hint={stats.expired ? `${stats.expired} with expired documents` : 'Due in 30 days'} />
                <StatCard title="Running cost (month)" value={money(stats.cost_month, cur)} icon={Fuel} tone="info" />
            </div>

            {stats.issues > 0 && filters.compliance !== 'due' && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-light p-4 text-warning dark:bg-warning-dark-light">
                    <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-5 w-5" /> {stats.issues} vehicle{stats.issues > 1 ? 's need' : ' needs'} attention: insurance, inspection or service is due or expired.
                    </div>
                    <button className="btn btn-sm btn-warning" onClick={() => setFilter('compliance', 'due')}>
                        Show them
                    </button>
                </div>
            )}

            <div className="panel">
                <FilterBar
                    actions={
                        <>
                            {Object.values(filters).some(Boolean) && (
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                    Clear filters
                                </button>
                            )}
                            <Link href="/transport/routes" className="btn btn-sm btn-outline-primary">
                                <RouteIcon className="h-4 w-4" /> Routes
                            </Link>
                        </>
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search registration, make…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="All statuses" />
                    <FilterSelect value={filters.compliance} onChange={(v) => setFilter('compliance', v)} options={[{ value: 'due', label: 'Due / expired only' }]} placeholder="All compliance" />
                </FilterBar>
                <DataTable columns={columns} rows={vehicles} empty="No vehicles found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.registration_no}` : 'Add vehicle'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid cols={3}>
                        <Input label="Registration no." required value={form.data.registration_no} onChange={(e) => form.setData('registration_no', e.target.value.toUpperCase())} error={form.errors.registration_no} placeholder="T 123 ABC" />
                        <Input label="Make" value={form.data.make} onChange={(e) => form.setData('make', e.target.value)} error={form.errors.make} placeholder="Toyota" />
                        <Input label="Model" value={form.data.model} onChange={(e) => form.setData('model', e.target.value)} error={form.errors.model} placeholder="Coaster" />
                        <Input label="Seats (capacity)" type="number" min={1} required value={form.data.capacity} onChange={(e) => form.setData('capacity', e.target.value)} error={form.errors.capacity} />
                        <Select label="Driver" placeholder="— None —" options={drivers} value={form.data.driver_id} onChange={(e) => form.setData('driver_id', e.target.value)} error={form.errors.driver_id} />
                        <Select label="Status" required options={statuses} value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} error={form.errors.status} />
                        <Input label="Insurance expiry" type="date" value={form.data.insurance_expiry} onChange={(e) => form.setData('insurance_expiry', e.target.value)} error={form.errors.insurance_expiry} />
                        <Input label="Inspection (LATRA) expiry" type="date" value={form.data.inspection_expiry} onChange={(e) => form.setData('inspection_expiry', e.target.value)} error={form.errors.inspection_expiry} />
                        <Input label="Next service date" type="date" value={form.data.next_service_date} onChange={(e) => form.setData('next_service_date', e.target.value)} error={form.errors.next_service_date} />
                    </FormGrid>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save vehicle
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
