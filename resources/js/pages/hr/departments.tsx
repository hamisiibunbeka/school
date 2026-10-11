import { Link, useForm } from '@inertiajs/react';
import { Building2, GraduationCap, Plus, UserX, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { num } from '@/lib/utils';

type Department = { id: number; name: string; code: string | null; headcount: number; teaching_count: number; subjects_count: number; head: string | null };

type Props = { departments: Department[]; filters: { search: string }; unassigned: number; total: number };

export default function Departments({ departments, filters: initial, unassigned, total }: Props) {
    const can = useCan();
    const { filters, setFilter } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Department | null>(null);
    const form = useForm({ name: '', code: '' });

    const openForm = (d: Department | null) => {
        setEditing(d);
        form.clearErrors();
        form.setData({ name: d?.name ?? '', code: d?.code ?? '' });
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/hr/departments/${editing.id}`, opts);
        else form.post('/hr/departments', opts);
    };

    const columns: Column<Department>[] = [
        {
            key: 'name',
            header: 'Department',
            render: (d) => (
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-content-center rounded-lg bg-primary-light text-primary dark:bg-primary-dark-light">
                        <Building2 className="h-5 w-5" />
                    </span>
                    <div>
                        <Link href={`/hr/employees?department=${d.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {d.name}
                        </Link>
                        <div className="text-xs text-white-dark">{d.code ?? 'No code'}</div>
                    </div>
                </div>
            ),
        },
        { key: 'head', header: 'Head', render: (d) => d.head ?? <span className="text-white-dark">—</span> },
        {
            key: 'headcount',
            header: 'Headcount',
            align: 'center',
            render: (d) => (
                <Link href={`/hr/employees?department=${d.id}`} className="badge badge-soft-primary text-sm hover:underline">
                    {d.headcount}
                </Link>
            ),
        },
        { key: 'teaching_count', header: 'Teaching', align: 'center', render: (d) => num(d.teaching_count) },
        { key: 'support', header: 'Support', align: 'center', render: (d) => num(d.headcount - d.teaching_count) },
        { key: 'subjects_count', header: 'Subjects', align: 'center', render: (d) => num(d.subjects_count) },
        {
            key: 'share',
            header: 'Share of staff',
            render: (d) => {
                const pct = total ? Math.round((d.headcount / total) * 100) : 0;
                return (
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-[#ebedf2] dark:bg-dark/40">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold">{pct}%</span>
                    </div>
                );
            },
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (d) => (can('hr.manage') ? <RowActions onEdit={() => openForm(d)} destroy={`/hr/departments/${d.id}`} label="department" /> : null),
        },
    ];

    const withStaff = departments.filter((d) => d.headcount > 0);

    return (
        <>
            <PageHeader
                title="Departments"
                subtitle="Academic and administrative units with their staff headcount."
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Departments' }]}
                actions={
                    can('hr.manage') && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Add department
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Departments" value={num(departments.length)} icon={Building2} tone="primary" />
                <StatCard title="Staff assigned" value={num(total - unassigned)} icon={Users} tone="success" hint={`of ${num(total)} active staff`} />
                <StatCard title="Teaching staff" value={num(departments.reduce((s, d) => s + d.teaching_count, 0))} icon={GraduationCap} tone="info" />
                <StatCard title="Unassigned" value={num(unassigned)} icon={UserX} tone="warning" hint="No department set" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <FilterBar>
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search departments…" />
                    </FilterBar>
                    <DataTable columns={columns} rows={departments} empty="No departments yet" emptyDescription="Create departments such as Sciences, Languages or Administration." />
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Staff distribution</h5>
                    {withStaff.length ? (
                        <Chart type="donut" height={320} series={withStaff.map((d) => d.headcount)} options={{ labels: withStaff.map((d) => d.name), legend: { position: 'bottom' } }} />
                    ) : (
                        <p className="text-sm text-white-dark">No staff assigned yet.</p>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit department' : 'Add department'}>
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} placeholder="e.g. Sciences" />
                        <Input label="Code" value={form.data.code} onChange={(e) => form.setData('code', e.target.value)} error={form.errors.code} placeholder="e.g. SCI" />
                    </FormGrid>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save department
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
