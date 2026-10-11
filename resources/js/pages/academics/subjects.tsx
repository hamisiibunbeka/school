import { useForm } from '@inertiajs/react';
import { AlertTriangle, BookMarked, BookOpen, Download, Plus, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { exportCsv, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = { id: number; name: string; code: string | null; type: string; department_id: number | null; department: string | null; classes: number; teachers: number; periods: number };
type Props = {
    subjects: Paginated<Row>;
    filters: { search: string; type: string; department: string };
    departments: Option[];
    stats: { total: number; core: number; elective: number; unallocated: number };
};

const types = [
    { value: 'core', label: 'Core (compulsory)' },
    { value: 'elective', label: 'Elective (optional)' },
];

export default function Subjects({ subjects, filters: initial, departments, stats }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Row | null>(null);
    const form = useForm({ name: '', code: '', type: 'core', department_id: '' });

    const openForm = (row: Row | null) => {
        setEditing(row);
        form.clearErrors();
        form.setData(row ? { name: row.name, code: row.code ?? '', type: row.type, department_id: row.department_id ? String(row.department_id) : '' } : { name: '', code: '', type: 'core', department_id: '' });
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/academics/subjects/${editing.id}`, opts);
        else form.post('/academics/subjects', opts);
    };

    const columns: Column<Row>[] = [
        {
            key: 'name',
            header: 'Subject',
            render: (s) => (
                <div className="flex items-center gap-3">
                    <span className="grid h-10 w-12 shrink-0 place-content-center rounded-lg bg-primary-light text-xs font-extrabold text-primary dark:bg-primary-dark-light">{s.code ?? s.name.slice(0, 3).toUpperCase()}</span>
                    <div className="font-bold text-black dark:text-white-light">{s.name}</div>
                </div>
            ),
        },
        { key: 'type', header: 'Type', render: (s) => <span className={`badge ${s.type === 'core' ? 'badge-soft-primary' : 'badge-soft-warning'}`}>{titleCase(s.type)}</span> },
        { key: 'department', header: 'Department', render: (s) => s.department ?? '—' },
        { key: 'classes', header: 'Classes', align: 'center', render: (s) => (s.classes ? num(s.classes) : <span className="badge badge-soft-danger">Not offered</span>) },
        { key: 'teachers', header: 'Teachers', align: 'center', render: (s) => num(s.teachers) },
        { key: 'periods', header: 'Periods / week', align: 'right', render: (s) => num(s.periods) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) => (manage ? <RowActions onEdit={() => openForm(s)} destroy={`/academics/subjects/${s.id}`} label="subject" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Subjects"
                subtitle="Curriculum subjects, their type and owning department."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Subjects' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() => exportCsv('subjects', [['Subject', 'Code', 'Type', 'Department', 'Classes', 'Teachers', 'Periods/week'], ...subjects.data.map((s) => [s.name, s.code, s.type, s.department, s.classes, s.teachers, s.periods])])}
                        >
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Add subject
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Subjects" value={num(stats.total)} icon={BookOpen} tone="primary" />
                <StatCard title="Core" value={num(stats.core)} icon={BookMarked} tone="success" />
                <StatCard title="Electives" value={num(stats.elective)} icon={Sparkles} tone="warning" />
                <StatCard title="Not allocated" value={num(stats.unallocated)} icon={AlertTriangle} tone={stats.unallocated ? 'danger' : 'info'} hint="Not offered in any class" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name or code…" />
                    <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={types} placeholder="All types" />
                    <FilterSelect value={filters.department} onChange={(v) => setFilter('department', v)} options={departments} placeholder="All departments" />
                </FilterBar>
                <DataTable columns={columns} paginated={subjects} empty="No subjects found" emptyDescription="Add the subjects taught at your school." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add subject'}>
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid>
                        <Input label="Subject name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} wrapperClassName="sm:col-span-2" />
                        <Input label="Code" placeholder="e.g. MATH" value={form.data.code} onChange={(e) => form.setData('code', e.target.value.toUpperCase())} error={form.errors.code} />
                        <Select label="Type" required options={types} value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} error={form.errors.type} />
                        <Select
                            label="Department"
                            placeholder="— None —"
                            options={departments}
                            value={form.data.department_id}
                            onChange={(e) => form.setData('department_id', e.target.value)}
                            error={form.errors.department_id}
                            wrapperClassName="sm:col-span-2"
                        />
                    </FormGrid>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save subject
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
