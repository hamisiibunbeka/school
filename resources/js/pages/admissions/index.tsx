import { Link } from '@inertiajs/react';
import { CheckCircle2, ClipboardList, Clock3, Download, FileSearch, Hourglass, MessagesSquare, Plus, UserCheck, XCircle, type LucideIcon } from 'lucide-react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { cleanQuery, cn, date, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = {
    id: number;
    application_no: string;
    full_name: string;
    gender: string;
    date_of_birth: string | null;
    class: string | null;
    year: string | null;
    residence_type: string;
    guardian_name: string;
    guardian_phone: string;
    interview_date: string | null;
    assessment_score: string | null;
    status: string;
    student_id: number | null;
    created_at: string | null;
};
type Props = {
    applications: Paginated<Row>;
    filters: { search: string; status: string; class: string; year: string; gender: string };
    counts: Record<string, number>;
    classes: Option[];
    years: Option[];
    statuses: Option[];
};

const PIPELINE: { key: string; label: string; icon: LucideIcon; tone: string }[] = [
    { key: 'submitted', label: 'Submitted', icon: ClipboardList, tone: 'text-info bg-info-light dark:bg-info-dark-light' },
    { key: 'under_review', label: 'Under review', icon: FileSearch, tone: 'text-primary bg-primary-light dark:bg-primary-dark-light' },
    { key: 'interview', label: 'Interview', icon: MessagesSquare, tone: 'text-secondary bg-secondary-light dark:bg-secondary-dark-light' },
    { key: 'accepted', label: 'Accepted', icon: CheckCircle2, tone: 'text-success bg-success-light dark:bg-success-dark-light' },
    { key: 'waitlisted', label: 'Waitlisted', icon: Hourglass, tone: 'text-warning bg-warning-light dark:bg-warning-dark-light' },
    { key: 'rejected', label: 'Rejected', icon: XCircle, tone: 'text-danger bg-danger-light dark:bg-danger-dark-light' },
    { key: 'enrolled', label: 'Enrolled', icon: UserCheck, tone: 'text-primary bg-primary-light dark:bg-primary-dark-light' },
];

export default function AdmissionsIndex({ applications, filters: initial, counts, classes, years, statuses }: Props) {
    const can = useCan();
    const { filters, setFilter, reset } = useFilters(initial);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const decided = (counts.accepted ?? 0) + (counts.enrolled ?? 0);
    const acceptanceRate = total ? Math.round((decided / Math.max(1, decided + (counts.rejected ?? 0) + (counts.waitlisted ?? 0))) * 100) : 0;

    const columns: Column<Row>[] = [
        {
            key: 'applicant',
            header: 'Applicant',
            render: (a) => (
                <div className="flex items-center gap-3">
                    <Avatar name={a.full_name} />
                    <div>
                        <Link href={`/admissions/${a.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {a.full_name}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {a.application_no} · {titleCase(a.gender)}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'class',
            header: 'Applying for',
            render: (a) => (
                <div>
                    <div className="font-semibold">{a.class ?? '—'}</div>
                    <div className="text-xs text-white-dark">
                        {a.year ?? ''} · {titleCase(a.residence_type)}
                    </div>
                </div>
            ),
        },
        {
            key: 'guardian',
            header: 'Guardian',
            render: (a) => (
                <div>
                    <div className="font-semibold">{a.guardian_name}</div>
                    <div className="text-xs text-white-dark">{a.guardian_phone}</div>
                </div>
            ),
        },
        { key: 'created_at', header: 'Applied', render: (a) => date(a.created_at) },
        {
            key: 'interview',
            header: 'Interview / score',
            render: (a) =>
                a.interview_date || a.assessment_score ? (
                    <div>
                        <div className="text-sm">{date(a.interview_date)}</div>
                        {a.assessment_score && <div className={cn('text-xs font-bold', Number(a.assessment_score) >= 50 ? 'text-success' : 'text-danger')}>{Number(a.assessment_score)}%</div>}
                    </div>
                ) : (
                    <span className="text-white-dark">—</span>
                ),
        },
        { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (a) => (
                <RowActions
                    view={`/admissions/${a.id}`}
                    edit={can('admissions.manage') && !['enrolled', 'withdrawn', 'rejected'].includes(a.status) ? `/admissions/${a.id}/edit` : undefined}
                    destroy={can('admissions.manage') && a.status !== 'enrolled' ? `/admissions/${a.id}` : undefined}
                    label="application"
                />
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Admissions"
                subtitle="Applications from submission through interview, decision and enrolment."
                breadcrumbs={[{ title: 'Admissions' }]}
                actions={
                    <>
                        <a href={`/admissions/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        {can('admissions.manage') && (
                            <Link href="/admissions/create" className="btn btn-primary">
                                <Plus className="h-4 w-4" /> New application
                            </Link>
                        )}
                    </>
                }
            />

            {/* Pipeline */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                {PIPELINE.map((p, i) => {
                    const Icon = p.icon;
                    const active = filters.status === p.key;
                    return (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => setFilter('status', active ? '' : p.key)}
                            className={cn('panel relative flex flex-col items-start gap-2 p-4 text-start transition hover:-translate-y-0.5 hover:shadow-lg', active && 'ring-2 ring-primary')}
                        >
                            <span className={cn('grid h-9 w-9 place-content-center rounded-lg', p.tone)}>
                                <Icon className="h-5 w-5" />
                            </span>
                            <div className="text-2xl font-extrabold text-black dark:text-white-light">{num(counts[p.key] ?? 0)}</div>
                            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">{p.label}</div>
                            {i < PIPELINE.length - 1 && <span className="absolute top-1/2 -end-2.5 hidden h-0.5 w-2 bg-white-light xl:block dark:bg-[#1b2e4b]" />}
                        </button>
                    );
                })}
            </div>

            <div className="panel">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-white-dark">
                    <span className="flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4" />
                        <strong className="text-black dark:text-white-light">{num((counts.submitted ?? 0) + (counts.under_review ?? 0) + (counts.interview ?? 0))}</strong> awaiting a decision
                    </span>
                    <span>
                        Acceptance rate <strong className="text-success">{acceptanceRate}%</strong> · {num(counts.withdrawn ?? 0)} withdrawn
                    </span>
                </div>
                <Tabs
                    tabs={[{ key: '', label: 'All', count: total }, ...statuses.map((s) => ({ key: String(s.value), label: s.label, count: counts[String(s.value)] ?? 0 }))]}
                    active={filters.status}
                    onChange={(k) => setFilter('status', k)}
                />
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Name, application no, guardian…" />
                    <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                    <FilterSelect value={filters.year} onChange={(v) => setFilter('year', v)} options={years} placeholder="All intakes" />
                    <FilterSelect value={filters.gender} onChange={(v) => setFilter('gender', v)} options={['male', 'female'].map((g) => ({ value: g, label: titleCase(g) }))} placeholder="Any gender" />
                </FilterBar>
                <DataTable columns={columns} paginated={applications} empty="No applications found" emptyDescription="Try another status tab or record a new application." />
            </div>
        </>
    );
}
