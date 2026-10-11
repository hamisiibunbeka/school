import { Link } from '@inertiajs/react';
import { AlertTriangle, CalendarRange, Download, Percent, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Tabs from '@/components/ui/tabs';
import { cn, date, exportCsv, num } from '@/lib/utils';
import type { Option } from '@/types';

type Counts = { present: number; absent: number; late: number; excused: number; total: number; rate: number | null };
type StudentRow = Counts & { id: number; admission_no: string; full_name: string; class_name: string };
type ClassRow = Counts & { class_id: number; stream_id: number | null; name: string; students: number };
type DayRow = Counts & { date: string };

type Props = {
    filters: { from: string; to: string; class: string; stream: string; threshold: string };
    classes: (Option & { streams: Option[] })[];
    students: StudentRow[];
    classSummary: ClassRow[];
    daily: DayRow[];
    below: StudentRow[];
    totals: Counts & { days: number; students: number };
    presets: Record<string, { from: string; to: string; label: string }>;
};

function Rate({ value, threshold }: { value: number | null; threshold: number }) {
    if (value === null) return <span className="text-white-dark">—</span>;
    const tone = value < threshold ? { bar: 'bg-danger', text: 'text-danger' } : value < 95 ? { bar: 'bg-warning', text: 'text-warning' } : { bar: 'bg-success', text: 'text-success' };
    return (
        <div className="flex items-center justify-end gap-2">
            <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white-light sm:block dark:bg-[#1b2e4b]">
                <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
            <span className={cn('font-bold', tone.text)}>{value.toFixed(1)}%</span>
        </div>
    );
}

export default function AttendanceReport({ filters: initial, classes, students, classSummary, daily, below, totals, presets }: Props) {
    const { filters, setFilter } = useFilters(initial);
    const [tab, setTab] = useState(initial.class ? 'students' : 'classes');
    const threshold = Number(initial.threshold) || 85;
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];
    const scope = [classes.find((c) => String(c.value) === initial.class)?.label, streams.find((s) => String(s.value) === initial.stream)?.label].filter(Boolean).join(' ') || 'Whole school';

    const countCols = <T extends Counts>(): Column<T>[] => [
        { key: 'present', header: 'Present', align: 'right', render: (r) => num(r.present) },
        { key: 'late', header: 'Late', align: 'right', render: (r) => num(r.late) },
        { key: 'excused', header: 'Excused', align: 'right', render: (r) => num(r.excused) },
        { key: 'absent', header: 'Absent', align: 'right', render: (r) => <span className={r.absent ? 'font-bold text-danger' : ''}>{num(r.absent)}</span> },
        { key: 'total', header: 'Days', align: 'right', render: (r) => num(r.total) },
        { key: 'rate', header: 'Attendance', align: 'right', render: (r) => <Rate value={r.rate} threshold={threshold} /> },
    ];

    const studentCols: Column<StudentRow>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (s) => (
                <div>
                    <Link href={`/students/${s.id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                        {s.full_name}
                    </Link>
                    <div className="text-xs text-white-dark">{s.admission_no}</div>
                </div>
            ),
        },
        { key: 'class_name', header: 'Class' },
        ...countCols<StudentRow>(),
    ];

    const classCols: Column<ClassRow>[] = [
        {
            key: 'name',
            header: 'Class',
            render: (c) => (
                <button
                    type="button"
                    className="font-bold text-primary hover:underline"
                    onClick={() => {
                        setFilter('class', String(c.class_id));
                        setFilter('stream', c.stream_id ? String(c.stream_id) : '');
                        setTab('students');
                    }}
                >
                    {c.name}
                </button>
            ),
        },
        { key: 'students', header: 'Learners', align: 'right', render: (c) => num(c.students) },
        ...countCols<ClassRow>(),
    ];

    const exportStudents = () =>
        exportCsv(`attendance-${initial.from}-to-${initial.to}`, [
            ['Admission No', 'Student', 'Class', 'Present', 'Late', 'Excused', 'Absent', 'Days marked', 'Attendance %'],
            ...students.map((s) => [s.admission_no, s.full_name, s.class_name, s.present, s.late, s.excused, s.absent, s.total, s.rate ?? '']),
        ]);

    return (
        <>
            <PageHeader
                title="Attendance Reports"
                subtitle="Class and learner attendance over a period, daily trend and learners needing follow-up."
                breadcrumbs={[{ title: 'Attendance', href: '/attendance' }, { title: 'Reports' }]}
                actions={
                    <>
                        <button type="button" className="btn btn-outline-primary" onClick={exportStudents} disabled={!students.length}>
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        <PrintButton />
                    </>
                }
            />

            <div className="panel no-print mb-6">
                <FilterBar>
                    <div className="flex items-center gap-2">
                        <input type="date" className="form-input" value={filters.from} max={filters.to} onChange={(e) => setFilter('from', e.target.value)} aria-label="From" />
                        <span className="text-white-dark">to</span>
                        <input type="date" className="form-input" value={filters.to} min={filters.from} onChange={(e) => setFilter('to', e.target.value)} aria-label="To" />
                    </div>
                    <FilterSelect
                        value={filters.class}
                        onChange={(v) => {
                            setFilter('class', v);
                            setFilter('stream', '');
                        }}
                        options={classes}
                        placeholder="All classes"
                    />
                    {streams.length > 0 && <FilterSelect value={filters.stream} onChange={(v) => setFilter('stream', v)} options={streams} placeholder="All streams" />}
                    <label className="mb-0 flex items-center gap-2 text-sm font-semibold whitespace-nowrap">
                        Threshold
                        <input type="number" min={1} max={100} className="form-input w-20" value={filters.threshold} onChange={(e) => setFilter('threshold', e.target.value)} />%
                    </label>
                </FilterBar>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(presets).map(([key, p]) => (
                        <button
                            key={key}
                            type="button"
                            className={cn('btn btn-sm', filters.from === p.from && filters.to === p.to ? 'btn-primary' : 'btn-outline-primary')}
                            onClick={() => {
                                setFilter('from', p.from);
                                setFilter('to', p.to);
                            }}
                        >
                            <CalendarRange className="h-3.5 w-3.5" /> {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="hidden print:block">
                <Letterhead title="Attendance Report" meta={<div>{scope}<br />{date(initial.from)} – {date(initial.to)}</div>} />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Attendance rate" value={totals.rate !== null ? `${totals.rate}%` : '—'} icon={Percent} tone="primary" hint={`${scope} · ${totals.days} school days`} />
                <StatCard title="Present + late" value={num(totals.present + totals.late)} icon={UserCheck} tone="success" hint={`${num(totals.late)} late arrivals`} />
                <StatCard title="Absences" value={num(totals.absent)} icon={UserX} tone="danger" hint={`${num(totals.excused)} excused`} />
                <StatCard title={`Below ${threshold}%`} value={num(below.length)} icon={AlertTriangle} tone="warning" hint={`of ${num(totals.students)} learners`} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 text-lg font-bold dark:text-white-light">Daily attendance</h5>
                    {daily.length ? (
                        <Chart
                            type="area"
                            height={290}
                            series={[
                                { name: 'Attendance %', data: daily.map((d) => d.rate ?? 0) },
                                { name: 'Absent', data: daily.map((d) => d.absent) },
                            ]}
                            options={{
                                xaxis: { categories: daily.map((d) => date(d.date, { day: '2-digit', month: 'short' })) },
                                yaxis: [
                                    { min: 0, max: 100, title: { text: 'Attendance %' }, labels: { formatter: (v: number) => `${Math.round(v)}%` } },
                                    { opposite: true, title: { text: 'Absent' }, labels: { formatter: (v: number) => String(Math.round(v)) } },
                                ],
                                colors: ['#4361ee', '#e7515a'],
                                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05 } },
                            }}
                        />
                    ) : (
                        <p className="py-12 text-center text-white-dark">No attendance recorded in this period.</p>
                    )}
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold dark:text-white-light">Status mix</h5>
                    {totals.total ? (
                        <Chart
                            type="donut"
                            height={290}
                            series={[totals.present, totals.late, totals.excused, totals.absent]}
                            options={{ labels: ['Present', 'Late', 'Excused', 'Absent'], colors: ['#00ab55', '#e2a03f', '#2196f3', '#e7515a'], legend: { position: 'bottom', horizontalAlign: 'center' } }}
                        />
                    ) : (
                        <p className="py-12 text-center text-white-dark">No data.</p>
                    )}
                </div>
            </div>

            <div className="panel">
                <Tabs
                    tabs={[
                        { key: 'classes', label: 'By class', count: classSummary.length },
                        { key: 'students', label: 'By learner', count: students.length },
                        { key: 'below', label: `Below ${threshold}%`, count: below.length },
                    ]}
                    active={tab}
                    onChange={setTab}
                />
                {tab === 'classes' && <DataTable columns={classCols} rows={classSummary.map((c, i) => ({ ...c, id: i }))} compact striped empty="No attendance in this period" />}
                {tab === 'students' && <DataTable columns={studentCols} rows={students} compact striped empty="No attendance in this period" emptyDescription="Choose a different class or date range." />}
                {tab === 'below' && (
                    <>
                        <p className="mb-3 text-sm text-white-dark">
                            Learners whose attendance (present + late ÷ days marked) is below {threshold}% between {date(initial.from)} and {date(initial.to)}. Consider guardian follow-up or a{' '}
                            <Link href="/attendance/discipline" className="text-primary hover:underline">
                                pastoral case
                            </Link>
                            .
                        </p>
                        <DataTable columns={studentCols} rows={below} compact striped empty="Everyone is above the threshold" />
                    </>
                )}
            </div>
        </>
    );
}
