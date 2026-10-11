import { Link, router } from '@inertiajs/react';
import { BarChart3, CalendarCheck, CheckCheck, ClipboardList, Clock, Save, ShieldAlert, UserCheck, UserX, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import { Textarea } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { cn, date, dateTime, num } from '@/lib/utils';
import type { Option } from '@/types';
import { STATUS_META, StatusToggle, type AttendanceStatus } from './_components/status-toggle';

type Student = { id: number; admission_no: string; full_name: string; photo_url: string | null; gender: string; stream: string | null; status: AttendanceStatus | null; remarks: string | null };
type Register = { class_id: number; stream_id: number | null; name: string; students: number; marked: number; present: number; absent: number; late: number; excused: number };

type Props = {
    filters: { date: string; class: string; stream: string };
    classes: (Option & { streams: Option[] })[];
    roster: Student[];
    meta: { saved: number; recorded_by: string | null; updated_at: string | null } | null;
    allowed: boolean;
    restricted: boolean;
    today: string;
    isPast: boolean;
    isWeekend: boolean;
    registers: Register[];
    day: { marked: number; present: number; absent: number; late: number; excused: number; rate: number | null; registers_done: number; registers_total: number };
};

export default function AttendanceRegister(props: Props) {
    const { filters: initial, classes, roster, meta, allowed, restricted, today, isPast, isWeekend, registers, day } = props;
    const { filters, setFilter } = useFilters(initial);
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];
    const selected = classes.find((c) => String(c.value) === String(initial.class));
    const streamName = selected?.streams.find((s) => String(s.value) === String(initial.stream))?.label;

    const registerColumns: Column<Register>[] = [
        { key: 'name', header: 'Class', render: (r) => <span className="font-bold">{r.name}</span> },
        { key: 'students', header: 'Students', align: 'right', render: (r) => num(r.students) },
        { key: 'present', header: 'Present', align: 'right', render: (r) => <span className="text-success">{num(r.present)}</span> },
        { key: 'absent', header: 'Absent', align: 'right', render: (r) => <span className="text-danger">{num(r.absent)}</span> },
        { key: 'late', header: 'Late', align: 'right', render: (r) => <span className="text-warning">{num(r.late)}</span> },
        { key: 'excused', header: 'Excused', align: 'right', render: (r) => <span className="text-info">{num(r.excused)}</span> },
        {
            key: 'state',
            header: 'Register',
            render: (r) =>
                r.students === 0 ? (
                    <span className="badge badge-soft-dark">No students</span>
                ) : r.marked >= r.students ? (
                    <span className="badge badge-soft-success">Complete</span>
                ) : r.marked > 0 ? (
                    <span className="badge badge-soft-warning">
                        Partial {r.marked}/{r.students}
                    </span>
                ) : (
                    <span className="badge badge-soft-danger">Not taken</span>
                ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
                <Link href={`/attendance?date=${initial.date}&class=${r.class_id}${r.stream_id ? `&stream=${r.stream_id}` : ''}`} className="btn btn-sm btn-outline-primary">
                    {r.marked > 0 ? 'Open' : 'Take register'}
                </Link>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Daily Attendance Register"
                subtitle="Mark learners present, absent, late or excused for the day."
                breadcrumbs={[{ title: 'Attendance' }, { title: 'Register' }]}
                actions={
                    <>
                        <Link href="/attendance/report" className="btn btn-outline-primary">
                            <BarChart3 className="h-4 w-4" /> Reports
                        </Link>
                        <Link href="/attendance/staff" className="btn btn-outline-secondary">
                            <Users className="h-4 w-4" /> Staff register
                        </Link>
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Registers taken" value={`${day.registers_done} / ${day.registers_total}`} icon={ClipboardList} tone="primary" hint={date(initial.date, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })} />
                <StatCard title="Present" value={num(day.present)} icon={UserCheck} tone="success" hint={day.rate !== null ? `${day.rate}% attendance` : 'No marks yet'} />
                <StatCard title="Absent" value={num(day.absent)} icon={UserX} tone="danger" hint={`${num(day.marked)} learners marked`} />
                <StatCard title="Late / Excused" value={`${num(day.late)} / ${num(day.excused)}`} icon={Clock} tone="warning" />
            </div>

            <div className="panel mb-6">
                <FilterBar>
                    <input
                        type="date"
                        className="form-input w-full sm:w-auto"
                        value={filters.date}
                        max={today}
                        onChange={(e) => setFilter('date', e.target.value || today)}
                        aria-label="Register date"
                    />
                    <FilterSelect
                        value={filters.class}
                        onChange={(v) => {
                            setFilter('class', v);
                            setFilter('stream', '');
                        }}
                        options={classes}
                        placeholder={restricted ? 'My classes' : 'Select class'}
                    />
                    {streams.length > 0 && <FilterSelect value={filters.stream} onChange={(v) => setFilter('stream', v)} options={streams} placeholder="All streams" />}
                    {filters.date !== today && (
                        <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => setFilter('date', today)}>
                            Today
                        </button>
                    )}
                </FilterBar>
                {isWeekend && (
                    <div className="mb-4 rounded-md bg-warning-light px-4 py-2 text-sm font-semibold text-warning dark:bg-warning-dark-light">
                        {date(initial.date, { weekday: 'long' })} is a weekend — make sure this is a school day before taking the register.
                    </div>
                )}
                {restricted && classes.length === 0 && (
                    <EmptyState title="No classes assigned" description="You are not a class teacher or subject teacher of any class yet. Ask the academic office to allocate you." />
                )}

                {!initial.class ? (
                    <>
                        <h5 className="mb-3 text-lg font-bold dark:text-white-light">Register status · {date(initial.date)}</h5>
                        <DataTable columns={registerColumns} rows={registers.map((r, i) => ({ ...r, id: i }))} compact striped empty="No classes configured" />
                    </>
                ) : !allowed ? (
                    <EmptyState
                        title="You can't take this register"
                        description={
                            restricted
                                ? 'Teachers can only take attendance for streams where they are class teacher or teach a subject. If you teach only specific streams, choose your stream.'
                                : 'Select a class and stream to begin.'
                        }
                    />
                ) : (
                    <RosterForm
                        key={`${initial.date}-${initial.class}-${initial.stream}-${meta?.updated_at ?? ''}`}
                        roster={roster}
                        meta={meta}
                        date={initial.date}
                        classId={initial.class}
                        streamId={initial.stream}
                        title={`${selected?.label ?? ''} ${streamName ?? ''}`.trim()}
                        isPast={isPast}
                    />
                )}
            </div>
        </>
    );
}

function RosterForm({ roster, meta, date: day, classId, streamId, title, isPast }: { roster: Student[]; meta: Props['meta']; date: string; classId: string; streamId: string; title: string; isPast: boolean }) {
    const can = useCan();
    const editable = can('attendance.manage');
    const initialMarks = useMemo(() => Object.fromEntries(roster.map((s) => [s.id, { status: s.status, remarks: s.remarks ?? '' }])), [roster]);
    const [marks, setMarks] = useState<Record<number, { status: AttendanceStatus | null; remarks: string }>>(initialMarks);
    const [reason, setReason] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const set = (id: number, patch: Partial<{ status: AttendanceStatus | null; remarks: string }>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
    const counts = useMemo(() => {
        const c = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
        Object.values(marks).forEach((m) => (m.status ? c[m.status]++ : c.unmarked++));
        return c;
    }, [marks]);
    const changedSaved = roster.some((s) => s.status && (marks[s.id]?.status !== s.status || (marks[s.id]?.remarks ?? '') !== (s.remarks ?? '')));
    const needsReason = isPast && changedSaved;

    const markAll = (status: AttendanceStatus) => setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, { ...v, status }])));

    const save = () => {
        const records = roster.filter((s) => marks[s.id]?.status).map((s) => ({ student_id: s.id, status: marks[s.id].status, remarks: marks[s.id].remarks || null }));
        setProcessing(true);
        router.post(
            '/attendance',
            { date: day, school_class_id: classId, stream_id: streamId || null, records, correction_reason: reason || null },
            {
                preserveScroll: true,
                onError: (e) => setErrors(e),
                onSuccess: () => setErrors({}),
                onFinish: () => setProcessing(false),
            },
        );
    };

    if (roster.length === 0) {
        return <EmptyState title="No active students in this class" description="Students appear here once they are enrolled in the class/stream." />;
    }

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h5 className="text-lg font-bold dark:text-white-light">
                        {title} <span className="text-sm font-semibold text-white-dark">· {date(day, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </h5>
                    <p className="text-xs text-white-dark">
                        {meta && meta.saved > 0 ? (
                            <>
                                <CalendarCheck className="me-1 inline h-3.5 w-3.5 text-success" />
                                Saved for {meta.saved} of {roster.length} learners{meta.recorded_by && <> by {meta.recorded_by}</>} · {dateTime(meta.updated_at)}
                            </>
                        ) : (
                            'Not yet saved for this date.'
                        )}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                    {(['present', 'absent', 'late', 'excused'] as const).map((k) => (
                        <span key={k} className={cn('badge', `badge-soft-${STATUS_META[k].tone}`)}>
                            {STATUS_META[k].label}: {counts[k]}
                        </span>
                    ))}
                    {counts.unmarked > 0 && <span className="badge badge-soft-dark">Unmarked: {counts.unmarked}</span>}
                </div>
            </div>

            {editable && (
                <div className="mb-4 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-sm btn-success" onClick={() => markAll('present')}>
                        <CheckCheck className="h-4 w-4" /> Mark all present
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => setMarks(Object.fromEntries(roster.map((s) => [s.id, { status: null, remarks: '' }])))}>
                        Clear
                    </button>
                </div>
            )}

            <div className="divide-y divide-white-light rounded-md border border-white-light dark:divide-[#1b2e4b] dark:border-[#1b2e4b]">
                {roster.map((s, i) => (
                    <div key={s.id} className={cn('flex flex-col gap-3 p-3 md:flex-row md:items-center', !marks[s.id]?.status && 'bg-white-light/20 dark:bg-[#1b2e4b]/20')}>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="w-6 text-end text-xs text-white-dark">{i + 1}</span>
                            <Avatar name={s.full_name} src={s.photo_url} />
                            <div className="min-w-0">
                                <Link href={`/students/${s.id}`} className="block truncate font-bold text-black hover:text-primary dark:text-white-light">
                                    {s.full_name}
                                </Link>
                                <div className="text-xs text-white-dark">
                                    {s.admission_no}
                                    {s.stream && ` · Stream ${s.stream}`}
                                </div>
                            </div>
                        </div>
                        <StatusToggle value={marks[s.id]?.status ?? null} onChange={(v) => set(s.id, { status: v })} disabled={!editable} />
                        <input
                            className="form-input md:w-56"
                            placeholder="Remarks (optional)"
                            value={marks[s.id]?.remarks ?? ''}
                            disabled={!editable}
                            maxLength={255}
                            onChange={(e) => set(s.id, { remarks: e.target.value })}
                        />
                    </div>
                ))}
            </div>

            {errors.records && <p className="form-error mt-2">{errors.records}</p>}

            {editable && (
                <div className="sticky bottom-0 z-10 mt-4 -mx-5 border-t border-white-light bg-white px-5 py-4 dark:border-[#1b2e4b] dark:bg-[#0e1726]">
                    {needsReason && (
                        <div className="mb-3">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-warning">
                                <ShieldAlert className="h-4 w-4" /> You are changing a saved register for a past date. A correction reason is required and will be audited.
                            </div>
                            <Textarea rows={2} placeholder="Reason for correction…" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.correction_reason} />
                        </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-white-dark">
                            {counts.unmarked > 0 ? `${counts.unmarked} learner(s) not marked yet — they will be skipped.` : 'All learners marked.'}
                        </span>
                        <button type="button" className="btn btn-primary" disabled={processing || counts.unmarked === roster.length || (needsReason && !reason.trim())} onClick={save}>
                            <Save className="h-4 w-4" /> {processing ? 'Saving…' : meta && meta.saved > 0 ? 'Update register' : 'Save register'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
