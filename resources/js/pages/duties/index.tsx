import { router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    CalendarDays,
    CalendarRange,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    ClipboardList,
    ListChecks,
    MapPin,
    Pencil,
    Plus,
    Repeat,
    Search,
    Settings2,
    Trash2,
    UserX,
    Users,
    X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ymd } from '@/components/ui/date-picker';
import EmptyState from '@/components/ui/empty-state';
import { FormGrid, Input, Select, Switch, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Tabs from '@/components/ui/tabs';
import { confirm } from '@/lib/swal';
import { cn, date, num, weekdayDate } from '@/lib/utils';
import type { Option } from '@/types';
import { daysLabel, dutyStatusTone, WEEKDAYS } from './_components/person-duties';

type Audience = 'staff' | 'student';
type DutyType = {
    id: number;
    name: string;
    code: string | null;
    description: string | null;
    location: string | null;
    start_time: string | null;
    end_time: string | null;
    days: number[];
    time: string | null;
    rotation: 'daily' | 'weekly' | 'term' | 'custom';
    people_needed: number;
    workload_periods: number;
    is_active: boolean;
    current_count: number;
};
type CellPerson = { id: number; name: string | null; role: string | null };
type WeekRow = { id: number; name: string; code: string | null; time: string | null; location: string | null; needed: number; cells: (CellPerson[] | null)[] };
type DayDuty = {
    id: number;
    name: string;
    time: string | null;
    location: string | null;
    needed: number;
    people: { assignment_id: number; name: string | null; sub: string | null; role: string | null; status: string | null; remarks: string | null }[];
};
type Assignment = {
    id: number;
    duty_type_id: number;
    duty: string | null;
    person_id: number;
    person: string | null;
    person_no: string | null;
    start_date: string;
    end_date: string;
    role: string | null;
    notes: string | null;
    status: 'current' | 'upcoming' | 'ended';
    done: number;
    missed: number;
};
type Person = {
    id: number;
    name: string;
    sub: string;
    gender: string | null;
    category?: string;
    class_id?: number | null;
    stream_id?: number | null;
    dormitory_id?: number | null;
};
type ClassOption = Option & { streams?: Option[] };

type Props = {
    audience: Audience;
    basePath: string;
    canManage: boolean;
    types: DutyType[];
    week: { start: string; end: string; days: string[]; rows: WeekRow[]; shortfalls: number };
    day: { date: string; duties: DayDuty[] };
    assignments: Assignment[];
    scope: string;
    people: Person[];
    filters: { classes?: ClassOption[]; dormitories?: Option[]; categories?: Option[] };
    term: { name: string; start: string | null; end: string | null } | null;
    stats: { types: number; on_duty_today: number; shortfalls: number; missed_30: number };
};

const ROTATIONS: Option[] = [
    { value: 'daily', label: 'Daily — one day at a time' },
    { value: 'weekly', label: 'Weekly — Monday to Sunday' },
    { value: 'term', label: 'Termly — whole term' },
    { value: 'custom', label: 'Custom dates' },
];
const LOG_STATUS: { key: string; label: string; tone: string; icon: typeof Check }[] = [
    { key: 'done', label: 'Done', tone: 'btn-success', icon: Check },
    { key: 'missed', label: 'Missed', tone: 'btn-danger', icon: X },
    { key: 'excused', label: 'Excused', tone: 'btn-warning', icon: UserX },
];

function addDays(value: string, n: number): string {
    const d = new Date(`${value}T00:00:00`);
    d.setDate(d.getDate() + n);
    return ymd(d);
}

/** End date for a roster period starting on `start`, following the duty's rotation. */
function periodEnd(rotation: string, start: string, termEnd: string | null | undefined): string {
    if (!start) return '';
    if (rotation === 'weekly') {
        const dow = (new Date(`${start}T00:00:00`).getDay() + 6) % 7; // 0 = Monday
        return addDays(start, 6 - dow);
    }
    if (rotation === 'term' && termEnd && termEnd >= start) return termEnd;
    return start;
}

const todayYmd = () => ymd(new Date());

export default function DutyRoster({ audience, basePath, canManage, types, week, day, assignments, scope, people, filters, term, stats }: Props) {
    const isStaff = audience === 'staff';
    const noun = isStaff ? 'staff member' : 'student';
    const [tab, setTab] = useState('week');
    const [typeModal, setTypeModal] = useState<DutyType | 'new' | null>(null);
    const [assignPrefill, setAssignPrefill] = useState<{ typeId: string; start: string } | null>(null);
    const [rotaOpen, setRotaOpen] = useState(false);
    const [editing, setEditing] = useState<Assignment | null>(null);
    const [typeFilter, setTypeFilter] = useState('');
    const [search, setSearch] = useState('');

    const activeTypes = types.filter((t) => t.is_active);
    const typeOptions: Option[] = activeTypes.map((t) => ({ value: t.id, label: t.name }));

    const visit = (params: Record<string, string>) =>
        router.get(basePath, { week: week.start, date: day.date, scope, ...params }, { preserveState: true, preserveScroll: true, replace: true });

    const remove = async (url: string, title: string) => {
        const { confirmed } = await confirm({ title, text: 'This cannot be undone.', confirmText: 'Remove', danger: true });
        if (confirmed) router.delete(url, { preserveScroll: true });
    };

    const logDuty = (assignmentId: number, status: string, remarks: string | null) =>
        router.post(`${basePath}/log`, { assignment_id: assignmentId, date: day.date, status, remarks }, { preserveScroll: true, preserveState: true });

    const shownAssignments = assignments.filter(
        (a) => (!typeFilter || String(a.duty_type_id) === typeFilter) && (!search || `${a.person} ${a.person_no} ${a.duty} ${a.role}`.toLowerCase().includes(search.toLowerCase())),
    );

    const tabs = [
        { key: 'week', label: 'Weekly roster', icon: CalendarRange },
        { key: 'day', label: 'Daily check', icon: ClipboardCheck },
        { key: 'assignments', label: 'Assignments', icon: ListChecks, count: assignments.length },
        { key: 'types', label: 'Duty types', icon: Settings2, count: types.length },
    ];

    return (
        <>
            <PageHeader
                title={isStaff ? 'Staff Duties' : 'Student Duties'}
                subtitle={
                    isStaff
                        ? 'Duties apart from teaching — Teacher on Duty, Prep, Games and any other duty your school defines.'
                        : 'After-class duties for students — dining hall, cleaning, compound, flag and any other duty your school defines.'
                }
                breadcrumbs={[{ title: isStaff ? 'HR' : 'Students' }, { title: isStaff ? 'Staff Duties' : 'Student Duties' }]}
                actions={
                    canManage && (
                        <>
                            <button className="btn btn-outline-primary" onClick={() => setTypeModal('new')}>
                                <Settings2 className="h-4 w-4" /> New duty type
                            </button>
                            <button className="btn btn-outline-secondary" disabled={activeTypes.length === 0} onClick={() => setRotaOpen(true)}>
                                <Repeat className="h-4 w-4" /> Generate rota
                            </button>
                            <button className="btn btn-primary" disabled={activeTypes.length === 0} onClick={() => setAssignPrefill({ typeId: '', start: todayYmd() })}>
                                <Plus className="h-4 w-4" /> Assign duty
                            </button>
                        </>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Duty types" value={num(stats.types)} icon={ClipboardList} tone="primary" hint="Active duties" />
                <StatCard title="On duty today" value={num(stats.on_duty_today)} icon={Users} tone="success" hint={isStaff ? 'Staff members' : 'Students'} />
                <StatCard
                    title="Unfilled this week"
                    value={num(stats.shortfalls)}
                    icon={AlertTriangle}
                    tone={stats.shortfalls ? 'warning' : 'info'}
                    hint={stats.shortfalls ? 'Duty-days short of people' : 'Every duty is covered'}
                />
                <StatCard title="Missed (30 days)" value={num(stats.missed_30)} icon={UserX} tone={stats.missed_30 ? 'danger' : 'secondary'} hint="Recorded on the daily check" />
            </div>

            <Tabs tabs={tabs} active={tab} onChange={setTab} />

            {types.length === 0 && (
                <div className="panel mb-6">
                    <EmptyState
                        title="No duty types yet"
                        description={
                            isStaff
                                ? 'Start by creating the duties your school runs, e.g. Teacher on Duty (weekly, 2 teachers) or Prep Supervision (Mon–Fri evenings).'
                                : 'Start by creating the duties students do, e.g. Dining hall (daily, 6 students) or Compound cleaning (weekly).'
                        }
                        action={
                            canManage && (
                                <button className="btn btn-primary" onClick={() => setTypeModal('new')}>
                                    <Plus className="h-4 w-4" /> New duty type
                                </button>
                            )
                        }
                    />
                </div>
            )}

            {tab === 'week' && types.length > 0 && (
                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button className="btn btn-sm btn-outline-dark px-2" title="Previous week" onClick={() => visit({ week: addDays(week.start, -7) })}>
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="font-bold">
                                {date(week.start)} – {date(week.end)}
                            </span>
                            <button className="btn btn-sm btn-outline-dark px-2" title="Next week" onClick={() => visit({ week: addDays(week.start, 7) })}>
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            <button className="btn btn-sm btn-outline-primary" onClick={() => visit({ week: todayYmd() })}>
                                This week
                            </button>
                        </div>
                        {week.shortfalls > 0 && (
                            <span className="badge badge-soft-warning">
                                {week.shortfalls} duty-day{week.shortfalls === 1 ? '' : 's'} short of people
                            </span>
                        )}
                    </div>
                    <div className="table-responsive">
                        <table className="table-bordered table">
                            <thead>
                                <tr>
                                    <th className="min-w-44">Duty</th>
                                    {week.days.map((d) => (
                                        <th key={d} className={cn('min-w-32 text-center!', d === todayYmd() && 'bg-primary-light! text-primary dark:bg-primary-dark-light!')}>
                                            {WEEKDAYS[(new Date(`${d}T00:00:00`).getDay() + 6) % 7]}
                                            <div className="text-[11px] font-normal text-white-dark">{date(d).slice(0, 5)}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {week.rows.map((r) => (
                                    <tr key={r.id}>
                                        <td>
                                            <div className="font-bold">{r.name}</div>
                                            <div className="text-xs text-white-dark">{[r.time, r.location, `${r.needed} needed`].filter(Boolean).join(' · ')}</div>
                                        </td>
                                        {r.cells.map((cell, i) => {
                                            const d = week.days[i];
                                            if (cell === null) {
                                                return (
                                                    <td key={d} className="bg-gray-50 text-center! text-xs text-white-dark dark:bg-[#0e1726]">
                                                        —
                                                    </td>
                                                );
                                            }
                                            const short = cell.length < r.needed;
                                            return (
                                                <td key={d} className={cn('align-top', short && 'bg-warning-light/40 dark:bg-warning-dark-light/20')}>
                                                    <div className="flex flex-col gap-1">
                                                        {cell.map((p) => (
                                                            <span
                                                                key={p.id}
                                                                className="rounded bg-primary-light px-1.5 py-0.5 text-xs font-semibold text-primary dark:bg-primary-dark-light"
                                                                title={p.role ?? undefined}
                                                            >
                                                                {p.name}
                                                            </span>
                                                        ))}
                                                        {short && (
                                                            <button
                                                                type="button"
                                                                disabled={!canManage}
                                                                onClick={() => setAssignPrefill({ typeId: String(r.id), start: d })}
                                                                className="rounded border border-dashed border-warning px-1.5 py-0.5 text-xs font-semibold text-warning enabled:hover:bg-warning-light"
                                                            >
                                                                {cell.length}/{r.needed}
                                                                {canManage && ' · assign'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-xs text-white-dark">“—” means the duty does not run that day. Amber cells have fewer people than the duty needs.</p>
                </div>
            )}

            {tab === 'day' && types.length > 0 && (
                <div className="panel">
                    <div className="mb-5 flex flex-wrap items-center gap-2">
                        <button className="btn btn-sm btn-outline-dark px-2" title="Previous day" onClick={() => visit({ date: addDays(day.date, -1) })}>
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="font-bold">{weekdayDate(day.date)}</span>
                        <button
                            className="btn btn-sm btn-outline-dark px-2"
                            title="Next day"
                            disabled={day.date >= todayYmd()}
                            onClick={() => visit({ date: addDays(day.date, 1) })}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        {day.date !== todayYmd() && (
                            <button className="btn btn-sm btn-outline-primary" onClick={() => visit({ date: todayYmd() })}>
                                Today
                            </button>
                        )}
                    </div>
                    {day.duties.length === 0 ? (
                        <EmptyState title="No duty runs on this day" />
                    ) : (
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            {day.duties.map((d) => (
                                <div key={d.id} className="rounded-lg border border-white-light p-4 dark:border-[#1b2e4b]">
                                    <div className="mb-3 flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-bold">{d.name}</div>
                                            <div className="flex flex-wrap gap-x-2 text-xs text-white-dark">
                                                {d.time && <span>{d.time}</span>}
                                                {d.location && (
                                                    <span className="inline-flex items-center gap-0.5">
                                                        <MapPin className="h-3 w-3" /> {d.location}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className={cn('badge', d.people.length < d.needed ? 'badge-soft-warning' : 'badge-soft-success')}>
                                            {d.people.length}/{d.needed} rostered
                                        </span>
                                    </div>
                                    {d.people.length === 0 ? (
                                        <p className="text-sm text-warning">Nobody rostered.</p>
                                    ) : (
                                        <ul className="space-y-3">
                                            {d.people.map((p) => (
                                                <DayRow key={p.assignment_id} person={p} canManage={canManage} onLog={logDuty} />
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'assignments' && (
                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-64">
                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white-dark" />
                            <input className="form-input ps-9" placeholder={`Search ${noun} or duty…`} value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <select className="form-select w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                            <option value="">All duties</option>
                            {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        <select className="form-select w-auto" value={scope} onChange={(e) => visit({ scope: e.target.value })}>
                            <option value="active">Current & upcoming</option>
                            <option value="current">On duty now</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="ended">Ended</option>
                            <option value="all">All</option>
                        </select>
                        <span className="ms-auto text-sm text-white-dark">{num(shownAssignments.length)} shown</span>
                    </div>
                    {shownAssignments.length === 0 ? (
                        <EmptyState title="No assignments" description="Use “Assign duty” or “Generate rota” to build the roster." />
                    ) : (
                        <div className="table-responsive">
                            <table className="table-hover table">
                                <thead>
                                    <tr>
                                        <th>{isStaff ? 'Staff member' : 'Student'}</th>
                                        <th>Duty</th>
                                        <th>Period</th>
                                        <th className="text-center!">Done</th>
                                        <th className="text-center!">Missed</th>
                                        <th>Status</th>
                                        {canManage && <th />}
                                    </tr>
                                </thead>
                                <tbody>
                                    {shownAssignments.map((a) => (
                                        <tr key={a.id}>
                                            <td>
                                                <div className="font-semibold">{a.person}</div>
                                                <div className="text-xs text-white-dark">{a.person_no}</div>
                                            </td>
                                            <td>
                                                <div className="font-semibold">{a.duty}</div>
                                                {(a.role || a.notes) && <div className="text-xs text-white-dark">{[a.role, a.notes].filter(Boolean).join(' · ')}</div>}
                                            </td>
                                            <td className="whitespace-nowrap">
                                                {date(a.start_date)} → {date(a.end_date)}
                                            </td>
                                            <td className="text-center! font-semibold text-success">{a.done || '—'}</td>
                                            <td className={cn('text-center! font-semibold', a.missed > 0 && 'text-danger')}>{a.missed || '—'}</td>
                                            <td>
                                                <span className={`badge ${dutyStatusTone[a.status]}`}>
                                                    {a.status === 'current' ? 'On duty' : a.status === 'upcoming' ? 'Upcoming' : 'Ended'}
                                                </span>
                                            </td>
                                            {canManage && (
                                                <td className="text-end whitespace-nowrap">
                                                    <button className="me-3 text-primary hover:opacity-70" title="Edit" onClick={() => setEditing(a)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        className="text-danger hover:opacity-70"
                                                        title="Remove"
                                                        onClick={() =>
                                                            remove(`${basePath}/assignments/${a.id}`, `Remove ${a.person ?? 'this person'} from ${a.duty ?? 'this duty'}?`)
                                                        }
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {tab === 'types' && types.length > 0 && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {types.map((t) => (
                        <div key={t.id} className={cn('panel', !t.is_active && 'opacity-60')}>
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h5 className="text-lg font-bold">{t.name}</h5>
                                        {t.code && <span className="badge badge-soft-dark">{t.code}</span>}
                                        {!t.is_active && <span className="badge badge-soft-danger">Inactive</span>}
                                    </div>
                                    {t.description && <p className="text-sm text-white-dark">{t.description}</p>}
                                </div>
                                {canManage && (
                                    <div className="flex shrink-0 gap-2">
                                        <button className="text-primary hover:opacity-70" title="Edit" onClick={() => setTypeModal(t)}>
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button className="text-danger hover:opacity-70" title="Delete" onClick={() => remove(`${basePath}/types/${t.id}`, `Delete ${t.name}?`)}>
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div>
                                    <dt className="text-xs font-bold text-white-dark uppercase">Runs</dt>
                                    <dd className="font-semibold">{daysLabel(t.days)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold text-white-dark uppercase">Time</dt>
                                    <dd className="font-semibold">{t.time ?? '—'}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold text-white-dark uppercase">People needed</dt>
                                    <dd className="font-semibold">{t.people_needed}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-bold text-white-dark uppercase">Rotation</dt>
                                    <dd className="font-semibold capitalize">{t.rotation}</dd>
                                </div>
                                {t.location && (
                                    <div>
                                        <dt className="text-xs font-bold text-white-dark uppercase">Location</dt>
                                        <dd className="font-semibold">{t.location}</dd>
                                    </div>
                                )}
                                {isStaff && (
                                    <div>
                                        <dt className="text-xs font-bold text-white-dark uppercase">Workload</dt>
                                        <dd className="font-semibold">{t.workload_periods ? `+${t.workload_periods} periods/week` : 'Not counted'}</dd>
                                    </div>
                                )}
                            </dl>
                            <div className="mt-3 flex items-center justify-between border-t border-white-light pt-3 text-sm dark:border-[#1b2e4b]">
                                <span className="text-white-dark">
                                    On duty now: <b className="text-black dark:text-white-light">{t.current_count}</b>
                                </span>
                                {canManage && t.is_active && (
                                    <button className="font-bold text-primary hover:underline" onClick={() => setAssignPrefill({ typeId: String(t.id), start: todayYmd() })}>
                                        Assign
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <TypeModal
                key={typeModal === null ? 'type-closed' : typeModal === 'new' ? 'type-new' : `type-${typeModal.id}`}
                type={typeModal}
                isStaff={isStaff}
                basePath={basePath}
                onClose={() => setTypeModal(null)}
            />
            <AssignModal
                key={assignPrefill ? `${assignPrefill.typeId}-${assignPrefill.start}` : 'assign-closed'}
                prefill={assignPrefill}
                types={activeTypes}
                typeOptions={typeOptions}
                people={people}
                filters={filters}
                audience={audience}
                basePath={basePath}
                termEnd={term?.end}
                onClose={() => setAssignPrefill(null)}
            />
            <RotaModal
                key={rotaOpen ? 'rota-open' : 'rota-closed'}
                open={rotaOpen}
                types={activeTypes}
                typeOptions={typeOptions}
                people={people}
                filters={filters}
                audience={audience}
                basePath={basePath}
                onClose={() => setRotaOpen(false)}
            />
            <EditAssignmentModal key={editing ? `edit-${editing.id}` : 'edit-none'} assignment={editing} people={people} noun={noun} basePath={basePath} onClose={() => setEditing(null)} />
        </>
    );
}

function DayRow({
    person,
    canManage,
    onLog,
}: {
    person: DayDuty['people'][number];
    canManage: boolean;
    onLog: (assignmentId: number, status: string, remarks: string | null) => void;
}) {
    const [remarks, setRemarks] = useState(person.remarks ?? '');

    return (
        <li className="rounded-md bg-gray-50 p-3 dark:bg-[#0e1726]">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="font-semibold">
                        {person.name}
                        {person.role && <span className="text-xs font-normal text-white-dark"> · {person.role}</span>}
                    </div>
                    {person.sub && <div className="text-xs text-white-dark">{person.sub}</div>}
                </div>
                <div className="flex gap-1">
                    {LOG_STATUS.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            disabled={!canManage}
                            onClick={() => onLog(person.assignment_id, s.key, remarks || null)}
                            className={cn('btn btn-sm px-2 py-1', person.status === s.key ? s.tone : `${s.tone.replace('btn-', 'btn-outline-')}`)}
                            title={s.label}
                        >
                            <s.icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>
            {canManage && (
                <input
                    className="form-input mt-2 py-1 text-xs"
                    placeholder={person.status ? 'Remarks (saved when you leave the field)' : 'Remarks — choose Done / Missed / Excused first'}
                    value={remarks}
                    disabled={!person.status}
                    onChange={(e) => setRemarks(e.target.value)}
                    onBlur={() => {
                        if (person.status && remarks !== (person.remarks ?? '')) onLog(person.assignment_id, person.status, remarks || null);
                    }}
                />
            )}
            {!canManage && person.remarks && <p className="mt-1 text-xs text-white-dark">{person.remarks}</p>}
        </li>
    );
}

function TypeModal({ type, isStaff, basePath, onClose }: { type: DutyType | 'new' | null; isStaff: boolean; basePath: string; onClose: () => void }) {
    const existing = type && type !== 'new' ? type : null;
    const form = useForm({
        name: existing?.name ?? '',
        code: existing?.code ?? '',
        description: existing?.description ?? '',
        location: existing?.location ?? '',
        start_time: existing?.start_time ?? '',
        end_time: existing?.end_time ?? '',
        days: existing ? (existing.days.length ? existing.days : [1, 2, 3, 4, 5, 6, 7]) : [1, 2, 3, 4, 5],
        rotation: existing?.rotation ?? 'weekly',
        people_needed: String(existing?.people_needed ?? 1),
        workload_periods: String(existing?.workload_periods ?? 0),
        is_active: existing?.is_active ?? true,
    });

    const toggleDay = (d: number) => form.setData('days', form.data.days.includes(d) ? form.data.days.filter((x) => x !== d) : [...form.data.days, d].sort((a, b) => a - b));

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: onClose };
        if (existing) form.put(`${basePath}/types/${existing.id}`, opts);
        else form.post(`${basePath}/types`, opts);
    };

    return (
        <Modal open={type !== null} onClose={onClose} title={existing ? `Edit ${existing.name}` : 'New duty type'} size="lg">
            <form onSubmit={submit} className="space-y-4">
                <FormGrid>
                    <Input
                        label="Duty name"
                        required
                        value={form.data.name}
                        onChange={(e) => form.setData('name', e.target.value)}
                        error={form.errors.name}
                        placeholder={isStaff ? 'e.g. Teacher on Duty' : 'e.g. Dining hall duty'}
                    />
                    <Input
                        label="Short code"
                        value={form.data.code}
                        onChange={(e) => form.setData('code', e.target.value)}
                        error={form.errors.code}
                        placeholder={isStaff ? 'TOD' : 'DH'}
                    />
                    <Input
                        label="Location"
                        value={form.data.location}
                        onChange={(e) => form.setData('location', e.target.value)}
                        error={form.errors.location}
                        placeholder="e.g. Main gate, Dining hall"
                    />
                    <Select
                        label="Rotation"
                        required
                        options={ROTATIONS}
                        value={form.data.rotation}
                        onChange={(e) => form.setData('rotation', e.target.value as DutyType['rotation'])}
                        error={form.errors.rotation}
                        help="How long one person usually stays on it."
                    />
                    <Field2 label="Starts at" error={form.errors.start_time}>
                        <input type="time" className="form-input" value={form.data.start_time} onChange={(e) => form.setData('start_time', e.target.value)} />
                    </Field2>
                    <Field2 label="Ends at" error={form.errors.end_time}>
                        <input type="time" className="form-input" value={form.data.end_time} onChange={(e) => form.setData('end_time', e.target.value)} />
                    </Field2>
                    <Input
                        label="People needed each day"
                        type="number"
                        min={1}
                        required
                        value={form.data.people_needed}
                        onChange={(e) => form.setData('people_needed', e.target.value)}
                        error={form.errors.people_needed}
                        help="More than one is fine, e.g. 2 teachers on TOD."
                    />
                    {isStaff && (
                        <Input
                            label="Adds to teaching workload"
                            type="number"
                            min={0}
                            value={form.data.workload_periods}
                            onChange={(e) => form.setData('workload_periods', e.target.value)}
                            error={form.errors.workload_periods}
                            help="Periods/week counted on Teacher Allocation while on this duty (0 = not counted)."
                        />
                    )}
                </FormGrid>
                <div>
                    <label>Runs on</label>
                    <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map((label, i) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => toggleDay(i + 1)}
                                className={cn('btn btn-sm min-w-14', form.data.days.includes(i + 1) ? 'btn-primary' : 'btn-outline-dark')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {form.errors.days && <p className="mt-1 text-xs text-danger">{form.errors.days}</p>}
                    {form.data.days.length === 0 && <p className="mt-1 text-xs text-white-dark">No day selected = every day.</p>}
                </div>
                <Textarea
                    label="Description / instructions"
                    rows={2}
                    value={form.data.description}
                    onChange={(e) => form.setData('description', e.target.value)}
                    error={form.errors.description}
                />
                <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active (shown on the roster)" />
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        Save duty
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function Field2({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div>
            <label>{label}</label>
            {children}
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
    );
}

/** Checkbox list of people with search and class / stream / dormitory (students) or category (staff) filters. */
function PeoplePicker({
    audience,
    people,
    filters,
    selected,
    onChange,
    error,
}: {
    audience: Audience;
    people: Person[];
    filters: Props['filters'];
    selected: number[];
    onChange: (ids: number[]) => void;
    error?: string;
}) {
    const [q, setQ] = useState('');
    const [classId, setClassId] = useState('');
    const [streamId, setStreamId] = useState('');
    const [dormId, setDormId] = useState('');
    const [category, setCategory] = useState('');
    const [gender, setGender] = useState('');
    const streams = filters.classes?.find((c) => String(c.value) === classId)?.streams ?? [];

    const shown = useMemo(
        () =>
            people.filter(
                (p) =>
                    (!q || `${p.name} ${p.sub}`.toLowerCase().includes(q.toLowerCase())) &&
                    (!classId || String(p.class_id) === classId) &&
                    (!streamId || String(p.stream_id) === streamId) &&
                    (!dormId || String(p.dormitory_id) === dormId) &&
                    (!category || p.category === category) &&
                    (!gender || p.gender === gender),
            ),
        [people, q, classId, streamId, dormId, category, gender],
    );
    const chosen = new Set(selected);
    const allShown = shown.length > 0 && shown.every((p) => chosen.has(p.id));

    const toggle = (id: number) => onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    const toggleAll = () => {
        const ids = new Set(shown.map((p) => p.id));
        onChange(allShown ? selected.filter((x) => !ids.has(x)) : [...selected, ...shown.map((p) => p.id).filter((id) => !chosen.has(id))]);
    };

    return (
        <div>
            <div className="mb-2 flex flex-wrap gap-2">
                <input className="form-input min-w-40 flex-1" placeholder="Search name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
                {audience === 'student' ? (
                    <>
                        <select
                            className="form-select w-auto"
                            value={classId}
                            onChange={(e) => {
                                setClassId(e.target.value);
                                setStreamId('');
                            }}
                        >
                            <option value="">All classes</option>
                            {filters.classes?.map((c) => (
                                <option key={c.value} value={c.value}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                        {streams.length > 0 && (
                            <select className="form-select w-auto" value={streamId} onChange={(e) => setStreamId(e.target.value)}>
                                <option value="">All streams</option>
                                {streams.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        )}
                        {(filters.dormitories?.length ?? 0) > 0 && (
                            <select className="form-select w-auto" value={dormId} onChange={(e) => setDormId(e.target.value)}>
                                <option value="">Any dormitory</option>
                                {filters.dormitories?.map((d) => (
                                    <option key={d.value} value={d.value}>
                                        {d.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </>
                ) : (
                    <select className="form-select w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
                        <option value="">All staff</option>
                        {filters.categories?.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                )}
                <select className="form-select w-auto" value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Any gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                </select>
            </div>
            <div className="mb-1 flex items-center justify-between text-xs">
                <label className="mb-0 inline-flex cursor-pointer items-center gap-2 font-semibold">
                    <input type="checkbox" className="form-checkbox" checked={allShown} onChange={toggleAll} disabled={shown.length === 0} /> Select all shown ({num(shown.length)})
                </label>
                <span className="font-bold text-primary">
                    {num(selected.length)} selected
                    {selected.length > 0 && (
                        <button type="button" className="ms-2 text-danger hover:underline" onClick={() => onChange([])}>
                            clear
                        </button>
                    )}
                </span>
            </div>
            <div className={cn('max-h-64 overflow-y-auto rounded-md border p-1', error ? 'border-danger' : 'border-white-light dark:border-[#1b2e4b]')}>
                {shown.length === 0 ? (
                    <p className="p-3 text-center text-sm text-white-dark">Nobody matches.</p>
                ) : (
                    shown.map((p) => (
                        <label
                            key={p.id}
                            className={cn(
                                'mb-0 flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-[#0e1726]',
                                chosen.has(p.id) && 'bg-primary-light/50 dark:bg-primary-dark-light',
                            )}
                        >
                            <input type="checkbox" className="form-checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{p.name}</span>
                                <span className="block truncate text-xs font-normal text-white-dark">{p.sub}</span>
                            </span>
                        </label>
                    ))
                )}
            </div>
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
    );
}

function AssignModal({
    prefill,
    types,
    typeOptions,
    people,
    filters,
    audience,
    basePath,
    termEnd,
    onClose,
}: {
    prefill: { typeId: string; start: string } | null;
    types: DutyType[];
    typeOptions: Option[];
    people: Person[];
    filters: Props['filters'];
    audience: Audience;
    basePath: string;
    termEnd: string | null | undefined;
    onClose: () => void;
}) {
    const startType = types.find((t) => String(t.id) === prefill?.typeId);
    const start = prefill?.start ?? todayYmd();
    const form = useForm({
        duty_type_id: prefill?.typeId ?? '',
        start_date: startType?.rotation === 'weekly' ? addDays(start, -((new Date(`${start}T00:00:00`).getDay() + 6) % 7)) : start,
        end_date: periodEnd(startType?.rotation ?? 'daily', start, termEnd),
        role: '',
        notes: '',
        people: [] as number[],
    });
    const type = types.find((t) => String(t.id) === String(form.data.duty_type_id));
    const errors = form.errors as Record<string, string | undefined>;

    const setType = (id: string) => {
        const t = types.find((x) => String(x.id) === id);
        form.setData((d) => ({ ...d, duty_type_id: id, end_date: periodEnd(t?.rotation ?? 'daily', d.start_date, termEnd) }));
    };
    const setStart = (value: string) =>
        form.setData((d) => ({
            ...d,
            start_date: value,
            end_date: d.end_date && d.end_date >= value && type?.rotation === 'custom' ? d.end_date : periodEnd(type?.rotation ?? 'daily', value, termEnd),
        }));

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`${basePath}/assign`, { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Modal open={prefill !== null} onClose={onClose} title="Assign duty" size="lg">
            <form onSubmit={submit} className="space-y-4">
                <FormGrid>
                    <Select
                        label="Duty"
                        required
                        placeholder="— Select duty —"
                        options={typeOptions}
                        value={form.data.duty_type_id}
                        onChange={(e) => setType(e.target.value)}
                        error={form.errors.duty_type_id}
                        wrapperClassName="sm:col-span-2"
                    />
                    <Input label="From" type="date" required value={form.data.start_date} onChange={(e) => setStart(e.target.value)} error={form.errors.start_date} />
                    <Input
                        label="To"
                        type="date"
                        required
                        min={form.data.start_date}
                        value={form.data.end_date}
                        onChange={(e) => form.setData('end_date', e.target.value)}
                        error={form.errors.end_date}
                    />
                    <Input
                        label="Role (optional)"
                        value={form.data.role}
                        onChange={(e) => form.setData('role', e.target.value)}
                        error={form.errors.role}
                        placeholder="e.g. Leader, Assistant"
                    />
                    <Input label="Notes (optional)" value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={form.errors.notes} />
                </FormGrid>
                {type && (
                    <div className="flex items-center gap-2 rounded-md bg-info-light p-2.5 text-xs text-info dark:bg-info-dark-light">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        {type.name} runs {daysLabel(type.days).toLowerCase()}
                        {type.time && ` · ${type.time}`} and needs {type.people_needed} {type.people_needed === 1 ? 'person' : 'people'} a day.
                    </div>
                )}
                <div>
                    <label>Who</label>
                    <PeoplePicker
                        audience={audience}
                        people={people}
                        filters={filters}
                        selected={form.data.people}
                        onChange={(ids) => form.setData('people', ids)}
                        error={errors.people ?? errors['people.0']}
                    />
                </div>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing || form.data.people.length === 0}>
                        Assign {form.data.people.length || ''}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function RotaModal({
    open,
    types,
    typeOptions,
    people,
    filters,
    audience,
    basePath,
    onClose,
}: {
    open: boolean;
    types: DutyType[];
    typeOptions: Option[];
    people: Person[];
    filters: Props['filters'];
    audience: Audience;
    basePath: string;
    onClose: () => void;
}) {
    const nextMonday = addDays(todayYmd(), (8 - new Date().getDay()) % 7 || 7);
    const form = useForm({ duty_type_id: '', start_date: nextMonday, periods: '4', length_days: '7', per_period: '1', role: '', pool: [] as number[] });
    const errors = form.errors as Record<string, string | undefined>;
    const names = new Map(people.map((p) => [p.id, p.name]));

    const setType = (id: string) => {
        const t = types.find((x) => String(x.id) === id);
        form.setData((d) => ({ ...d, duty_type_id: id, per_period: String(t?.people_needed ?? 1), length_days: t?.rotation === 'daily' ? '1' : '7' }));
    };

    // Same round-robin as the server (which also skips anyone already on this duty for a period).
    const preview = useMemo(() => {
        const per = Math.max(1, Number(form.data.per_period) || 1);
        const len = Math.max(1, Number(form.data.length_days) || 1);
        const count = Math.min(52, Math.max(0, Number(form.data.periods) || 0));
        const pool = form.data.pool;
        if (!form.data.start_date || pool.length < per) return [];
        let cursor = 0;
        return Array.from({ length: count }, (_, i) => {
            const start = addDays(form.data.start_date, i * len);
            const ids = Array.from({ length: per }, () => pool[cursor++ % pool.length]);
            return { start, end: addDays(start, len - 1), names: ids.map((id) => names.get(id) ?? '?') };
        });
    }, [form.data.per_period, form.data.length_days, form.data.periods, form.data.pool, form.data.start_date, names]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`${basePath}/generate`, { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Modal open={open} onClose={onClose} title="Generate rota" size="xl">
            <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-white-dark">Pick a pool of people and the system rotates them through the duty, period by period, so everyone gets a fair turn.</p>
                <FormGrid cols={3}>
                    <Select
                        label="Duty"
                        required
                        placeholder="— Select duty —"
                        options={typeOptions}
                        value={form.data.duty_type_id}
                        onChange={(e) => setType(e.target.value)}
                        error={form.errors.duty_type_id}
                    />
                    <Input
                        label="First period starts"
                        type="date"
                        required
                        value={form.data.start_date}
                        onChange={(e) => form.setData('start_date', e.target.value)}
                        error={form.errors.start_date}
                    />
                    <Input
                        label="Number of periods"
                        type="number"
                        min={1}
                        max={52}
                        required
                        value={form.data.periods}
                        onChange={(e) => form.setData('periods', e.target.value)}
                        error={form.errors.periods}
                    />
                    <Input
                        label="Days per period"
                        type="number"
                        min={1}
                        max={120}
                        required
                        value={form.data.length_days}
                        onChange={(e) => form.setData('length_days', e.target.value)}
                        error={form.errors.length_days}
                        help="7 = weekly, 1 = daily"
                    />
                    <Input
                        label="People per period"
                        type="number"
                        min={1}
                        max={50}
                        required
                        value={form.data.per_period}
                        onChange={(e) => form.setData('per_period', e.target.value)}
                        error={form.errors.per_period}
                    />
                    <Input label="Role (optional)" value={form.data.role} onChange={(e) => form.setData('role', e.target.value)} error={form.errors.role} />
                </FormGrid>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                        <label>Pool</label>
                        <PeoplePicker
                            audience={audience}
                            people={people}
                            filters={filters}
                            selected={form.data.pool}
                            onChange={(ids) => form.setData('pool', ids)}
                            error={errors.pool ?? errors['pool.0']}
                        />
                    </div>
                    <div>
                        <label>Preview</label>
                        {preview.length === 0 ? (
                            <p className="rounded-md border border-dashed border-white-light p-4 text-center text-sm text-white-dark dark:border-[#1b2e4b]">
                                Choose at least {form.data.per_period || 1} {Number(form.data.per_period) === 1 ? 'person' : 'people'} to see the rotation.
                            </p>
                        ) : (
                            <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
                                {preview.map((p) => (
                                    <li key={p.start} className="rounded-md bg-gray-50 px-3 py-2 dark:bg-[#0e1726]">
                                        <div className="text-xs font-bold text-white-dark">
                                            {date(p.start)}
                                            {p.end !== p.start && ` – ${date(p.end)}`}
                                        </div>
                                        <div className="font-semibold">{p.names.join(', ')}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-2 text-xs text-white-dark">People already rostered on this duty count towards a period: a covered period gets nobody new, and someone already on duty is skipped for the next person.</p>
                    </div>
                </div>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing || preview.length === 0}>
                        <Repeat className="h-4 w-4" /> Generate {preview.length} period{preview.length === 1 ? '' : 's'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function EditAssignmentModal({
    assignment,
    people,
    noun,
    basePath,
    onClose,
}: {
    assignment: Assignment | null;
    people: Person[];
    noun: string;
    basePath: string;
    onClose: () => void;
}) {
    const form = useForm({
        person_id: assignment ? String(assignment.person_id) : '',
        start_date: assignment?.start_date ?? '',
        end_date: assignment?.end_date ?? '',
        role: assignment?.role ?? '',
        notes: assignment?.notes ?? '',
    });
    const options: Option[] = people.map((p) => ({ value: p.id, label: `${p.name} — ${p.sub}` }));

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!assignment) return;
        form.put(`${basePath}/assignments/${assignment.id}`, { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Modal open={assignment !== null} onClose={onClose} title={`Change ${assignment?.duty ?? 'duty'} assignment`}>
            <form onSubmit={submit} className="space-y-4">
                <Select
                    label={noun.charAt(0).toUpperCase() + noun.slice(1)}
                    required
                    options={options}
                    value={form.data.person_id}
                    onChange={(e) => form.setData('person_id', e.target.value)}
                    error={form.errors.person_id}
                    help="Swap in someone else, e.g. when the rostered person is on leave."
                />
                <FormGrid>
                    <Input
                        label="From"
                        type="date"
                        required
                        value={form.data.start_date}
                        onChange={(e) => form.setData('start_date', e.target.value)}
                        error={form.errors.start_date}
                    />
                    <Input
                        label="To"
                        type="date"
                        required
                        min={form.data.start_date}
                        value={form.data.end_date}
                        onChange={(e) => form.setData('end_date', e.target.value)}
                        error={form.errors.end_date}
                    />
                    <Input label="Role" value={form.data.role} onChange={(e) => form.setData('role', e.target.value)} error={form.errors.role} />
                    <Input label="Notes" value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={form.errors.notes} />
                </FormGrid>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        Save
                    </button>
                </div>
            </form>
        </Modal>
    );
}
