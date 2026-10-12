import { Link, router, useForm } from '@inertiajs/react';
import { Award, CheckCircle2, Gavel, Plus, ShieldAlert, Star } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, num, titleCase, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import StudentPicker, { type StudentOption } from './_components/student-picker';

type Case = {
    id: number;
    student_id: number;
    student: string | null;
    admission_no: string | null;
    photo_url: string | null;
    class: string;
    incident_date: string;
    type: string;
    title: string;
    description: string | null;
    action_taken: string | null;
    status: string;
    reporter: string | null;
};

type Props = {
    cases: Paginated<Case>;
    filters: { search: string; type: string; status: string; class: string; student: string };
    classes: Option[];
    types: Option[];
    statuses: Option[];
    prefill: StudentOption | null;
    term: string | null;
    stats: { open: number; misconduct_term: number; resolved_term: number; awards_term: number };
};

const typeTone: Record<string, 'danger' | 'success' | 'info'> = { misconduct: 'danger', award: 'success', commendation: 'info' };

const blank = { student_id: '' as number | '', incident_date: today(), type: 'misconduct', title: '', description: '', action_taken: '', status: 'open', notify_guardian: false };

export default function Discipline({ cases, filters: initial, classes, types, statuses, prefill, term, stats }: Props) {
    const can = useCan();
    const manage = can('attendance.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Case | null>(null);
    const [student, setStudent] = useState<StudentOption | null>(null);
    const form = useForm(blank);

    const openForm = (c: Case | null, preset?: Partial<typeof blank>) => {
        setEditing(c);
        form.clearErrors();
        if (c) {
            setStudent({ value: c.student_id, label: `${c.student} · ${c.admission_no}`, class: c.class });
            form.setData({
                student_id: c.student_id,
                incident_date: c.incident_date,
                type: c.type,
                title: c.title,
                description: c.description ?? '',
                action_taken: c.action_taken ?? '',
                status: c.status,
                notify_guardian: false,
            });
        } else {
            setStudent(prefill);
            form.setData({ ...blank, student_id: prefill?.value ?? '', ...preset });
        }
        setOpen(true);
    };

    // Opening /attendance/discipline?student=ID from a student profile jumps straight to the form.
    useEffect(() => {
        if (prefill && manage) openForm(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/attendance/discipline/${editing.id}`, opts);
        else form.post('/attendance/discipline', opts);
    };

    const resolve = async (c: Case) => {
        const { confirmed, value } = await confirm({ title: 'Resolve this case?', text: 'Record the final action taken (e.g. counselling completed, parent meeting held).', confirmText: 'Mark resolved', input: 'text', inputPlaceholder: c.action_taken ?? 'Action taken…' });
        if (confirmed) router.post(`/attendance/discipline/${c.id}/resolve`, { action_taken: value }, { preserveScroll: true });
    };

    const columns: Column<Case>[] = [
        { key: 'date', header: 'Date', render: (c) => <span className="whitespace-nowrap">{date(c.incident_date)}</span> },
        {
            key: 'student',
            header: 'Student',
            render: (c) => (
                <div className="flex items-center gap-3">
                    <Avatar name={c.student ?? '?'} src={c.photo_url} />
                    <div>
                        <Link href={`/students/${c.student_id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {c.student}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {c.admission_no} · {c.class || '—'}
                        </div>
                    </div>
                </div>
            ),
        },
        { key: 'type', header: 'Type', render: (c) => <StatusBadge status={c.type} tone={typeTone[c.type]} /> },
        {
            key: 'title',
            header: 'Incident / recognition',
            render: (c) => (
                <div className="max-w-xs">
                    <div className="font-semibold">{c.title}</div>
                    {c.description && <div className="line-clamp-2 text-xs text-white-dark">{c.description}</div>}
                </div>
            ),
        },
        { key: 'action_taken', header: 'Action taken', render: (c) => <span className="text-sm">{c.action_taken ?? '—'}</span> },
        { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
        { key: 'reporter', header: 'Reported by', render: (c) => <span className="text-xs">{c.reporter ?? '—'}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) =>
                manage ? (
                    <RowActions onEdit={() => openForm(c)} destroy={`/attendance/discipline/${c.id}`} label="case">
                        {c.status === 'open' && <IconButton icon={CheckCircle2} title="Resolve" className="text-success" onClick={() => resolve(c)} />}
                    </RowActions>
                ) : null,
        },
    ];

    const isMisconduct = form.data.type === 'misconduct';

    return (
        <>
            <PageHeader
                title="Discipline & Conduct"
                subtitle="Incidents, sanctions, awards and commendations. Records are restricted to authorised staff."
                breadcrumbs={[{ title: 'Attendance', href: '/attendance' }, { title: 'Discipline' }]}
                actions={
                    manage && (
                        <>
                            <button type="button" className="btn btn-outline-success" onClick={() => openForm(null, { type: 'award', status: 'resolved' })}>
                                <Award className="h-4 w-4" /> Record award
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Report incident
                            </button>
                        </>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Open cases" value={num(stats.open)} icon={ShieldAlert} tone="danger" hint="Misconduct awaiting action" />
                <StatCard title="Incidents this term" value={num(stats.misconduct_term)} icon={Gavel} tone="warning" hint={term ?? undefined} />
                <StatCard title="Resolved this term" value={num(stats.resolved_term)} icon={CheckCircle2} tone="success" />
                <StatCard title="Awards & commendations" value={num(stats.awards_term)} icon={Star} tone="info" hint={term ?? undefined} />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student or title…" />
                    <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={types} placeholder="All types" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                    <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                </FilterBar>
                <DataTable columns={columns} paginated={cases} empty="No discipline records" emptyDescription="Incidents and awards you record will appear here." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit record' : isMisconduct ? 'Report incident' : `Record ${titleCase(form.data.type)}`} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <StudentPicker
                        value={student}
                        required
                        error={form.errors.student_id}
                        onChange={(s) => {
                            setStudent(s);
                            form.setData('student_id', s?.value ?? '');
                        }}
                    />
                    <FormGrid cols={3}>
                        <Select label="Type" required value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} options={types} error={form.errors.type} />
                        <Input label="Date" type="date" required max={today()} value={form.data.incident_date} onChange={(e) => form.setData('incident_date', e.target.value)} error={form.errors.incident_date} />
                        <Select label="Status" required value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} options={statuses} error={form.errors.status} />
                    </FormGrid>
                    <Input
                        label={isMisconduct ? 'Incident' : 'Achievement'}
                        required
                        placeholder={isMisconduct ? 'e.g. Fighting during break time' : 'e.g. 1st place, regional science fair'}
                        value={form.data.title}
                        onChange={(e) => form.setData('title', e.target.value)}
                        error={form.errors.title}
                    />
                    <Textarea label="Details" rows={3} value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} />
                    <Input
                        label={isMisconduct ? 'Action taken' : 'Recognition given'}
                        placeholder={isMisconduct ? 'e.g. Counselling; parent meeting; 2-day suspension' : 'e.g. Certificate at assembly'}
                        value={form.data.action_taken}
                        onChange={(e) => form.setData('action_taken', e.target.value)}
                        error={form.errors.action_taken}
                    />
                    <Checkbox label="Notify guardian(s) with a parent-portal account" checked={form.data.notify_guardian} onChange={(e) => form.setData('notify_guardian', e.target.checked)} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {editing ? 'Save changes' : 'Save record'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
