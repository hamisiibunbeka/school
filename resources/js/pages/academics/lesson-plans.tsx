import { router, useForm } from '@inertiajs/react';
import { BookCheck, CheckCircle2, ClipboardList, Download, Plus, SkipForward, Timer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cn, exportCsv, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Plan = {
    id: number;
    school_class_id: number;
    subject_id: number;
    employee_id: number | null;
    term_id: number | null;
    week: number | null;
    topic: string;
    sub_topic: string | null;
    objectives: string | null;
    activities: string | null;
    status: string;
    class: string | null;
    subject: string | null;
    teacher: string | null;
    term: string | null;
};
type Coverage = { key: string; class: string; subject: string; total: number; taught: number; skipped: number; percent: number };
type Props = {
    plans: Paginated<Plan>;
    filters: { search: string; class: string; subject: string; term: string; teacher: string; status: string };
    coverage: Coverage[];
    stats: { total: number; taught: number; planned: number; skipped: number };
    classes: (Option & { streams: Option[] })[];
    subjects: Option[];
    terms: Option[];
    teachers: Option[];
    statuses: Option[];
    currentTermId: number | null;
};

const blank = { school_class_id: '', subject_id: '', employee_id: '', term_id: '', week: '1', topic: '', sub_topic: '', objectives: '', activities: '', status: 'planned' };

export default function LessonPlans({ plans, filters: initial, coverage, stats, classes, subjects, terms, teachers, statuses, currentTermId }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const form = useForm(blank);

    const overall = stats.total ? Math.round((stats.taught / stats.total) * 100) : 0;

    const openForm = (p: Plan | null) => {
        setEditing(p);
        form.clearErrors();
        form.setData(
            p
                ? {
                      school_class_id: String(p.school_class_id),
                      subject_id: String(p.subject_id),
                      employee_id: p.employee_id ? String(p.employee_id) : '',
                      term_id: p.term_id ? String(p.term_id) : '',
                      week: String(p.week ?? 1),
                      topic: p.topic,
                      sub_topic: p.sub_topic ?? '',
                      objectives: p.objectives ?? '',
                      activities: p.activities ?? '',
                      status: p.status,
                  }
                : { ...blank, school_class_id: filters.class, subject_id: filters.subject, employee_id: filters.teacher, term_id: filters.term && filters.term !== 'all' ? filters.term : String(currentTermId ?? '') },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/academics/lesson-plans/${editing.id}`, opts);
        else form.post('/academics/lesson-plans', opts);
    };

    const setStatus = (p: Plan, status: string) => router.post(`/academics/lesson-plans/${p.id}/status`, { status }, { preserveScroll: true });

    const columns: Column<Plan>[] = [
        { key: 'week', header: 'Wk', align: 'center', render: (p) => <span className="grid h-8 w-8 place-content-center rounded-full bg-primary-light font-bold text-primary dark:bg-primary-dark-light">{p.week ?? '—'}</span> },
        {
            key: 'topic',
            header: 'Topic',
            render: (p) => (
                <div className="max-w-xs">
                    <div className="font-bold text-black dark:text-white-light">{p.topic}</div>
                    {p.sub_topic && <div className="truncate text-xs text-white-dark">{p.sub_topic}</div>}
                </div>
            ),
        },
        {
            key: 'class',
            header: 'Class · Subject',
            render: (p) => (
                <div>
                    <div className="font-semibold">{p.subject}</div>
                    <div className="text-xs text-white-dark">{p.class}</div>
                </div>
            ),
        },
        { key: 'teacher', header: 'Teacher', render: (p) => p.teacher ?? '—' },
        { key: 'term', header: 'Term', render: (p) => p.term ?? '—' },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} tone={p.status === 'taught' ? 'success' : p.status === 'skipped' ? 'danger' : 'info'} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (p) =>
                manage ? (
                    <RowActions onEdit={() => openForm(p)} destroy={`/academics/lesson-plans/${p.id}`} label="lesson plan">
                        {p.status !== 'taught' && <IconButton icon={CheckCircle2} title="Mark taught" className="text-success" onClick={() => setStatus(p, 'taught')} />}
                        {p.status === 'planned' && <IconButton icon={SkipForward} title="Mark skipped" className="text-warning" onClick={() => setStatus(p, 'skipped')} />}
                        {p.status !== 'planned' && <IconButton icon={Timer} title="Back to planned" className="text-info" onClick={() => setStatus(p, 'planned')} />}
                    </RowActions>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Lesson Plans & Schemes of Work"
                subtitle="Weekly topics per class-subject and how much of the syllabus has been covered."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Lesson Plans' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() => exportCsv('lesson-plans', [['Week', 'Class', 'Subject', 'Topic', 'Sub-topic', 'Teacher', 'Term', 'Status'], ...plans.data.map((p) => [p.week, p.class, p.subject, p.topic, p.sub_topic, p.teacher, p.term, p.status])])}
                        >
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> New lesson plan
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Planned lessons" value={num(stats.total)} icon={ClipboardList} tone="primary" />
                <StatCard title="Taught" value={num(stats.taught)} icon={BookCheck} tone="success" hint={`${overall}% coverage`} />
                <StatCard title="Still to teach" value={num(stats.planned)} icon={Timer} tone="info" />
                <StatCard title="Skipped" value={num(stats.skipped)} icon={SkipForward} tone="danger" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <FilterBar
                        actions={
                            Object.values(filters).some(Boolean) && (
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                    Clear
                                </button>
                            )
                        }
                    >
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search topic…" />
                        <FilterSelect value={filters.term} onChange={(v) => setFilter('term', v)} options={[{ value: 'all', label: 'All terms' }, ...terms]} placeholder="Current term" />
                        <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                        <FilterSelect value={filters.subject} onChange={(v) => setFilter('subject', v)} options={subjects} placeholder="All subjects" />
                        <FilterSelect value={filters.teacher} onChange={(v) => setFilter('teacher', v)} options={teachers} placeholder="All teachers" />
                        <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                    </FilterBar>
                    <DataTable columns={columns} paginated={plans} empty="No lesson plans found" emptyDescription="Add the weekly scheme of work for a class-subject." />
                </div>

                <div className="panel h-max">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Syllabus coverage</h5>
                        <span className="badge badge-soft-success">{overall}% overall</span>
                    </div>
                    {coverage.length === 0 ? (
                        <EmptyState title="No coverage data" description="Coverage is calculated from taught lesson plans." />
                    ) : (
                        <div className="max-h-[640px] space-y-4 overflow-y-auto pe-1">
                            {coverage.map((c) => (
                                <div key={c.key}>
                                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                                        <div className="min-w-0">
                                            <span className="font-bold">{c.subject}</span> <span className="text-xs text-white-dark">· {c.class}</span>
                                        </div>
                                        <span className={cn('shrink-0 text-xs font-extrabold', c.percent >= 75 ? 'text-success' : c.percent >= 40 ? 'text-warning' : 'text-danger')}>{c.percent}%</span>
                                    </div>
                                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div className="h-2 bg-success" style={{ width: `${c.total ? (c.taught / c.total) * 100 : 0}%` }} />
                                        <div className="h-2 bg-danger/70" style={{ width: `${c.total ? (c.skipped / c.total) * 100 : 0}%` }} />
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white-dark">
                                        {c.taught} taught · {c.skipped} skipped · {c.total - c.taught - c.skipped} remaining
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit lesson plan' : 'New lesson plan'} size="lg">
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid cols={3}>
                        <Select label="Class" required placeholder="Select…" options={classes} value={form.data.school_class_id} onChange={(e) => form.setData('school_class_id', e.target.value)} error={form.errors.school_class_id} />
                        <Select label="Subject" required placeholder="Select…" options={subjects} value={form.data.subject_id} onChange={(e) => form.setData('subject_id', e.target.value)} error={form.errors.subject_id} />
                        <Select label="Teacher" placeholder="— None —" options={teachers} value={form.data.employee_id} onChange={(e) => form.setData('employee_id', e.target.value)} error={form.errors.employee_id} />
                        <Select label="Term" required placeholder="Select…" options={terms} value={form.data.term_id} onChange={(e) => form.setData('term_id', e.target.value)} error={form.errors.term_id} />
                        <Input label="Week" type="number" min={1} max={30} required value={form.data.week} onChange={(e) => form.setData('week', e.target.value)} error={form.errors.week} />
                        <Select label="Status" required options={statuses} value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} error={form.errors.status} />
                        <Input label="Topic" required value={form.data.topic} onChange={(e) => form.setData('topic', e.target.value)} error={form.errors.topic} wrapperClassName="sm:col-span-2 lg:col-span-3" />
                        <Input label="Sub-topic" value={form.data.sub_topic} onChange={(e) => form.setData('sub_topic', e.target.value)} error={form.errors.sub_topic} wrapperClassName="sm:col-span-2 lg:col-span-3" />
                        <Textarea label="Learning objectives" value={form.data.objectives} onChange={(e) => form.setData('objectives', e.target.value)} error={form.errors.objectives} wrapperClassName="sm:col-span-2 lg:col-span-3" />
                        <Textarea label="Teaching & learning activities" value={form.data.activities} onChange={(e) => form.setData('activities', e.target.value)} error={form.errors.activities} wrapperClassName="sm:col-span-2 lg:col-span-3" />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save plan
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
