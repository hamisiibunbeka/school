import { Link } from '@inertiajs/react';
import { BarChart3, ClipboardEdit, FileCheck2, FileText, NotebookPen, Plus, Scale, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { IconLink, RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { date, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import ExamFormModal, { type ExamRow, type TermOption } from './_components/exam-form';

type Props = {
    exams: Paginated<ExamRow>;
    filters: { search: string; year: string; term: string; status: string };
    years: Option[];
    terms: TermOption[];
    classes: Option[];
    types: Option[];
    statuses: Option[];
    defaults: { academic_year_id: number | null; term_id: number | null };
    canApprove: boolean;
    stats: { total: number; marks_entry: number; moderation: number; published: number };
};

export default function ExamsIndex({ exams, filters: initial, years, terms, classes, types, statuses, defaults, canApprove, stats }: Props) {
    const can = useCan();
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ExamRow | null>(null);
    const termOptions = filters.year ? terms.filter((t) => String(t.academic_year_id) === String(filters.year)) : terms;

    const columns: Column<ExamRow>[] = [
        {
            key: 'name',
            header: 'Examination',
            render: (e) => (
                <div>
                    <Link href={`/exams/${e.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                        {e.name}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {titleCase(e.type)} · {[e.term, e.year].filter(Boolean).join(', ')}
                    </div>
                </div>
            ),
        },
        {
            key: 'dates',
            header: 'Dates',
            render: (e) => <span className="text-sm whitespace-nowrap">{e.start_date ? `${date(e.start_date, { day: '2-digit', month: 'short' })} – ${date(e.end_date)}` : '—'}</span>,
        },
        {
            key: 'classes',
            header: 'Classes',
            render: (e) => (
                <div className="flex max-w-[220px] flex-wrap gap-1">
                    {e.classes.map((c) => (
                        <span key={c} className="badge badge-soft-dark">
                            {c}
                        </span>
                    ))}
                </div>
            ),
        },
        { key: 'max', header: 'Out of', align: 'right', render: (e) => num(e.max_score) },
        { key: 'weight', header: 'Weight', align: 'right', render: (e) => `${num(e.weight)}%` },
        { key: 'marks', header: 'Marks', align: 'right', render: (e) => num(e.marks_count ?? 0) },
        { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (e) => (
                <RowActions
                    view={`/exams/${e.id}`}
                    onEdit={canApprove && e.status !== 'published' ? () => (setEditing(e), setOpen(true)) : undefined}
                    destroy={canApprove && e.status === 'draft' && !e.marks_count ? `/exams/${e.id}` : undefined}
                    label="exam"
                >
                    {can('exams.manage') && ['marks_entry', 'moderation'].includes(e.status) && <IconLink href={`/exams/${e.id}/marks`} icon={NotebookPen} title="Enter marks" className="text-secondary" />}
                    {e.status !== 'draft' && <IconLink href={`/exams/${e.id}/results`} icon={BarChart3} title="Results analysis" className="text-success" />}
                </RowActions>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Examinations"
                subtitle="Plan exams, track mark entry and approve results for publication."
                breadcrumbs={[{ title: 'Exams' }]}
                actions={
                    <>
                        <Link href="/exams/report-cards" className="btn btn-outline-primary">
                            <FileText className="h-4 w-4" /> Report cards
                        </Link>
                        <Link href="/exams/grading" className="btn btn-outline-secondary">
                            <Scale className="h-4 w-4" /> Grading
                        </Link>
                        {canApprove && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    setEditing(null);
                                    setOpen(true);
                                }}
                            >
                                <Plus className="h-4 w-4" /> New exam
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Exams this year" value={num(stats.total)} icon={FileCheck2} tone="primary" />
                <StatCard title="Mark entry open" value={num(stats.marks_entry)} icon={ClipboardEdit} tone="info" />
                <StatCard title="In moderation" value={num(stats.moderation)} icon={Scale} tone="secondary" hint="Awaiting approval" />
                <StatCard title="Published" value={num(stats.published)} icon={ShieldCheck} tone="success" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search exams…" />
                    <FilterSelect
                        value={filters.year}
                        onChange={(v) => {
                            setFilter('year', v);
                            setFilter('term', '');
                        }}
                        options={years}
                        placeholder="All years"
                    />
                    <FilterSelect value={filters.term} onChange={(v) => setFilter('term', v)} options={termOptions} placeholder="All terms" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                </FilterBar>
                <DataTable columns={columns} paginated={exams} empty="No examinations yet" emptyDescription={canApprove ? 'Create the first exam to start collecting marks.' : undefined} />
            </div>

            <ExamFormModal open={open} onClose={() => setOpen(false)} exam={editing} years={years} terms={terms} classes={classes} types={types} defaults={defaults} />
        </>
    );
}
