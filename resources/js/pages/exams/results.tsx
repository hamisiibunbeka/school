import { Link } from '@inertiajs/react';
import { Award, Download, FileText, Medal, Percent, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { ProvisionalNotice } from './_components/workflow';
import Tabs from '@/components/ui/tabs';
import { cn, exportCsv, num } from '@/lib/utils';
import type { Option } from '@/types';

export type Cell = {
    score: number | null;
    percentage: number | null;
    grade: string | null;
    points: number | null;
    is_absent: boolean;
    remarks: string | null;
    /** A-Level only: subsidiary subjects (GS, BAM) are shown but never counted. */
    role?: 'principal' | 'subsidiary' | null;
} | null;
export type StudentResult = {
    id: number;
    admission_no: string;
    full_name: string;
    gender: string;
    stream_id: number | null;
    stream: string | null;
    combination?: string | null;
    marks: Record<number, Cell>;
    sat: number;
    total: number;
    average: number | null;
    grade: string | null;
    remark: string | null;
    points: number | null;
    division: string | null;
    passed: boolean;
    position: number | null;
};
type SubjectStat = {
    id: number;
    name: string;
    code: string | null;
    teacher: string | null;
    entered: number;
    sat: number;
    absent: number;
    average: number | null;
    highest: number | null;
    lowest: number | null;
    pass_rate: number | null;
    grade: string | null;
    distribution: Record<string, number>;
};
type Analysis = {
    level: string;
    /** false for pre-primary / primary: average grade only, no divisions */
    has_division: boolean;
    pass_grades: string[];
    combinations: Record<string, Record<string, number>>;
    unassigned: number;
    subjects: { id: number; name: string; code: string }[];
    students: StudentResult[];
    subjectStats: SubjectStat[];
    gradeDistribution: Record<string, number>;
    divisions: Record<string, number>;
    summary: {
        students: number;
        ranked: number;
        class_size: number;
        average: number | null;
        pass_rate: number | null;
        highest: number | null;
        lowest: number | null;
        pass_mark: number;
    };
};

type Props = {
    exam: { id: number; name: string; type: string; status: string; term: string | null; year: string | null; max_score: number; published_at: string | null };
    filters: { class: string; stream: string };
    classes: (Option & { streams: Option[] })[];
    analysis: Analysis | null;
    scale: { grade: string; min: number; max: number; points: number; is_pass: boolean; remark: string | null }[];
    canApprove: boolean;
};

const divTone: Record<string, string> = {
    I: 'badge-soft-success',
    II: 'badge-soft-primary',
    III: 'badge-soft-info',
    IV: 'badge-soft-warning',
    '0': 'badge-soft-danger',
    INC: 'badge-soft-dark',
};

export default function Results({ exam, filters: initial, classes, analysis, scale, canApprove }: Props) {
    const { filters, setFilter } = useFilters(initial);
    const [tab, setTab] = useState('broadsheet');
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];
    const className = [classes.find((c) => String(c.value) === initial.class)?.label, streams.find((s) => String(s.value) === initial.stream)?.label].filter(Boolean).join(' ');
    const provisional = exam.status !== 'published';

    const exportBroadsheet = () => {
        if (!analysis) return;
        exportCsv(`${exam.name}-${className}-results`, [
            [
                'Position',
                'Admission No',
                'Student',
                'Stream',
                ...(analysis.level === 'a_level' ? ['Combination'] : []),
                ...analysis.subjects.map((s) => s.code),
                'Total',
                'Average %',
                analysis.has_division ? 'Grade' : 'Average grade',
                ...(analysis.has_division ? ['Points', 'Division'] : []),
                'Result',
            ],
            ...analysis.students.map((s) => [
                s.position ?? '',
                s.admission_no,
                s.full_name,
                s.stream ?? '',
                ...(analysis.level === 'a_level' ? [s.combination ?? ''] : []),
                ...analysis.subjects.map((sub) => {
                    const c = s.marks[sub.id];
                    return c ? (c.is_absent ? 'ABS' : `${c.score ?? ''} ${c.grade ?? ''}`.trim()) : '';
                }),
                s.total,
                s.average ?? '',
                s.grade ?? '',
                ...(analysis.has_division ? [s.points ?? '', s.division ?? ''] : []),
                s.average === null ? '' : s.passed ? 'Pass' : 'Not passed',
            ]),
        ]);
    };

    return (
        <>
            <PageHeader
                title="Results Analysis"
                subtitle={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        {exam.name} · {[exam.term, exam.year].filter(Boolean).join(', ')} <StatusBadge status={exam.status} />
                    </span>
                }
                breadcrumbs={[{ title: 'Exams', href: '/exams' }, { title: exam.name, href: `/exams/${exam.id}` }, { title: 'Results' }]}
                actions={
                    <>
                        <Link
                            href={`/exams/report-cards?exam=${exam.id}${initial.class ? `&class=${initial.class}` : ''}${initial.stream ? `&stream=${initial.stream}` : ''}`}
                            className="btn btn-outline-primary"
                        >
                            <FileText className="h-4 w-4" /> Report cards
                        </Link>
                        <button type="button" className="btn btn-outline-success" onClick={exportBroadsheet} disabled={!analysis?.students.length}>
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        <PrintButton />
                    </>
                }
            />

            <div className="panel no-print mb-6">
                <FilterBar>
                    <FilterSelect
                        value={filters.class}
                        onChange={(v) => {
                            setFilter('class', v);
                            setFilter('stream', '');
                        }}
                        options={classes}
                        placeholder="Select class"
                    />
                    {streams.length > 0 && <FilterSelect value={filters.stream} onChange={(v) => setFilter('stream', v)} options={streams} placeholder="All streams" />}
                </FilterBar>
                <ProvisionalNotice exam={exam} canApprove={canApprove} />
                {analysis?.level === 'a_level' ? (
                    <p className="mt-3 text-xs text-white-dark">
                        A-Level (ACSEE): each learner is graded on their combination. Division = sum of points of the 3 principal subjects, A=1 … F=7 (I: 3–9, II: 10–12, III:
                        13–17, IV: 18–19, 0: 20–21; fewer than 3 principal subjects = INC). Subsidiary subjects (shown in grey) never count towards the division; the average
                        counts all subjects or principals only, as set under Academics → Combinations. Position: division points, then average, then total marks.
                    </p>
                ) : analysis && !analysis.has_division ? (
                    <p className="mt-3 text-xs text-white-dark">
                        {analysis.level === 'primary' ? 'Primary (NECTA PSLE / SFNA style)' : 'Pre-primary'}: each subject is graded and the average (mean % of subjects sat)
                        gives the average grade — no divisions. Pass grades: {analysis.pass_grades.join(', ') || '—'} (pass mark {analysis.summary.pass_mark}%). Position: average,
                        then total marks.
                    </p>
                ) : (
                    <p className="mt-3 text-xs text-white-dark">
                        Average = mean % of subjects sat. Division = sum of points of the best 7 subjects (I: 7–17, II: 18–21, III: 22–25, IV: 26–33, 0: 34–35; fewer than 7
                        subjects = INC). Position is within the whole class. Pass mark {analysis?.summary.pass_mark ?? 30}%.
                    </p>
                )}
                {analysis && analysis.unassigned > 0 && (
                    <p className="mt-2 rounded-md bg-warning-light px-3 py-2 text-xs font-semibold text-warning dark:bg-warning-dark-light">
                        {analysis.unassigned} learner(s) are not in a stream linked to a combination, so their subjects cannot be graded. Place them in a combination stream.
                    </p>
                )}
            </div>

            {!analysis ? (
                <div className="panel">
                    <EmptyState title="Select a class" />
                </div>
            ) : analysis.students.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No results yet" description="No marks have been entered for this class." />
                </div>
            ) : (
                <>
                    <div className="hidden print:block">
                        <Letterhead
                            title={`${exam.name} — ${className} Results`}
                            meta={
                                <div>
                                    {[exam.term, exam.year].filter(Boolean).join(', ')}
                                    {provisional && <div className="font-bold text-danger">PROVISIONAL</div>}
                                </div>
                            }
                        />
                    </div>

                    <div className="no-print mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                        <StatCard title="Learners ranked" value={num(analysis.summary.ranked)} icon={Users} tone="primary" hint={`${analysis.summary.class_size} in class`} />
                        <StatCard
                            title="Class average"
                            value={analysis.summary.average !== null ? `${analysis.summary.average}%` : '—'}
                            icon={Percent}
                            tone="info"
                            hint={`High ${analysis.summary.highest ?? '—'}% · Low ${analysis.summary.lowest ?? '—'}%`}
                        />
                        <StatCard title="Pass rate" value={analysis.summary.pass_rate !== null ? `${analysis.summary.pass_rate}%` : '—'} icon={Award} tone="success" />
                        {analysis.has_division ? (
                            <StatCard
                                title="Division I – II"
                                value={num((analysis.divisions.I ?? 0) + (analysis.divisions.II ?? 0))}
                                icon={Trophy}
                                tone="warning"
                                hint={`Div I: ${analysis.divisions.I ?? 0}`}
                            />
                        ) : (
                            <StatCard
                                title="Best average grade"
                                value={(() => {
                                    const best = Object.entries(analysis.gradeDistribution).find(([, n]) => n > 0);
                                    return best ? `${best[0]} × ${best[1]}` : '—';
                                })()}
                                icon={Trophy}
                                tone="warning"
                                hint={`Passed (${analysis.pass_grades.join(', ')}): ${num(analysis.students.filter((s) => s.passed).length)}`}
                            />
                        )}
                    </div>

                    <div className="panel">
                        <Tabs
                            tabs={[
                                { key: 'broadsheet', label: 'Broadsheet' },
                                { key: 'subjects', label: 'Subject analysis' },
                                { key: 'distribution', label: analysis.has_division ? 'Grades & divisions' : 'Grades' },
                                { key: 'top', label: 'Top performers' },
                            ]}
                            active={tab}
                            onChange={setTab}
                        />

                        {tab === 'broadsheet' && <Broadsheet analysis={analysis} />}
                        {tab === 'subjects' && <SubjectAnalysis analysis={analysis} />}
                        {tab === 'distribution' && <Distribution analysis={analysis} scale={scale} />}
                        {tab === 'top' && <TopPerformers analysis={analysis} />}
                    </div>
                </>
            )}
        </>
    );
}

