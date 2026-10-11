import { router, useForm } from '@inertiajs/react';
import { CalendarClock, Coffee, DoorOpen, Plus, Trash2, UserRound } from 'lucide-react';
import { Fragment, useState, type FormEvent } from 'react';
import { PrintButton } from '@/components/ui/actions';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Letterhead from '@/components/ui/letterhead';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cleanQuery, cn, num } from '@/lib/utils';
import type { Option } from '@/types';

type Slot = {
    id: number;
    school_class_id: number;
    stream_id: number | null;
    subject_id: number;
    employee_id: number | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room: string | null;
    subject: string | null;
    subject_code: string | null;
    teacher: string | null;
    class: string;
};
type Period = { start: string; end: string };
type Props = {
    filters: { class: string; stream: string; teacher: string };
    slots: Slot[];
    periods: Period[];
    classes: (Option & { streams: Option[] })[];
    subjects: Option[];
    teachers: Option[];
    allocations: { school_class_id: number; stream_id: number | null; subject_id: number; employee_id: number | null }[];
    teacherName: string | null;
    stats: { slots: number; teachers: number; rooms: number };
};

const DAYS = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
];

const DEFAULT_PERIODS: Period[] = [
    { start: '07:30', end: '08:10' },
    { start: '08:10', end: '08:50' },
    { start: '08:50', end: '09:30' },
    { start: '09:30', end: '10:10' },
    { start: '10:40', end: '11:20' },
    { start: '11:20', end: '12:00' },
    { start: '12:00', end: '12:40' },
    { start: '13:40', end: '14:20' },
];

const COLORS = [
    'bg-primary-light text-primary border-primary/30 dark:bg-primary-dark-light',
    'bg-success-light text-success border-success/30 dark:bg-success-dark-light',
    'bg-warning-light text-warning border-warning/30 dark:bg-warning-dark-light',
    'bg-danger-light text-danger border-danger/30 dark:bg-danger-dark-light',
    'bg-info-light text-info border-info/30 dark:bg-info-dark-light',
    'bg-secondary-light text-secondary border-secondary/30 dark:bg-secondary-dark-light',
    'bg-dark-light text-dark border-dark/30 dark:bg-dark-dark-light dark:text-white-light',
];

const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

