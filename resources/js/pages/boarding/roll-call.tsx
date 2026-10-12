import { router } from '@inertiajs/react';
import { CheckCheck, ClipboardCheck, Moon, Save, Sun, Sunset, UserCheck, UserMinus, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { cn, date, num, titleCase, today } from '@/lib/utils';
import type { Option } from '@/types';
import { DateInput } from '@/components/ui/date-picker';
import SearchSelect from '@/components/ui/search-select';

type Mark = 'present' | 'absent' | 'on_leave';
type RosterRow = {
    id: number;
    student_id: number;
    full_name: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    room: string | null;
    bed_no: string | null;
    has_leave_pass: boolean;
    recorded: boolean;
    status: Mark;
};
type HistoryRow = { id: string; dormitory_id: number; dormitory: string; date: string; session: string; present: number; absent: number; on_leave: number; total: number };
type Props = {
    dormitories: Option[];
    selection: { dormitory: number | string; date: string; session: string };
    roster: RosterRow[];
    alreadyTaken: boolean;
    history: HistoryRow[];
};

const sessions = [
    { value: 'morning', label: 'Morning', icon: Sun },
    { value: 'evening', label: 'Evening', icon: Sunset },
    { value: 'night', label: 'Night', icon: Moon },
];

const markStyles: Record<Mark, string> = {
    present: 'btn-success',
    absent: 'btn-danger',
    on_leave: 'btn-warning',
};

export default function RollCall({ dormitories, selection, roster, alreadyTaken, history }: Props) {
    const can = useCan();
    const manage = can('boarding.manage');
    const [marks, setMarks] = useState<Record<number, Mark>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMarks(Object.fromEntries(roster.map((r) => [r.student_id, r.status])));
    }, [roster]);

    const select = (key: 'dormitory' | 'date' | 'session', value: string) =>
        router.get('/boarding/roll-call', { ...selection, [key]: value }, { preserveState: true, preserveScroll: true, replace: true });

    const counts = useMemo(() => {
        const values = Object.values(marks);
        return { present: values.filter((v) => v === 'present').length, absent: values.filter((v) => v === 'absent').length, on_leave: values.filter((v) => v === 'on_leave').length };
    }, [marks]);

    const save = () => {
        setSaving(true);
        router.post(
            '/boarding/roll-call',
            { dormitory_id: selection.dormitory, date: selection.date, session: selection.session, marks: Object.entries(marks).map(([student_id, status]) => ({ student_id: Number(student_id), status })) },
            { preserveScroll: true, onFinish: () => setSaving(false) },
        );
    };

    const columns: Column<RosterRow>[] = [
        { key: 'n', header: '#', render: (_r, i) => <span className="text-white-dark">{i + 1}</span> },
        {
            key: 'student',
            header: 'Student',
            render: (r) => (
                <div className="flex items-center gap-3">
                    <Avatar name={r.full_name} src={r.photo_url} />
                    <div>
                        <div className="font-semibold text-black dark:text-white-light">{r.full_name}</div>
                        <div className="text-xs text-white-dark">
                            {r.admission_no} · {r.class}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'room',
            header: 'Room / Bed',
            render: (r) => (
                <span>
                    {r.room ?? '—'}
                    {r.bed_no ? ` · ${r.bed_no}` : ''}
                    {r.has_leave_pass && <span className="badge badge-soft-warning ms-2">Leave pass</span>}
                </span>
            ),
        },
        {
            key: 'mark',
            header: 'Mark',
            align: 'right',
            render: (r) => (
                <div className="inline-flex gap-1">
                    {(['present', 'absent', 'on_leave'] as Mark[]).map((m) => (
                        <button
                            key={m}
                            type="button"
                            disabled={!manage}
                            onClick={() => setMarks((s) => ({ ...s, [r.student_id]: m }))}
                            className={cn('btn btn-sm px-2.5', marks[r.student_id] === m ? markStyles[m] : 'btn-outline-dark opacity-60')}
                        >
                            {m === 'present' ? 'P' : m === 'absent' ? 'A' : 'L'}
                            <span className="hidden sm:inline">&nbsp;{m === 'on_leave' ? 'Leave' : titleCase(m)}</span>
                        </button>
                    ))}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Dormitory Roll Call" subtitle="Morning, evening and night checks per dormitory." breadcrumbs={[{ title: 'Boarding', href: '/boarding/dormitories' }, { title: 'Roll call' }]} />

            <div className="panel mb-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                        <label>Dormitory</label>
                        <SearchSelect className="form-select" value={selection.dormitory} onChange={(e) => select('dormitory', e.target.value)}>
                            {dormitories.map((d) => (
                                <option key={d.value} value={d.value}>
                                    {d.label}
                                </option>
                            ))}
                        </SearchSelect>
                    </div>
                    <div>
                        <label>Date</label>
                        <DateInput className="form-input" max={today()} value={selection.date} onChange={(e) => e.target.value && select('date', e.target.value)} />
                    </div>
                    <div>
                        <label>Session</label>
                        <div className="flex gap-2">
                            {sessions.map((s) => (
                                <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => select('session', s.value)}
                                    className={cn('btn flex-1 gap-1 px-2', selection.session === s.value ? 'btn-primary' : 'btn-outline-primary')}
                                >
                                    <s.icon className="h-4 w-4" /> {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="On roster" value={num(roster.length)} icon={ClipboardCheck} tone="primary" hint={alreadyTaken ? 'Already recorded — editing' : 'Not yet recorded'} />
                <StatCard title="Present" value={num(counts.present)} icon={UserCheck} tone="success" />
                <StatCard title="Absent" value={num(counts.absent)} icon={UserX} tone="danger" />
                <StatCard title="On leave" value={num(counts.on_leave)} icon={UserMinus} tone="warning" />
            </div>

            <div className="panel mb-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h5 className="text-lg font-semibold dark:text-white-light">
                        {dormitories.find((d) => String(d.value) === String(selection.dormitory))?.label ?? 'Roster'} · {titleCase(selection.session)} · {date(selection.date)}
                    </h5>
                    {manage && roster.length > 0 && (
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setMarks(Object.fromEntries(roster.map((r) => [r.student_id, r.has_leave_pass ? 'on_leave' : 'present'])))}>
                                <CheckCheck className="h-4 w-4" /> Mark all present
                            </button>
                            <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={save}>
                                <Save className="h-4 w-4" /> {alreadyTaken ? 'Update roll call' : 'Save roll call'}
                            </button>
                        </div>
                    )}
                </div>
                {roster.length === 0 ? (
                    <EmptyState title="No students allocated" description="Allocate boarders to rooms in this dormitory to build its roster." />
                ) : (
                    <DataTable columns={columns} rows={roster} compact />
                )}
            </div>

            <div className="panel">
                <h5 className="mb-4 text-lg font-semibold dark:text-white-light">Recent roll calls</h5>
                <DataTable
                    rows={history}
                    compact
                    striped
                    empty="No roll calls recorded yet"
                    onRowClick={(h) => router.get('/boarding/roll-call', { dormitory: h.dormitory_id, date: h.date, session: h.session }, { preserveScroll: true })}
                    columns={[
                        { key: 'date', header: 'Date', render: (h) => date(h.date) },
                        { key: 'session', header: 'Session', render: (h) => titleCase(h.session) },
                        { key: 'dormitory', header: 'Dormitory' },
                        { key: 'present', header: 'Present', align: 'right', render: (h) => <span className="text-success">{h.present}</span> },
                        { key: 'absent', header: 'Absent', align: 'right', render: (h) => <span className={h.absent ? 'font-bold text-danger' : ''}>{h.absent}</span> },
                        { key: 'on_leave', header: 'On leave', align: 'right', render: (h) => <span className="text-warning">{h.on_leave}</span> },
                        { key: 'rate', header: 'Attendance', align: 'right', render: (h) => `${h.total ? Math.round(((h.present + h.on_leave) / h.total) * 100) : 0}%` },
                    ]}
                />
            </div>
        </>
    );
}
