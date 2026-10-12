import { Link, usePage } from '@inertiajs/react';
import { BriefcaseBusiness, CalendarClock, Download, GraduationCap, Plane, Plus, Users } from 'lucide-react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cleanQuery, date, money, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import ImportButton from '@/components/ui/import-button';

type Row = {
    id: number;
    employee_no: string;
    full_name: string;
    designation: string | null;
    department: string | null;
    category: string;
    employment_type: string;
    phone: string | null;
    email: string | null;
    hire_date: string | null;
    contract_end_date: string | null;
    basic_salary: string | null;
    status: string;
    has_login: boolean;
};

type Filters = { search: string; department: string; category: string; status: string; type: string; contract: string };

type Props = {
    employees: Paginated<Row>;
    filters: Filters;
    departments: Option[];
    statuses: Option[];
    categories: Option[];
    types: Option[];
    stats: { headcount: number; teaching: number; expiring: number; on_leave: number };
    canSeeSalary: boolean;
};

function daysUntil(d: string | null): number | null {
    if (!d) return null;
    return Math.ceil((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86400000);
}

export default function EmployeesIndex({ employees, filters: initial, departments, statuses, categories, types, stats, canSeeSalary }: Props) {
    const can = useCan();
    const { school } = usePage().props;
    const { filters, setFilter, reset } = useFilters(initial);

    const columns: Column<Row>[] = [
        {
            key: 'employee',
            header: 'Employee',
            render: (e) => (
                <div className="flex items-center gap-3">
                    <Avatar name={e.full_name} />
                    <div className="min-w-0">
                        <Link href={`/hr/employees/${e.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {e.full_name}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {e.employee_no} {e.has_login && <span className="badge badge-soft-info ms-1 px-1.5 py-0 text-[10px]">Login</span>}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'designation',
            header: 'Position',
            render: (e) => (
                <div>
                    <div className="font-semibold">{e.designation ?? '—'}</div>
                    <div className="text-xs text-white-dark">{e.department ?? 'No department'}</div>
                </div>
            ),
        },
        {
            key: 'category',
            header: 'Category',
            render: (e) => <span className={`badge ${e.category === 'teaching' ? 'badge-soft-primary' : 'badge-soft-secondary'}`}>{titleCase(e.category)}</span>,
        },
        {
            key: 'employment_type',
            header: 'Terms',
            render: (e) => {
                const d = daysUntil(e.contract_end_date);
                return (
                    <div>
                        <div className="font-semibold">{titleCase(e.employment_type)}</div>
                        {e.contract_end_date && (
                            <div className={`text-xs ${d !== null && d <= 60 && d >= 0 ? 'font-bold text-danger' : 'text-white-dark'}`}>
                                Ends {date(e.contract_end_date)}
                                {d !== null && d >= 0 && d <= 60 ? ` · ${d}d` : ''}
                            </div>
                        )}
                    </div>
                );
            },
        },
        { key: 'phone', header: 'Contact', render: (e) => <div className="text-sm">{e.phone ?? '—'}</div> },
        { key: 'hire_date', header: 'Hired', render: (e) => date(e.hire_date) },
        ...(canSeeSalary ? [{ key: 'basic_salary', header: 'Basic salary', align: 'right' as const, render: (e: Row) => <span className="font-semibold">{money(e.basic_salary, '')}</span> }] : []),
        { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (e) => <RowActions view={`/hr/employees/${e.id}`} edit={can('hr.manage') ? `/hr/employees/${e.id}/edit` : undefined} label="employee" />,
        },
    ];

    return (
        <>
            <PageHeader
                title="Staff Directory"
                subtitle="Teaching and support staff, their positions, contracts and status."
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Employees' }]}
                actions={
                    <>
                        {can('hr.manage') && <ImportButton type="employees" label="Import employees" />}
                        {<>
                        <a href={`/hr/employees/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        {can('hr.manage') && (
                            <Link href="/hr/employees/create" className="btn btn-primary">
                                <Plus className="h-4 w-4" /> Add employee
                            </Link>
                        )}
                    </>}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Headcount" value={num(stats.headcount)} icon={Users} tone="primary" hint="Active & on leave" />
                <StatCard title="Teaching staff" value={num(stats.teaching)} icon={GraduationCap} tone="info" hint={`${num(stats.headcount - stats.teaching)} support staff`} />
                <button type="button" className="text-start" onClick={() => setFilter('contract', filters.contract === 'expiring' ? '' : 'expiring')}>
                    <StatCard title="Contracts expiring" value={num(stats.expiring)} icon={CalendarClock} tone="danger" hint="Within the next 60 days" />
                </button>
                <StatCard title="On leave" value={num(stats.on_leave)} icon={Plane} tone="warning" hint="Today" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name, number, phone…" />
                    <FilterSelect value={filters.department} onChange={(v) => setFilter('department', v)} options={departments} placeholder="All departments" />
                    <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} options={categories} placeholder="All categories" />
                    <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={types} placeholder="All employment types" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                    {filters.contract === 'expiring' && (
                        <span className="badge badge-soft-danger flex items-center gap-1">
                            <BriefcaseBusiness className="h-3.5 w-3.5" /> Contracts expiring ≤ 60 days
                        </span>
                    )}
                </FilterBar>
                <DataTable columns={columns} paginated={employees} empty="No employees match your filters" emptyDescription="Try clearing filters or add a new employee." />
                {canSeeSalary && <p className="mt-3 text-xs text-white-dark">Salary amounts in {school?.currency ?? 'TZS'}. Visible to HR managers and payroll staff only.</p>}
            </div>
        </>
    );
}
