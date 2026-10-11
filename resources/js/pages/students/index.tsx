import { Link } from '@inertiajs/react';
import { BedDouble, Download, GraduationCap, Plus, UserRound, Users } from 'lucide-react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cleanQuery, date, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = {
    id: number;
    admission_no: string;
    full_name: string;
    photo_url: string | null;
    gender: string;
    class: string;
    residence_type: string;
    status: string;
    date_of_birth: string | null;
    admission_date: string | null;
};

type Props = {
    students: Paginated<Row>;
    filters: { search: string; class: string; stream: string; status: string; gender: string; residence: string };
    classes: (Option & { streams: Option[] })[];
    statuses: Option[];
    stats: { active: number; male: number; female: number; boarding: number };
};

export default function StudentsIndex({ students, filters: initial, classes, statuses, stats }: Props) {
    const can = useCan();
    const { filters, setFilter, reset } = useFilters(initial);
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];

    const columns: Column<Row>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (s) => (
                <div className="flex items-center gap-3">
                    <Avatar name={s.full_name} src={s.photo_url} />
                    <div>
                        <Link href={`/students/${s.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {s.full_name}
                        </Link>
                        <div className="text-xs text-white-dark">{s.admission_no}</div>
                    </div>
                </div>
            ),
        },
        { key: 'class', header: 'Class', render: (s) => <span className="font-semibold">{s.class || '—'}</span> },
        { key: 'gender', header: 'Gender', render: (s) => titleCase(s.gender) },
        {
            key: 'residence',
            header: 'Residence',
            render: (s) => <span className={`badge ${s.residence_type === 'boarding' ? 'badge-soft-secondary' : 'badge-soft-info'}`}>{titleCase(s.residence_type)}</span>,
        },
        { key: 'admission_date', header: 'Admitted', render: (s) => date(s.admission_date) },
        { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) => (
                <RowActions
                    view={`/students/${s.id}`}
                    edit={can('students.manage') ? `/students/${s.id}/edit` : undefined}
                    destroy={can('students.manage') ? `/students/${s.id}` : undefined}
                    label="student"
                />
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Student Directory"
                subtitle="All enrolled learners, their classes and status."
                breadcrumbs={[{ title: 'Students' }]}
                actions={
                    <>
                        <a href={`/students/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        {can('students.manage') && (
                            <Link href="/students/create" className="btn btn-primary">
                                <Plus className="h-4 w-4" /> Add student
                            </Link>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Active students" value={num(stats.active)} icon={GraduationCap} tone="primary" />
                <StatCard title="Boys" value={num(stats.male)} icon={UserRound} tone="info" />
                <StatCard title="Girls" value={num(stats.female)} icon={Users} tone="warning" />
                <StatCard title="Boarders" value={num(stats.boarding)} icon={BedDouble} tone="secondary" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name or admission no…" />
                    <FilterSelect
                        value={filters.class}
                        onChange={(v) => {
                            setFilter('class', v);
                            setFilter('stream', '');
                        }}
                        options={classes}
                        placeholder="All classes"
                    />
                    {streams.length > 0 && <FilterSelect value={filters.stream} onChange={(v) => setFilter('stream', v)} options={streams} placeholder="All streams" />}
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Active & inactive" />
                    <FilterSelect value={filters.gender} onChange={(v) => setFilter('gender', v)} options={['male', 'female'].map((g) => ({ value: g, label: titleCase(g) }))} placeholder="Any gender" />
                    <FilterSelect
                        value={filters.residence}
                        onChange={(v) => setFilter('residence', v)}
                        options={['day', 'boarding'].map((g) => ({ value: g, label: titleCase(g) }))}
                        placeholder="Day & boarding"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={students} empty="No students match your filters" emptyDescription="Try clearing filters or add a new student." />
            </div>
        </>
    );
}
