import { Link, useForm } from '@inertiajs/react';
import { Ban, Building2, CheckCircle2, Clock, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, FormSection, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { date, exportCsv, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    plan: string | null;
    status: string;
    schools_count: number;
    users_count: number;
    students_count: number;
    trial_ends_at: string | null;
    subscription_ends_at: string | null;
    created_at: string | null;
};
type Props = {
    tenants: Paginated<Row>;
    filters: { search: string; status: string; plan: string };
    plans: Option[];
    statuses: Option[];
    stats: { total: number; active: number; trial: number; suspended: number };
};

const regions = ['Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Kigoma', 'Kilimanjaro', 'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora', 'Tanga', 'Zanzibar'];

export default function TenantsIndex({ tenants, filters: initial, plans, statuses, stats }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const form = useForm({
        school_name: '',
        admin_name: '',
        email: '',
        phone: '',
        level: 'secondary',
        residence_type: 'mixed',
        region: '',
        plan_id: String(plans[0]?.value ?? ''),
        trial_days: '30',
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/saas/tenants', { onSuccess: () => setOpen(false) });
    };

    const columns: Column<Row>[] = [
        {
            key: 'name',
            header: 'Tenant',
            render: (t) => (
                <div>
                    <Link href={`/saas/tenants/${t.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                        {t.name}
                    </Link>
                    <div className="text-xs text-white-dark">{[t.email, t.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
            ),
        },
        { key: 'plan', header: 'Plan', render: (t) => <span className="badge badge-soft-primary">{t.plan ?? '—'}</span> },
        { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
        { key: 'schools', header: 'Schools', align: 'center', render: (t) => num(t.schools_count) },
        { key: 'users', header: 'Users', align: 'center', render: (t) => num(t.users_count) },
        { key: 'students', header: 'Students', align: 'center', render: (t) => num(t.students_count) },
        { key: 'ends', header: 'Trial / renewal', render: (t) => date(t.status === 'trial' ? t.trial_ends_at : t.subscription_ends_at) },
        { key: 'actions', header: '', align: 'right', render: (t) => <RowActions view={`/saas/tenants/${t.id}`} /> },
    ];

    return (
        <>
            <PageHeader
                title="Tenants"
                subtitle="Schools and groups subscribed to the platform."
                breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Tenants' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('tenants', [
                                    ['Tenant', 'Email', 'Phone', 'Plan', 'Status', 'Schools', 'Users', 'Students', 'Trial ends', 'Subscription ends'],
                                    ...tenants.data.map((t) => [t.name, t.email, t.phone, t.plan, t.status, t.schools_count, t.users_count, t.students_count, t.trial_ends_at, t.subscription_ends_at]),
                                ])
                            }
                        >
                            Export CSV
                        </button>
                        <button className="btn btn-primary" onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" /> New tenant
                        </button>
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="All tenants" value={num(stats.total)} icon={Building2} tone="primary" />
                <StatCard title="Active" value={num(stats.active)} icon={CheckCircle2} tone="success" />
                <StatCard title="On trial" value={num(stats.trial)} icon={Clock} tone="info" />
                <StatCard title="Suspended / cancelled" value={num(stats.suspended)} icon={Ban} tone="danger" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name, email or phone…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                    <FilterSelect value={filters.plan} onChange={(v) => setFilter('plan', v)} options={plans} placeholder="All plans" />
                </FilterBar>
                <DataTable columns={columns} paginated={tenants} empty="No tenants found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Provision a new tenant" size="lg">
                <form onSubmit={submit} className="space-y-5">
                    <FormSection title="School" description="Creates the tenant, default roles, school record, chart of accounts, academic calendar and grading.">
                        <FormGrid>
                            <Input label="School name" required value={form.data.school_name} onChange={(e) => form.setData('school_name', e.target.value)} error={form.errors.school_name} wrapperClassName="sm:col-span-2" />
                            <Select
                                label="Level"
                                value={form.data.level}
                                onChange={(e) => form.setData('level', e.target.value)}
                                options={['nursery', 'primary', 'secondary', 'combined'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
                            />
                            <Select
                                label="Residence"
                                value={form.data.residence_type}
                                onChange={(e) => form.setData('residence_type', e.target.value)}
                                options={['day', 'boarding', 'mixed'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
                            />
                            <Select label="Region" placeholder="Select region" value={form.data.region} onChange={(e) => form.setData('region', e.target.value)} options={regions} />
                            <Input label="Phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        </FormGrid>
                    </FormSection>
                    <FormSection title="Administrator" description="A temporary password is generated and shown once.">
                        <FormGrid>
                            <Input label="Administrator name" required value={form.data.admin_name} onChange={(e) => form.setData('admin_name', e.target.value)} error={form.errors.admin_name} />
                            <Input label="Administrator email" type="email" required value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                        </FormGrid>
                    </FormSection>
                    <FormSection title="Plan">
                        <FormGrid>
                            <Select label="Plan" value={form.data.plan_id} onChange={(e) => form.setData('plan_id', e.target.value)} options={plans} error={form.errors.plan_id} />
                            <Input label="Trial days" type="number" min={0} max={365} value={form.data.trial_days} onChange={(e) => form.setData('trial_days', e.target.value)} error={form.errors.trial_days} />
                        </FormGrid>
                    </FormSection>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Provision tenant
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