function Broadsheet({ analysis }: { analysis: Analysis }) {
    return (
        <div className="table-responsive">
            <table className="table-compact table-striped table text-sm">
                <thead>
                    <tr>
                        <th className="text-center!">Pos</th>
                        <th>Learner</th>
                        {analysis.subjects.map((s) => (
                            <th key={s.id} className="text-center!" title={s.name}>
                                {s.code}
                            </th>
                        ))}
                        <th className="text-end!">Total</th>
                        <th className="text-end!">Avg %</th>
                        <th className="text-center!">{analysis.has_division ? 'Grade' : 'Avg grade'}</th>
                        {analysis.has_division ? (
                            <>
                                <th className="text-end!">Pts</th>
                                <th className="text-center!">Div</th>
                            </>
                        ) : (
                            <th className="text-center!">Result</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {analysis.students.map((s) => (
                        <tr key={s.id}>
                            <td className="text-center font-bold">{s.position ?? '—'}</td>
                            <td className="whitespace-nowrap">
                                <Link href={`/students/${s.id}`} className="font-semibold hover:text-primary">
                                    {s.full_name}
                                </Link>
                                <div className="text-xs text-white-dark">
                                    {s.admission_no}
                                    {s.stream && ` · ${s.stream}`}
                                    {s.combination && <span className="badge badge-soft-secondary ms-1 px-1.5 py-0">{s.combination}</span>}
                                </div>
                            </td>
                            {analysis.subjects.map((sub) => {
                                const c = s.marks[sub.id];
                                return (
                                    <td
                                        key={sub.id}
                                        className={cn('text-center whitespace-nowrap', c?.role === 'subsidiary' && 'opacity-60')}
                                        title={c?.role === 'subsidiary' ? 'Subsidiary — not counted in the division' : undefined}
                                    >
                                        {!c ? (
                                            <span className="text-white-dark">·</span>
                                        ) : c.is_absent ? (
                                            <span className="text-xs font-bold text-white-dark">ABS</span>
                                        ) : (
                                            <>
                                                {num(c.score, c.score !== null && c.score % 1 ? 1 : 0)}{' '}
                                                <span className={cn('text-xs font-bold', c.grade === 'F' ? 'text-danger' : 'text-primary')}>{c.grade}</span>
                                            </>
                                        )}
                                    </td>
                                );
                            })}
                            <td className="text-end">{num(s.total, s.total % 1 ? 1 : 0)}</td>
                            <td className="text-end font-bold">{s.average !== null ? s.average.toFixed(1) : '—'}</td>
                            <td className="text-center font-bold">{s.grade ?? '—'}</td>
                            {analysis.has_division ? (
                                <>
                                    <td className="text-end">{s.points ?? '—'}</td>
                                    <td className="text-center">
                                        <span className={cn('badge', divTone[s.division ?? ''])}>{s.division}</span>
                                    </td>
                                </>
                            ) : (
                                <td className="text-center">
                                    {s.average === null ? (
                                        '—'
                                    ) : (
                                        <span className={cn('badge', s.passed ? 'badge-soft-success' : 'badge-soft-danger')}>{s.passed ? 'Pass' : 'Not passed'}</span>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SubjectAnalysis({ analysis }: { analysis: Analysis }) {
    const stats = analysis.subjectStats.filter((s) => s.sat > 0);
    return (
        <div className="space-y-6">
            {stats.length > 0 && (
                <div className="no-print">
                    <Chart
                        type="bar"
                        height={300}
                        series={[
                            { name: 'Average %', data: stats.map((s) => s.average ?? 0) },
                            { name: 'Pass rate %', data: stats.map((s) => s.pass_rate ?? 0) },
                        ]}
                        options={{
                            xaxis: { categories: stats.map((s) => s.code ?? s.name) },
                            yaxis: { min: 0, max: 100 },
                            plotOptions: { bar: { columnWidth: '60%', borderRadius: 3 } },
                            colors: ['#4361ee', '#00ab55'],
                        }}
                    />
                </div>
            )}
            <div className="table-responsive">
                <table className="table-compact table-striped table">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Teacher</th>
                            <th className="text-end!">Sat</th>
                            <th className="text-end!">Absent</th>
                            <th className="text-end!">Average</th>
                            <th className="text-center!">Grade</th>
                            <th className="text-end!">Highest</th>
                            <th className="text-end!">Lowest</th>
                            <th className="text-end!">Pass rate</th>
                            {Object.keys(analysis.gradeDistribution).map((g) => (
                                <th key={g} className="text-center!">
                                    {g}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[...analysis.subjectStats]
                            .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
                            .map((s) => (
                                <tr key={s.id}>
                                    <td className="font-semibold whitespace-nowrap">{s.name}</td>
                                    <td className="text-xs whitespace-nowrap">{s.teacher ?? '—'}</td>
                                    <td className="text-end">{s.sat}</td>
                                    <td className="text-end">{s.absent}</td>
                                    <td className="text-end font-bold">{s.average !== null ? `${s.average}%` : '—'}</td>
                                    <td className="text-center font-bold">{s.grade ?? '—'}</td>
                                    <td className="text-end">{s.highest ?? '—'}</td>
                                    <td className="text-end">{s.lowest ?? '—'}</td>
                                    <td className={cn('text-end font-semibold', s.pass_rate !== null && s.pass_rate < 50 ? 'text-danger' : 'text-success')}>
                                        {s.pass_rate !== null ? `${s.pass_rate}%` : '—'}
                                    </td>
                                    {Object.keys(analysis.gradeDistribution).map((g) => (
                                        <td key={g} className="text-center">
                                            {s.distribution[g] || <span className="text-white-dark">0</span>}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Distribution({ analysis, scale }: { analysis: Analysis; scale: Props['scale'] }) {
    const grades = Object.keys(analysis.gradeDistribution);
    const divisions = ['I', 'II', 'III', 'IV', '0', 'INC'];
    return (
        <div className={cn('grid grid-cols-1 gap-6', analysis.has_division && 'lg:grid-cols-2')}>
            <div>
                <h6 className="mb-2 font-bold">{analysis.has_division ? 'Overall grade distribution (by average)' : 'Average grade distribution'}</h6>
                <Chart
                    type="bar"
                    height={280}
                    series={[{ name: 'Learners', data: grades.map((g) => analysis.gradeDistribution[g]) }]}
                    options={{
                        xaxis: { categories: grades },
                        plotOptions: { bar: { distributed: true, columnWidth: '50%', borderRadius: 4 } },
                        colors: ['#00ab55', '#4361ee', '#2196f3', '#e2a03f', '#e7515a', '#3b3f5c'],
                        legend: { show: false },
                        dataLabels: { enabled: true },
                    }}
                />
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-white-dark">
                    {scale.map((g) => (
                        <span key={g.grade}>
                            <b>{g.grade}</b> {g.min}–{g.max}% ({g.points} pts)
                        </span>
                    ))}
                </div>
            </div>
            {analysis.has_division && (
            <div>
                <h6 className="mb-2 font-bold">Division summary</h6>
                {Object.keys(analysis.combinations ?? {}).length > 0 && (
                    <div className="table-responsive mb-4">
                        <table className="table-compact table text-sm">
                            <thead>
                                <tr>
                                    <th>Combination</th>
                                    {divisions.map((d) => (
                                        <th key={d} className="text-center!">
                                            {d === 'INC' ? 'INC' : `Div ${d}`}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(analysis.combinations).map(([code, row]) => (
                                    <tr key={code}>
                                        <td className="font-bold">{code}</td>
                                        {divisions.map((d) => (
                                            <td key={d} className="text-center">
                                                {row[d] ?? 0}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Chart
                    type="donut"
                    height={280}
                    series={divisions.map((d) => analysis.divisions[d] ?? 0)}
                    options={{
                        labels: divisions.map((d) => (d === 'INC' ? 'Incomplete' : `Division ${d}`)),
                        colors: ['#00ab55', '#4361ee', '#2196f3', '#e2a03f', '#e7515a', '#888ea8'],
                        legend: { position: 'bottom', horizontalAlign: 'center' },
                    }}
                />
            </div>
            )}
        </div>
    );
}

function TopPerformers({ analysis }: { analysis: Analysis }) {
    const top = analysis.students.filter((s) => s.position !== null).slice(0, 10);
    const bottom = [...analysis.students]
        .filter((s) => s.average !== null)
        .sort((a, b) => (a.average ?? 0) - (b.average ?? 0))
        .slice(0, 5);
    const bestBySubject = analysis.subjects
        .map((sub) => {
            const best = analysis.students
                .filter((s) => s.marks[sub.id]?.percentage != null)
                .sort((a, b) => (b.marks[sub.id]?.percentage ?? 0) - (a.marks[sub.id]?.percentage ?? 0))[0];
            return best ? { subject: sub.name, student: best.full_name, score: best.marks[sub.id]?.percentage } : null;
        })
        .filter(Boolean) as { subject: string; student: string; score: number }[];

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
                <h6 className="mb-3 font-bold">Top 10</h6>
                <div className="space-y-2">
                    {top.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                            <span
                                className={cn(
                                    'grid h-9 w-9 shrink-0 place-content-center rounded-full font-extrabold',
                                    s.position === 1 ? 'bg-warning text-white' : s.position! <= 3 ? 'bg-primary-light text-primary' : 'bg-white-light text-dark dark:bg-[#1b2e4b]',
                                )}
                            >
                                {s.position === 1 ? <Medal className="h-4 w-4" /> : s.position}
                            </span>
                            <Avatar name={s.full_name} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-bold">{s.full_name}</div>
                                <div className="text-xs text-white-dark">
                                    {s.admission_no}
                                    {s.stream && ` · Stream ${s.stream}`}
                                </div>
                            </div>
                            <div className="text-end">
                                <div className="text-lg font-extrabold text-primary">{s.average?.toFixed(1)}%</div>
                                <div className="text-xs">
                                    {analysis.has_division ? `Grade ${s.grade} · Div ${s.division} (${s.points})` : `Average grade ${s.grade}`}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-6">
                <div>
                    <h6 className="mb-3 font-bold">Best in each subject</h6>
                    <ul className="space-y-1.5 text-sm">
                        {bestBySubject.map((b) => (
                            <li key={b.subject} className="flex justify-between gap-2">
                                <span className="text-white-dark">{b.subject}</span>
                                <span className="text-end font-semibold">
                                    {b.student} <span className="text-primary">{b.score.toFixed(0)}%</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h6 className="mb-3 font-bold text-danger">Needing support</h6>
                    <ul className="space-y-1.5 text-sm">
                        {bottom.map((s) => (
                            <li key={s.id} className="flex justify-between gap-2">
                                <Link href={`/students/${s.id}`} className="hover:text-primary">
                                    {s.full_name}
                                </Link>
                                <span className="font-semibold text-danger">{s.average?.toFixed(1)}%</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