export default function Timetable({ filters, slots, periods, classes, subjects, teachers, allocations, teacherName, stats }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Slot | null>(null);
    const form = useForm({ school_class_id: '', stream_id: '', subject_id: '', employee_id: '', day_of_week: '1', start_time: '', end_time: '', room: '' });

    const rows = periods.length ? periods : DEFAULT_PERIODS;
    const streams = classes.find((c) => String(c.value) === filters.class)?.streams ?? [];
    const formStreams = classes.find((c) => String(c.value) === form.data.school_class_id)?.streams ?? [];
    const className = classes.find((c) => String(c.value) === filters.class)?.label ?? '';
    const streamName = streams.find((s) => String(s.value) === filters.stream)?.label ?? '';
    const title = filters.teacher ? `Teacher timetable · ${teacherName ?? ''}` : `${className} ${streamName}`.trim();

    const go = (next: Partial<Props['filters']>) => router.get('/academics/timetable', cleanQuery({ ...filters, ...next }) as Record<string, string>, { preserveScroll: true, preserveState: true, replace: true });

    const colorFor = (subjectId: number) => COLORS[subjectId % COLORS.length];

    const cellSlots = (day: number, p: Period) => slots.filter((s) => s.day_of_week === day && toMin(s.start_time) < toMin(p.end) && toMin(s.end_time) > toMin(p.start) && toMin(s.start_time) >= toMin(p.start));

    const openForm = (slot: Slot | null, day?: number, p?: Period) => {
        setEditing(slot);
        form.clearErrors();
        form.setData(
            slot
                ? {
                      school_class_id: String(slot.school_class_id),
                      stream_id: slot.stream_id ? String(slot.stream_id) : '',
                      subject_id: String(slot.subject_id),
                      employee_id: slot.employee_id ? String(slot.employee_id) : '',
                      day_of_week: String(slot.day_of_week),
                      start_time: slot.start_time,
                      end_time: slot.end_time,
                      room: slot.room ?? '',
                  }
                : {
                      school_class_id: filters.teacher ? '' : filters.class,
                      stream_id: filters.teacher ? '' : filters.stream,
                      subject_id: '',
                      employee_id: filters.teacher,
                      day_of_week: String(day ?? 1),
                      start_time: p?.start ?? '',
                      end_time: p?.end ?? '',
                      room: '',
                  },
        );
        setOpen(true);
    };

    const pickSubject = (subjectId: string) => {
        const alloc =
            allocations.find((a) => String(a.subject_id) === subjectId && String(a.school_class_id) === form.data.school_class_id && String(a.stream_id ?? '') === form.data.stream_id) ??
            allocations.find((a) => String(a.subject_id) === subjectId && String(a.school_class_id) === form.data.school_class_id && a.stream_id === null);
        form.setData((d) => ({ ...d, subject_id: subjectId, employee_id: alloc?.employee_id ? String(alloc.employee_id) : d.employee_id }));
    };

    const classSubjects = form.data.school_class_id ? subjects.filter((s) => allocations.some((a) => String(a.school_class_id) === form.data.school_class_id && a.subject_id === Number(s.value))) : subjects;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/academics/timetable/${editing.id}`, opts);
        else form.post('/academics/timetable', opts);
    };

    const remove = async () => {
        if (!editing) return;
        const { confirmed } = await confirm({ title: 'Remove this lesson?', text: `${editing.subject} on ${DAYS[editing.day_of_week - 1]?.label} ${editing.start_time}`, confirmText: 'Remove', danger: true });
        if (confirmed) router.delete(`/academics/timetable/${editing.id}`, { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const lessonsPerWeek = slots.length;

    return (
        <>
            <PageHeader
                title="Timetable"
                subtitle="Weekly lesson grid by class/stream or teacher. Clashes are rejected automatically."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Timetable' }]}
                actions={
                    <>
                        <PrintButton label="Print timetable" />
                        {manage && (
                            <button className="btn btn-primary no-print" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Add lesson
                            </button>
                        )}
                    </>
                }
            />

            <div className="no-print mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Lessons in view" value={num(lessonsPerWeek)} icon={CalendarClock} tone="primary" hint="per week" />
                <StatCard title="All scheduled lessons" value={num(stats.slots)} icon={CalendarClock} tone="info" />
                <StatCard title="Teachers timetabled" value={num(stats.teachers)} icon={UserRound} tone="success" />
                <StatCard title="Rooms in use" value={num(stats.rooms)} icon={DoorOpen} tone="secondary" />
            </div>

            <div className="panel">
                <FilterBar>
                    <FilterSelect value={filters.class} onChange={(v) => go({ class: v, stream: classes.find((c) => String(c.value) === v)?.streams[0]?.value?.toString() ?? '', teacher: '' })} options={classes} placeholder="Select class" />
                    {streams.length > 0 && !filters.teacher && <FilterSelect value={filters.stream} onChange={(v) => go({ stream: v })} options={streams} placeholder="Whole class" />}
                    <span className="hidden text-xs font-bold text-white-dark uppercase sm:inline">or</span>
                    <FilterSelect value={filters.teacher} onChange={(v) => go({ teacher: v, class: v ? '' : filters.class, stream: v ? '' : filters.stream })} options={teachers} placeholder="Teacher view…" />
                </FilterBar>

                <div className="hidden print:block">
                    <Letterhead title={`Class Timetable — ${title}`} />
                </div>
                <h5 className="no-print mb-4 text-lg font-bold">{title || 'Timetable'}</h5>

                {!filters.class && !filters.teacher ? (
                    <EmptyState title="Choose a class or teacher" description="Select a class/stream or a teacher to see the weekly grid." />
                ) : (
                    <div className="table-responsive">
                        <table className="table-compact w-full min-w-[760px] border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="w-28 border border-white-light bg-[#f6f8fa] p-2 text-start dark:border-[#1b2e4b] dark:bg-[#1a2941]">Time</th>
                                    {DAYS.map((d) => (
                                        <th key={d.value} className="border border-white-light bg-[#f6f8fa] p-2 text-center dark:border-[#1b2e4b] dark:bg-[#1a2941]">
                                            {d.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((p, i) => {
                                    const prev = rows[i - 1];
                                    const gap = prev ? toMin(p.start) - toMin(prev.end) : 0;
                                    return (
                                        <Fragment key={`${p.start}-${p.end}`}>
                                            {gap >= 15 && (
                                                <tr>
                                                    <td className="border border-white-light p-2 text-xs font-semibold text-white-dark dark:border-[#1b2e4b]">
                                                        {prev.end} – {p.start}
                                                    </td>
                                                    <td colSpan={5} className="border border-white-light bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(128,93,202,0.06)_6px,rgba(128,93,202,0.06)_12px)] p-2 text-center text-xs font-bold tracking-widest text-secondary uppercase dark:border-[#1b2e4b]">
                                                        <Coffee className="me-1 inline h-3.5 w-3.5" /> {gap >= 45 ? 'Lunch break' : 'Break'}
                                                    </td>
                                                </tr>
                                            )}
                                            <tr>
                                                <td className="border border-white-light p-2 align-top dark:border-[#1b2e4b]">
                                                    <div className="font-bold text-black dark:text-white-light">P{i + 1}</div>
                                                    <div className="text-xs text-white-dark">
                                                        {p.start} – {p.end}
                                                    </div>
                                                </td>
                                                {DAYS.map((d) => {
                                                    const items = cellSlots(d.value, p);
                                                    return (
                                                        <td key={d.value} className="h-[68px] border border-white-light p-1 align-top dark:border-[#1b2e4b]">
                                                            {items.length > 0 ? (
                                                                <div className="space-y-1">
                                                                    {items.map((s) => (
                                                                        <button
                                                                            key={s.id}
                                                                            type="button"
                                                                            disabled={!manage}
                                                                            onClick={() => openForm(s)}
                                                                            className={cn('block w-full rounded-md border px-2 py-1.5 text-start transition hover:shadow-md disabled:cursor-default', colorFor(s.subject_id))}
                                                                        >
                                                                            <div className="truncate text-xs font-extrabold">{s.subject_code ?? s.subject}</div>
                                                                            <div className="truncate text-[11px] font-semibold opacity-80">{filters.teacher ? s.class : (s.teacher ?? 'No teacher')}</div>
                                                                            {s.room && <div className="truncate text-[10px] opacity-70">Room {s.room}</div>}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ) : manage ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openForm(null, d.value, p)}
                                                                    className="no-print grid h-full min-h-[56px] w-full place-content-center rounded-md text-white-dark opacity-0 transition hover:bg-primary-light hover:text-primary hover:opacity-100 dark:hover:bg-primary-dark-light"
                                                                    title="Add lesson"
                                                                >
                                                                    <Plus className="h-4 w-4" />
                                                                </button>
                                                            ) : null}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit lesson' : 'Add lesson'}
                size="lg"
            >
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid>
                        <Select
                            label="Class"
                            required
                            placeholder="Select class…"
                            options={classes}
                            value={form.data.school_class_id}
                            onChange={(e) => form.setData((d) => ({ ...d, school_class_id: e.target.value, stream_id: '' }))}
                            error={form.errors.school_class_id}
                        />
                        <Select label="Stream" placeholder="Whole class" options={formStreams} value={form.data.stream_id} onChange={(e) => form.setData('stream_id', e.target.value)} error={form.errors.stream_id} />
                        <Select label="Subject" required placeholder="Select subject…" options={classSubjects} value={form.data.subject_id} onChange={(e) => pickSubject(e.target.value)} error={form.errors.subject_id} />
                        <Select label="Teacher" placeholder="— None —" options={teachers} value={form.data.employee_id} onChange={(e) => form.setData('employee_id', e.target.value)} error={form.errors.employee_id} />
                        <Select label="Day" required options={DAYS} value={form.data.day_of_week} onChange={(e) => form.setData('day_of_week', e.target.value)} error={form.errors.day_of_week} />
                        <Input label="Room" placeholder="e.g. Lab 1" value={form.data.room} onChange={(e) => form.setData('room', e.target.value)} error={form.errors.room} />
                        <Input label="Starts" type="time" required value={form.data.start_time} onChange={(e) => form.setData('start_time', e.target.value)} error={form.errors.start_time} />
                        <Input label="Ends" type="time" required value={form.data.end_time} onChange={(e) => form.setData('end_time', e.target.value)} error={form.errors.end_time} />
                    </FormGrid>
                    <div className="flex flex-wrap gap-1">
                        <span className="me-1 text-xs font-semibold text-white-dark">Quick period:</span>
                        {rows.map((p, i) => (
                            <button key={p.start} type="button" className="badge badge-outline-primary cursor-pointer" onClick={() => form.setData((d) => ({ ...d, start_time: p.start, end_time: p.end }))}>
                                P{i + 1}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            {editing && (
                                <button type="button" className="btn btn-outline-danger" onClick={remove}>
                                    <Trash2 className="h-4 w-4" /> Remove
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" disabled={form.processing}>
                                Save lesson
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>
        </>
    );
}
