import { useForm } from '@inertiajs/react';
import { AlarmClock, BookOpenCheck, CalendarClock, FileCheck2, Paperclip, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { date, num, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = {
    id: number;
    school_class_id: number;
    stream_id: number | null;
    subject_id: number;
    employee_id: number | null;
    title: string;
    instructions: string | null;
    due_date: string | null;
    max_score: string | null;
    status: string;
    attachment_url: string | null;
    attachment_name: string | null;
    class: string;
    subject: string | null;
    teacher: string | null;
    created_at: string | null;
};
type Props = {
    assignments: Paginated<Row>;
    filters: { search: string; class: string; subject: string; teacher: string; status: string; due: string };
    classes: (Option & { streams: Option[] })[];
    subjects: Option[];
    teachers: Option[];
    statuses: Option[];
    stats: { published: number; due_week: number; overdue: number; closed: number };
};

const blank = {
    school_class_id: '',
    stream_id: '',
    subject_id: '',
    employee_id: '',
    title: '',
    instructions: '',
    due_date: '',
    max_score: '',
    status: 'published',
    attachment: null as File | null,
    remove_attachment: false,
    _method: 'post',
};

function daysLeft(due: string | null): number | null {
    if (!due) return null;
    return Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000);
}

export default function Homework({ assignments, filters: initial, classes, subjects, teachers, statuses, stats }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Row | null>(null);
    const form = useForm(blank);
    const streams = classes.find((c) => String(c.value) === form.data.school_class_id)?.streams ?? [];
    const err = form.errors as Record<string, string>;

    const openForm = (r: Row | null) => {
        setEditing(r);
        form.clearErrors();
        form.setData(
            r
                ? {
                      school_class_id: String(r.school_class_id),
                      stream_id: r.stream_id ? String(r.stream_id) : '',
                      subject_id: String(r.subject_id),
                      employee_id: r.employee_id ? String(r.employee_id) : '',
                      title: r.title,
                      instructions: r.instructions ?? '',
                      due_date: r.due_date ?? '',
                      max_score: r.max_score ? String(Number(r.max_score)) : '',
                      status: r.status,
                      attachment: null,
                      remove_attachment: false,
                      _method: 'put',
                  }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(editing ? `/academics/homework/${editing.id}` : '/academics/homework', { forceFormData: true, preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const columns: Column<Row>[] = [
        {
            key: 'title',
            header: 'Assignment',
            render: (r) => (
                <div className="max-w-sm">
                    <div className="font-bold text-black dark:text-white-light">{r.title}</div>
                    {r.instructions && <div className="line-clamp-1 text-xs text-white-dark">{r.instructions}</div>}
                    {r.attachment_url && (
                        <a href={r.attachment_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                            <Paperclip className="h-3 w-3" /> {r.attachment_name}
                        </a>
                    )}
                </div>
            ),
        },
        {
            key: 'class',
            header: 'Class · Subject',
            render: (r) => (
                <div>
                    <div className="font-semibold">{r.subject}</div>
                    <div className="text-xs text-white-dark">{r.class}</div>
                </div>
            ),
        },
        { key: 'teacher', header: 'Teacher', render: (r) => r.teacher ?? '—' },
        {
            key: 'due',
            header: 'Due',
            render: (r) => {
                const d = daysLeft(r.due_date);
                return (
                    <div>
                        <div className="font-semibold">{date(r.due_date)}</div>
                        {r.status === 'published' && d !== null && (
                            <div className={d < 0 ? 'text-xs font-bold text-danger' : d <= 2 ? 'text-xs font-bold text-warning' : 'text-xs text-white-dark'}>
                                {d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? 'Due today' : `in ${d} days`}
                            </div>
                        )}
                    </div>
                );
            },
        },
        { key: 'max', header: 'Max score', align: 'right', render: (r) => (r.max_score ? num(r.max_score) : '—') },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'actions', header: '', align: 'right', render: (r) => (manage ? <RowActions onEdit={() => openForm(r)} destroy={`/academics/homework/${r.id}`} label="assignment" /> : null) },
    ];

    return (
        <>
            <PageHeader
                title="Homework & Assignments"
                subtitle="Publish work to classes with due dates, marks and attachments."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Homework' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> New assignment
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Active assignments" value={num(stats.published)} icon={BookOpenCheck} tone="primary" />
                <StatCard title="Due this week" value={num(stats.due_week)} icon={CalendarClock} tone="warning" />
                <StatCard title="Past due (open)" value={num(stats.overdue)} icon={AlarmClock} tone="danger" />
                <StatCard title="Closed" value={num(stats.closed)} icon={FileCheck2} tone="success" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search title or instructions…" />
                    <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                    <FilterSelect value={filters.subject} onChange={(v) => setFilter('subject', v)} options={subjects} placeholder="All subjects" />
                    <FilterSelect value={filters.teacher} onChange={(v) => setFilter('teacher', v)} options={teachers} placeholder="All teachers" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                    <FilterSelect
                        value={filters.due}
                        onChange={(v) => setFilter('due', v)}
                        options={[
                            { value: 'upcoming', label: 'Upcoming' },
                            { value: 'overdue', label: 'Overdue' },
                        ]}
                        placeholder="Any due date"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={assignments} empty="No assignments found" emptyDescription="Publish homework for a class to see it here." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit assignment' : 'New assignment'} size="lg">
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid>
                        <Input label="Title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={err.title} wrapperClassName="sm:col-span-2" />
                        <Select
                            label="Class"
                            required
                            placeholder="Select…"
                            options={classes}
                            value={form.data.school_class_id}
                            onChange={(e) => form.setData((d) => ({ ...d, school_class_id: e.target.value, stream_id: '' }))}
                            error={err.school_class_id}
                        />
                        <Select label="Stream" placeholder="Whole class" options={streams} value={form.data.stream_id} onChange={(e) => form.setData('stream_id', e.target.value)} error={err.stream_id} />
                        <Select label="Subject" required placeholder="Select…" options={subjects} value={form.data.subject_id} onChange={(e) => form.setData('subject_id', e.target.value)} error={err.subject_id} />
                        <Select label="Teacher" placeholder="— None —" options={teachers} value={form.data.employee_id} onChange={(e) => form.setData('employee_id', e.target.value)} error={err.employee_id} />
                        <Input label="Due date" type="date" required value={form.data.due_date} onChange={(e) => form.setData('due_date', e.target.value)} error={err.due_date} />
                        <Input label="Max score" type="number" min={0} step="0.5" value={form.data.max_score} onChange={(e) => form.setData('max_score', e.target.value)} error={err.max_score} />
                        <Select label="Status" required options={statuses} value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} error={err.status} />
                        <Textarea label="Instructions" rows={4} value={form.data.instructions} onChange={(e) => form.setData('instructions', e.target.value)} error={err.instructions} wrapperClassName="sm:col-span-2" />
                        <Field label="Attachment" error={err.attachment} help="PDF, Word, PowerPoint, Excel, image or ZIP up to 10 MB" className="sm:col-span-2">
                            <input type="file" className="form-input p-1.5 file:me-3 file:rounded file:border-0 file:bg-primary/90 file:px-3 file:py-1 file:text-white" onChange={(e) => form.setData('attachment', e.target.files?.[0] ?? null)} />
                        </Field>
                    </FormGrid>
                    {editing?.attachment_url && !form.data.attachment && (
                        <div className="flex flex-wrap items-center gap-3 rounded-md bg-[#f6f8fa] p-3 text-sm dark:bg-[#1a2941]">
                            <Paperclip className="h-4 w-4 text-primary" />
                            <a href={editing.attachment_url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                                {editing.attachment_name}
                            </a>
                            <Checkbox label={<span className="inline-flex items-center gap-1 text-danger"><X className="h-3 w-3" /> Remove</span>} checked={form.data.remove_attachment} onChange={(e) => form.setData('remove_attachment', e.target.checked)} />
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save assignment
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
