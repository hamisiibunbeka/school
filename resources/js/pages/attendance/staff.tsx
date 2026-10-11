import { Link, router } from '@inertiajs/react';
import { CheckCheck, ClipboardList, Clock, Plane, Save, UserCheck, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import Avatar from '@/components/ui/avatar';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { cn, date, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import { StatusToggle, type StaffStatus } from './_components/status-toggle';

type Staff = {
    id: number;
    employee_no: string;
    full_name: string;
    designation: string | null;
    department: string | null;
    category: string;
    on_approved_leave: boolean;
    status: StaffStatus | null;
    check_in: string | null;
    check_out: string | null;
    remarks: string | null;
};

type Props = {
    filters: { date: string; department: string; category: string };
    roster: Staff[];
    departments: Option[];
    trend: { date: string; present: number; late: number; absent: number; on_leave: number }[];
    today: string;
    canRecord: boolean;
    summary: { staff: number; marked: number; present: number; late: number; absent: number; on_leave: number };
};

type Entry = { status: StaffStatus | null; check_in: string; check_out: string; remarks: string };

export default function StaffAttendance({ filters: initial, roster, departments, trend, today, canRecord, summary }: Props) {
    const { filters, setFilter } = useFilters(initial);

    return (
        <>
            <PageHeader
                title="Staff Attendance"
                subtitle="Daily staff register with check-in and check-out times."
                breadcrumbs={[{ title: 'Attendance', href: '/attendance' }, { title: 'Staff' }]}
                actions={
                    <Link href="/attendance" className="btn btn-outline-primary">
                        <ClipboardList className="h-4 w-4" /> Student register
                    </Link>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Marked" value={`${num(summary.marked)} / ${num(summary.staff)}`} icon={ClipboardList} tone="primary" hint={date(initial.date)} />
                <StatCard title="Present" value={num(summary.present)} icon={UserCheck} tone="success" />
                <StatCard title="Late" value={num(summary.late)} icon={Clock} tone="warning" />
                <StatCard title="Absent / On leave" value={`${num(summary.absent)} / ${num(summary.on_leave)}`} icon={UserX} tone="danger" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <FilterBar>
                        <input type="date" className="form-input w-full sm:w-auto" value={filters.date} max={today} onChange={(e) => setFilter('date', e.target.value || today)} aria-label="Date" />
                        <FilterSelect value={filters.department} onChange={(v) => setFilter('department', v)} options={departments} placeholder="All departments" />
                        <FilterSelect
                            value={filters.category}
                            onChange={(v) => setFilter('category', v)}
                            options={[
                                { value: 'teaching', label: 'Teaching' },
                                { value: 'non_teaching', label: 'Non-teaching' },
                            ]}
                            placeholder="All staff"
                        />
                    </FilterBar>
                    {roster.length === 0 ? (
                        <EmptyState title="No staff found" description="Adjust the filters or add employees in HR." />
                    ) : (
                        <StaffForm key={`${initial.date}-${initial.department}-${initial.category}-${summary.marked}`} roster={roster} day={initial.date} canRecord={canRecord} />
                    )}
                </div>

                <div className="panel h-fit">
                    <h5 className="mb-4 text-lg font-bold dark:text-white-light">Recent days</h5>
                    {trend.length ? (
                        <Chart
                            type="bar"
                            height={320}
                            series={[
                                { name: 'Present', data: trend.map((t) => t.present) },
                                { name: 'Late', data: trend.map((t) => t.late) },
                                { name: 'Absent', data: trend.map((t) => t.absent) },
                                { name: 'On leave', data: trend.map((t) => t.on_leave) },
                            ]}
                            options={{
                                chart: { stacked: true },
                                colors: ['#00ab55', '#e2a03f', '#e7515a', '#805dca'],
                                plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
                                xaxis: { categories: trend.map((t) => date(t.date, { day: '2-digit', month: 'short' })) },
                                legend: { position: 'bottom', horizontalAlign: 'center' },
                            }}
                        />
                    ) : (
                        <EmptyState title="No staff attendance yet" />
                    )}
                </div>
            </div>
        </>
    );
}

function StaffForm({ roster, day, canRecord }: { roster: Staff[]; day: string; canRecord: boolean }) {
    const initial = useMemo(
        () =>
            Object.fromEntries(
                roster.map((s) => [s.id, { status: s.status ?? (s.on_approved_leave ? 'on_leave' : null), check_in: s.check_in ?? '', check_out: s.check_out ?? '', remarks: s.remarks ?? '' } as Entry]),
            ),
        [roster],
    );
    const [entries, setEntries] = useState<Record<number, Entry>>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);
    const set = (id: number, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

    const markAllPresent = () =>
        setEntries((e) =>
            Object.fromEntries(Object.entries(e).map(([id, v]) => [id, v.status === 'on_leave' ? v : { ...v, status: 'present' as StaffStatus, check_in: v.check_in || '07:30' }])),
        );

    const save = () => {
        const records = roster
            .filter((s) => entries[s.id].status)
            .map((s) => ({ employee_id: s.id, status: entries[s.id].status, check_in: entries[s.id].check_in || null, check_out: entries[s.id].check_out || null, remarks: entries[s.id].remarks || null }));
        setProcessing(true);
        router.post('/attendance/staff', { date: day, records }, { preserveScroll: true, onError: setErrors, onSuccess: () => setErrors({}), onFinish: () => setProcessing(false) });
    };

    const unmarked = roster.filter((s) => !entries[s.id].status).length;
    const errorFor = (id: number) => {
        const idx = roster.filter((s) => entries[s.id].status).findIndex((s) => s.id === id);
        return idx >= 0 ? errors[`records.${idx}.check_out`] ?? errors[`records.${idx}.check_in`] : undefined;
    };

    return (
        <div>
            {canRecord && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className="btn btn-sm btn-success" onClick={markAllPresent}>
                        <CheckCheck className="h-4 w-4" /> Mark all present
                    </button>
                    <span className="text-xs text-white-dark">Staff on approved leave are pre-set to “On leave”.</span>
                </div>
            )}
            <div className="divide-y divide-white-light rounded-md border border-white-light dark:divide-[#1b2e4b] dark:border-[#1b2e4b]">
                {roster.map((s) => {
                    const e = entries[s.id];
                    const working = e.status === 'present' || e.status === 'late';
                    return (
                        <div key={s.id} className={cn('flex flex-col gap-3 p-3 lg:flex-row lg:items-center', !e.status && 'bg-white-light/20 dark:bg-[#1b2e4b]/20')}>
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <Avatar name={s.full_name} />
                                <div className="min-w-0">
                                    <div className="truncate font-bold text-black dark:text-white-light">
                                        {s.full_name}
                                        {s.on_approved_leave && (
                                            <span className="badge badge-soft-secondary ms-2 inline-flex items-center gap-1 align-middle">
                                                <Plane className="h-3 w-3" /> Leave
                                            </span>
                                        )}
                                    </div>
                                    <div className="truncate text-xs text-white-dark">
                                        {s.employee_no} · {s.designation ?? titleCase(s.category)}
                                        {s.department && ` · ${s.department}`}
                                    </div>
                                </div>
                            </div>
                            <StatusToggle<StaffStatus> options={['present', 'late', 'absent', 'on_leave']} value={e.status} onChange={(v) => set(s.id, { status: v })} disabled={!canRecord} />
                            <div className="flex gap-2">
                                <input type="time" className="form-input w-full lg:w-28" value={e.check_in} disabled={!canRecord || !working} onChange={(ev) => set(s.id, { check_in: ev.target.value })} aria-label="Check in" title="Check in" />
                                <input type="time" className="form-input w-full lg:w-28" value={e.check_out} disabled={!canRecord || !working} onChange={(ev) => set(s.id, { check_out: ev.target.value })} aria-label="Check out" title="Check out" />
                            </div>
                            {errorFor(s.id) && <p className="form-error">{errorFor(s.id)}</p>}
                        </div>
                    );
                })}
            </div>
            {canRecord ? (
                <div className="sticky bottom-0 z-10 mt-4 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-white-light bg-white px-5 py-4 dark:border-[#1b2e4b] dark:bg-[#0e1726]">
                    <span className="text-sm text-white-dark">{unmarked ? `${unmarked} staff not marked — they will be skipped.` : 'Everyone marked.'}</span>
                    {Object.keys(errors).length > 0 && <span className="form-error">{Object.values(errors)[0]}</span>}
                    <button type="button" className="btn btn-primary" onClick={save} disabled={processing || unmarked === roster.length}>
                        <Save className="h-4 w-4" /> {processing ? 'Saving…' : 'Save staff register'}
                    </button>
                </div>
            ) : (
                <p className="mt-4 text-sm text-white-dark">You can view the staff register but recording is limited to administrators.</p>
            )}
        </div>
    );
}
