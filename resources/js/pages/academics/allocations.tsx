import { Link, useForm } from '@inertiajs/react';
import { AlertTriangle, BookOpen, CalendarClock, Grid3X3, LayoutList, Plus, Settings, UserCheck, UserX, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { Checkbox, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { cn, exportCsv, num } from '@/lib/utils';
import type { Option } from '@/types';

type ClassInfo = { id: number; name: string; code: string | null; streams_count: number; education_level: string };
type Allocation = {
    id: number;
    school_class_id: number;
    stream_id: number | null;
    stream: string | null;
    subject_id: number;
    subject: string | null;
    subject_code: string | null;
    subject_type: string | null;
    employee_id: number | null;
    teacher: string | null;
    periods_per_week: number | null;
    is_joint: boolean;
    effective_periods: number;
};
type Workload = {
    id: number;
    name: string;
    employee_no: string;
    designation: string | null;
    allocations: number;
    subjects: string[];
    teaching: number;
    class_teacher_streams: number;
    duty_periods: number;
    duty_note: string | null;
    roster_periods: number;
    roster_duties: string[];
    duties: number;
    periods: number;
    limit: number;
    custom_limit: boolean;
    status: 'over' | 'near' | 'ok' | 'free';
    timetabled: number;
    timetable_gap: number;
};
type Props = {
    classes: ClassInfo[];
    allocations: Allocation[];
    workload: Workload[];
    workloadSettings: { max_teaching_periods: number; workload_enforcement: 'warn' | 'block'; class_teacher_periods: number };
    subjects: Option[];
    teachers: Option[];
    classOptions: (Option & { streams: Option[] })[];
};

export default function Allocations({ classes, allocations, workload, workloadSettings, subjects, teachers, classOptions }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const [tab, setTab] = useState('class');
    const [classId, setClassId] = useState<number | null>(classes[0]?.id ?? null);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Allocation | null>(null);
    const form = useForm({ school_class_id: '', stream_id: '', subject_id: '', employee_id: '', periods_per_week: '4', is_joint: false });

    const forClass = allocations.filter((a) => a.school_class_id === classId);
    const overloaded = workload.filter((w) => w.status === 'over');
    const notTimetabled = workload.filter((w) => w.teaching > 0 && w.timetable_gap !== 0);
    const unassigned = allocations.filter((a) => !a.employee_id).length;
    const streams = classOptions.find((c) => String(c.value) === form.data.school_class_id)?.streams ?? [];
    const wl = (employeeId: number | null) => workload.find((w) => w.id === employeeId);
    const loadOf = (employeeId: number | null) => wl(employeeId)?.periods ?? 0;
    const isOver = (employeeId: number | null) => wl(employeeId)?.status === 'over';
    const formClass = classes.find((c) => String(c.id) === form.data.school_class_id);

    const matrixSubjects = useMemo(() => {
        const map = new Map<number, string>();
        allocations.forEach((a) => map.set(a.subject_id, a.subject ?? ''));
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [allocations]);

    const openForm = (row: Allocation | null) => {
        setEditing(row);
        form.clearErrors();
        form.setData(
            row
                ? {
                      school_class_id: String(row.school_class_id),
                      stream_id: row.stream_id ? String(row.stream_id) : '',
                      subject_id: String(row.subject_id),
                      employee_id: row.employee_id ? String(row.employee_id) : '',
                      periods_per_week: String(row.periods_per_week ?? 4),
                      is_joint: row.is_joint,
                  }
                : { school_class_id: classId ? String(classId) : '', stream_id: '', subject_id: '', employee_id: '', periods_per_week: '4', is_joint: false },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/academics/allocations/${editing.id}`, opts);
        else form.post('/academics/allocations', opts);
    };

    const columns: Column<Allocation>[] = [
        {
            key: 'subject',
            header: 'Subject',
            render: (a) => (
                <div className="flex items-center gap-3">
                    <span className="grid h-9 w-12 shrink-0 place-content-center rounded-lg bg-primary-light text-[11px] font-extrabold text-primary dark:bg-primary-dark-light">
                        {a.subject_code ?? '—'}
                    </span>
                    <div>
                        <div className="font-bold">{a.subject}</div>
                        <div className="text-xs text-white-dark capitalize">{a.subject_type}</div>
                    </div>
                </div>
            ),
        },
        {
            key: 'scope',
            header: 'Taught in',
            render: (a) =>
                a.stream ? (
                    <span className="badge badge-soft-info">Stream {a.stream} only</span>
                ) : a.is_joint ? (
                    <span className="badge badge-soft-secondary" title="All streams taught together — counted once">
                        All streams · jointly
                    </span>
                ) : (
                    <span className="badge badge-soft-dark">All streams</span>
                ),
        },
        {
            key: 'teacher',
            header: 'Teacher',
            render: (a) =>
                a.teacher ? (
                    <div className="flex items-center gap-2">
                        <Avatar name={a.teacher} className="h-7 w-7 text-[10px]" />
                        <div>
                            <div className="font-semibold">{a.teacher}</div>
                            <div className={cn('text-xs', isOver(a.employee_id) ? 'font-bold text-danger' : 'text-white-dark')}>
                                {loadOf(a.employee_id)} / {wl(a.employee_id)?.limit ?? workloadSettings.max_teaching_periods} periods/week {isOver(a.employee_id) && '· overloaded'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <span className="badge badge-soft-danger">Unassigned</span>
                ),
        },
        { key: 'periods', header: 'Periods / week', align: 'center', render: (a) => <span className="font-bold">{a.periods_per_week ?? '—'}</span> },
        { key: 'effective', header: 'Teaching load', align: 'center', render: (a) => <span className="text-white-dark">{a.effective_periods}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (a) => (manage ? <RowActions onEdit={() => openForm(a)} destroy={`/academics/allocations/${a.id}`} label="subject allocation" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Teacher Allocation"
                subtitle="Which teacher takes which subject in each class, and how heavy each timetable is."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Teacher Allocation' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('teacher-allocation', [
                                    ['Class', 'Stream', 'Subject', 'Teacher', 'Periods/week'],
                                    ...allocations.map((a) => [
                                        classes.find((c) => c.id === a.school_class_id)?.name,
                                        a.stream ?? 'All',
                                        a.subject,
                                        a.teacher ?? 'Unassigned',
                                        a.periods_per_week,
                                    ]),
                                ])
                            }
                        >
                            Export CSV
                        </button>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Add subject to class
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Allocations" value={num(allocations.length)} icon={BookOpen} tone="primary" />
                <StatCard
                    title="Teachers allocated"
                    value={num(workload.filter((w) => w.allocations > 0).length)}
                    icon={UserCheck}
                    tone="success"
                    hint={`${workload.length} teaching staff`}
                />
                <StatCard title="Without teacher" value={num(unassigned)} icon={UserX} tone={unassigned ? 'danger' : 'info'} />
                <StatCard
                    title="Overloaded"
                    value={num(overloaded.length)}
                    icon={AlertTriangle}
                    tone={overloaded.length ? 'warning' : 'info'}
                    hint={
                        <Link href="/admin/settings" className="hover:text-primary">
                            Default limit {workloadSettings.max_teaching_periods}/week · {workloadSettings.workload_enforcement === 'block' ? 'blocking' : 'warning only'}
                        </Link>
                    }
                />
            </div>

            <Tabs
                tabs={[
                    { key: 'class', label: 'By class', icon: LayoutList },
                    { key: 'matrix', label: 'Matrix', icon: Grid3X3 },
                    { key: 'workload', label: 'Teacher workload', icon: Users, count: overloaded.length || undefined },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'class' && (
                <div className="panel">
                    <div className="mb-5 flex flex-wrap gap-2">
                        {classes.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                className={cn('btn btn-sm', classId === c.id ? 'btn-primary' : 'btn-outline-primary')}
                                onClick={() => setClassId(c.id)}
                            >
                                {c.name}
                                <span className="ms-1 rounded-full bg-white/25 px-1.5 text-[10px]">{allocations.filter((a) => a.school_class_id === c.id).length}</span>
                            </button>
                        ))}
                    </div>
                    {forClass.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-4 text-sm text-white-dark">
                            <span>
                                <strong className="text-black dark:text-white-light">{forClass.length}</strong> subjects
                            </span>
                            <span>
                                <strong className="text-black dark:text-white-light">{forClass.reduce((a, r) => a + (r.periods_per_week ?? 0), 0)}</strong> periods per stream each
                                week
                            </span>
                        </div>
                    )}
                    <DataTable
                        columns={columns}
                        rows={forClass}
                        empty="No subjects allocated to this class"
                        emptyDescription="Use “Add subject to class” to offer a subject and assign its teacher."
                    />
                </div>
            )}

            {tab === 'matrix' && (
                <div className="panel">
                    <div className="table-responsive">
                        <table className="table table-compact">
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    {classes.map((c) => (
                                        <th key={c.id} className="text-center!">
                                            {c.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixSubjects.map(([sid, name]) => (
                                    <tr key={sid}>
                                        <td className="font-bold whitespace-nowrap">{name}</td>
                                        {classes.map((c) => {
                                            const cells = allocations.filter((a) => a.subject_id === sid && a.school_class_id === c.id);
                                            return (
                                                <td key={c.id} className="text-center!">
                                                    {cells.length === 0 ? (
                                                        <span className="text-white-dark">—</span>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                            {cells.map((a) => (
                                                                <button
                                                                    key={a.id}
                                                                    type="button"
                                                                    disabled={!manage}
                                                                    onClick={() => openForm(a)}
                                                                    className={cn(
                                                                        'rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap',
                                                                        a.teacher
                                                                            ? isOver(a.employee_id)
                                                                                ? 'bg-warning-light text-warning dark:bg-warning-dark-light'
                                                                                : 'bg-primary-light text-primary dark:bg-primary-dark-light'
                                                                            : 'bg-danger-light text-danger dark:bg-danger-dark-light',
                                                                    )}
                                                                >
                                                                    {a.teacher ?? 'Unassigned'}
                                                                    {a.stream ? ` (${a.stream})` : ''} · {a.periods_per_week}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-4 text-xs text-white-dark">
                        Each cell shows teacher · periods per week. Amber = teacher above their weekly limit; red = no teacher. Click a cell to change the teacher.
                    </p>
                </div>
            )}

            {tab === 'workload' && (
                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white-dark">
                        <span>
                            Load = teaching periods + duties (class teacher: {workloadSettings.class_teacher_periods} per stream or class, each teacher&apos;s own duty periods, and
                            Staff Duties rostered this week). Limit = the teacher&apos;s own limit or the school default of {workloadSettings.max_teaching_periods}.
                        </span>
                        <Link href="/admin/settings" className="btn btn-sm btn-outline-primary">
                            <Settings className="h-3.5 w-3.5" /> Workload settings
                        </Link>
                    </div>
                    {notTimetabled.length > 0 && (
                        <div className="mb-4 flex items-start gap-2 rounded-md bg-info-light px-3 py-2 text-xs text-info dark:bg-info-dark-light">
                            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                            {notTimetabled.length} teacher(s) have a timetable that doesn&apos;t match their allocated teaching periods — see the badges below.
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {workload.map((w) => {
                            const scale = Math.max(w.limit * 1.5, w.periods, 1);
                            const pct = Math.min(100, Math.round((w.periods / scale) * 100));
                            const teachPct = Math.min(100, Math.round((w.teaching / scale) * 100));
                            const over = w.status === 'over';
                            const tone = over ? 'bg-danger' : w.status === 'near' ? 'bg-warning' : w.status === 'free' ? 'bg-dark' : 'bg-success';
                            return (
                                <div
                                    key={w.id}
                                    className={cn(
                                        'rounded-lg border p-4',
                                        over ? 'border-danger/40 bg-danger-light/30 dark:bg-danger-dark-light' : 'border-white-light dark:border-[#1b2e4b]',
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar name={w.name} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 font-bold">
                                                <span className="truncate">{w.name}</span>
                                                {over && <span className="badge badge-soft-danger shrink-0">Overloaded</span>}
                                                {w.status === 'free' && <span className="badge badge-soft-dark shrink-0">Free</span>}
                                            </div>
                                            <div className="truncate text-xs text-white-dark">{w.subjects.length ? w.subjects.join(', ') : (w.designation ?? w.employee_no)}</div>
                                        </div>
                                        <div className="text-end">
                                            <div className={cn('text-xl font-extrabold', over ? 'text-danger' : 'text-black dark:text-white-light')}>
                                                {w.periods}
                                                <span className="text-sm font-semibold text-white-dark"> / {w.limit}</span>
                                            </div>
                                            <div className="text-[10px] font-bold text-white-dark uppercase">{w.custom_limit ? 'own limit' : 'periods'}</div>
                                        </div>
                                    </div>
                                    <div className="relative mt-3 h-2 w-full rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div className={cn('absolute h-2 rounded-full opacity-40', tone)} style={{ width: `${pct}%` }} title="Duties" />
                                        <div className={cn('absolute h-2 rounded-full', tone)} style={{ width: `${teachPct}%` }} title="Teaching" />
                                        <div
                                            className="absolute top-[-3px] h-[14px] w-0.5 bg-danger"
                                            style={{ left: `${Math.round((w.limit / scale) * 100)}%` }}
                                            title={`Limit ${w.limit}`}
                                        />
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white-dark">
                                        <span>
                                            Teaching <b className="text-black dark:text-white-light">{w.teaching}</b>
                                        </span>
                                        {w.duties > 0 && (
                                            <span title={w.duty_note ?? undefined}>
                                                Duties <b className="text-black dark:text-white-light">{w.duties}</b>
                                                {(() => {
                                                    const parts = [
                                                        w.class_teacher_streams > 0 ? `class teacher ×${w.class_teacher_streams}` : null,
                                                        w.duty_periods > 0 ? (w.duty_note ?? 'other duties') : null,
                                                        ...w.roster_duties,
                                                    ].filter(Boolean);
                                                    return parts.length ? ` (${parts.join(', ')})` : '';
                                                })()}
                                            </span>
                                        )}
                                        <span>{w.allocations} allocations</span>
                                        {w.teaching > 0 &&
                                            (w.timetable_gap === 0 ? (
                                                <span className="badge badge-soft-success">Timetable matches</span>
                                            ) : w.timetabled === 0 ? (
                                                <span className="badge badge-soft-warning">Not on the timetable yet</span>
                                            ) : w.timetable_gap > 0 ? (
                                                <span className="badge badge-soft-warning" title={`${w.timetabled} timetabled of ${w.teaching} allocated`}>
                                                    {w.timetable_gap} period(s) not timetabled
                                                </span>
                                            ) : (
                                                <span className="badge badge-soft-danger" title={`${w.timetabled} timetabled, ${w.teaching} allocated`}>
                                                    Timetabled {-w.timetable_gap} more than allocated
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Change allocation · ${editing.subject}` : 'Add subject to class'}>
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid>
                        <Select
                            label="Class"
                            required
                            placeholder="Select class…"
                            options={classOptions}
                            value={form.data.school_class_id}
                            onChange={(e) => form.setData((d) => ({ ...d, school_class_id: e.target.value, stream_id: '' }))}
                            error={form.errors.school_class_id}
                            disabled={!!editing}
                        />
                        <Select
                            label="Stream"
                            placeholder="All streams"
                            options={streams}
                            value={form.data.stream_id}
                            onChange={(e) => form.setData('stream_id', e.target.value)}
                            error={form.errors.stream_id}
                        />
                        <Select
                            label="Subject"
                            required
                            placeholder="Select subject…"
                            options={subjects}
                            value={form.data.subject_id}
                            onChange={(e) => form.setData('subject_id', e.target.value)}
                            error={form.errors.subject_id}
                            disabled={!!editing}
                            wrapperClassName="sm:col-span-2"
                        />
                        <Select
                            label="Teacher"
                            placeholder="— Unassigned —"
                            options={teachers.map((t) => ({
                                value: t.value,
                                label: `${t.label} · ${loadOf(Number(t.value))}/${wl(Number(t.value))?.limit ?? workloadSettings.max_teaching_periods} periods`,
                            }))}
                            value={form.data.employee_id}
                            onChange={(e) => form.setData('employee_id', e.target.value)}
                            error={form.errors.employee_id}
                            wrapperClassName="sm:col-span-2"
                        />
                        <Input
                            label="Periods per week"
                            type="number"
                            min={1}
                            max={20}
                            required
                            value={form.data.periods_per_week}
                            onChange={(e) => form.setData('periods_per_week', e.target.value)}
                            error={form.errors.periods_per_week}
                        />
                    </FormGrid>
                    {!form.data.stream_id && (formClass?.streams_count ?? 0) > 1 && (
                        <div className="rounded-md border border-white-light p-3 text-sm dark:border-[#1b2e4b]">
                            <Checkbox
                                label="Taught jointly — all streams together in one set of lessons"
                                checked={form.data.is_joint}
                                onChange={(e) => form.setData('is_joint', e.target.checked)}
                            />
                            <p className="mt-1 text-xs text-white-dark">
                                {form.data.is_joint
                                    ? `Counted once: ${form.data.periods_per_week || 0} periods on the teacher's load.`
                                    : formClass?.education_level === 'a_level'
                                      ? 'Counted once for each stream whose combination includes this subject.'
                                      : `Counted once per stream: ${Number(form.data.periods_per_week || 0) * (formClass?.streams_count ?? 1)} periods on the teacher's load.`}
                            </p>
                        </div>
                    )}
                    {form.errors.employee_id && <p className="text-sm text-danger">{form.errors.employee_id}</p>}
                    {form.data.employee_id && isOver(Number(form.data.employee_id)) && (
                        <div className="flex items-center gap-2 rounded-md bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> This teacher is already above their weekly limit of {wl(Number(form.data.employee_id))?.limit} periods.
                            {workloadSettings.workload_enforcement === 'block' && ' Adding more will be refused.'}
                        </div>
                    )}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save allocation
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
