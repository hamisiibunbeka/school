import { usePage } from '@inertiajs/react';
import { FileText } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import { cn, date, num, weekdayDate } from '@/lib/utils';
import type { Option } from '@/types';
import { ProvisionalNotice } from './_components/workflow';

type ExamOption = Option & { status: string; classes: (Option & { streams: Option[] })[] };
type SubjectLine = {
    subject: string;
    teacher: string | null;
    score: number | null;
    percentage: number | null;
    grade: string | null;
    points: number | null;
    is_absent: boolean;
    remark: string | null;
    remarks: string | null;
    role?: 'principal' | 'subsidiary' | null;
};
type Card = {
    id: number;
    admission_no: string;
    full_name: string;
    gender: string;
    stream: string | null;
    combination?: string | null;
    sat: number;
    total: number;
    average: number | null;
    grade: string | null;
    remark: string | null;
    points: number | null;
    division: string | null;
    passed: boolean;
    position: number | null;
    class_teacher: string | null;
    subjects: SubjectLine[];
    attendance: { days: number; present: number; late: number; absent: number; excused: number; rate: number | null };
    comment: string | null;
};

type Props = {
    exams: ExamOption[];
    exam: {
        id: number;
        name: string;
        status: string;
        term: string | null;
        year: string | null;
        max_score: number;
        start_date: string | null;
        end_date: string | null;
        level?: string;
    } | null;
    filters: { exam: string; class: string; stream: string; student: string };
    students: Option[];
    cards: Card[];
    context: { class_size: number; class_average: number | null; next_term: string | null; term_range: [string, string] | null } | null;
    scale: { grade: string; min: number; max: number; points: number; is_pass: boolean; remark: string | null }[];
    canApprove: boolean;
};

export default function ReportCards({ exams, exam, filters: initial, students, cards, context, scale, canApprove }: Props) {
    const { filters, setFilter } = useFilters(initial);
    const selectedExam = exams.find((e) => String(e.value) === String(filters.exam));
    const classes = selectedExam?.classes ?? [];
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];
    const className = classes.find((c) => String(c.value) === initial.class)?.label ?? '';

    return (
        <>
            <PageHeader
                title="Report Cards"
                subtitle="Printable end-of-exam report cards — one learner per page."
                breadcrumbs={[{ title: 'Exams', href: '/exams' }, { title: 'Report cards' }]}
                actions={cards.length > 0 && <PrintButton label={`Print ${cards.length} card${cards.length > 1 ? 's' : ''}`} />}
            />

            <div className="panel no-print mb-6">
                <FilterBar>
                    <FilterSelect
                        value={filters.exam}
                        onChange={(v) => {
                            setFilter('exam', v);
                            setFilter('class', '');
                            setFilter('stream', '');
                            setFilter('student', '');
                        }}
                        options={exams}
                        placeholder="Select exam"
                        className="sm:min-w-[260px]"
                    />
                    {selectedExam && (
                        <FilterSelect
                            value={filters.class}
                            onChange={(v) => {
                                setFilter('class', v);
                                setFilter('stream', '');
                                setFilter('student', '');
                            }}
                            options={classes}
                            placeholder="Select class"
                        />
                    )}
                    {streams.length > 0 && (
                        <FilterSelect
                            value={filters.stream}
                            onChange={(v) => {
                                setFilter('stream', v);
                                setFilter('student', '');
                            }}
                            options={streams}
                            placeholder="All streams"
                        />
                    )}
                    {students.length > 0 && (
                        <FilterSelect
                            value={filters.student}
                            onChange={(v) => setFilter('student', v)}
                            options={students}
                            placeholder="All learners"
                            className="sm:min-w-[220px]"
                        />
                    )}
                </FilterBar>
                {exam && <ProvisionalNotice exam={exam} canApprove={canApprove} />}
            </div>

            {!exam || !initial.class ? (
                <div className="panel">
                    <EmptyState title="Choose an exam and class" description="Pick a class (and optionally a stream or single learner) to generate report cards." />
                </div>
            ) : cards.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No results for this selection" />
                </div>
            ) : (
                <div className="space-y-6 print:space-y-0">
                    {cards.map((c) => (
                        <ReportCard key={c.id} card={c} exam={exam} className={className} context={context!} scale={scale} />
                    ))}
                </div>
            )}

            <style>{`@media print { .report-card { page-break-after: always; break-after: page; box-shadow: none !important; border: 0 !important; padding: 0 !important; } .report-card:last-child { page-break-after: auto; break-after: auto; } }`}</style>
        </>
    );
}

function ReportCard({
    card: c,
    exam,
    className,
    context,
    scale,
}: {
    card: Card;
    exam: NonNullable<Props['exam']>;
    className: string;
    context: NonNullable<Props['context']>;
    scale: Props['scale'];
}) {
    const { school } = usePage().props;
    const provisional = exam.status !== 'published';
    const aLevel = exam.level === 'a_level';
    // Pre-primary / primary (PSLE / SFNA style): average grade and pass/not passed instead of a division.
    const hasDivision = exam.level === 'o_level' || exam.level === 'a_level';
    const passGrades = scale.filter((g) => g.is_pass).map((g) => g.grade);
    // A-Level: principal subjects first, then subsidiaries.
    const lines = aLevel ? [...c.subjects].sort((a, b) => Number(a.role === 'subsidiary') - Number(b.role === 'subsidiary')) : c.subjects;

    return (
        <div className="panel report-card relative">
            {provisional && (
                <div className="pointer-events-none absolute inset-0 grid place-content-center overflow-hidden">
                    <span className="-rotate-30 text-7xl font-black tracking-widest text-danger/10 uppercase">Provisional</span>
                </div>
            )}
            <Letterhead
                title={hasDivision ? 'Student Progress Report' : 'Pupil Progress Report'}
                meta={
                    <div className="space-y-0.5">
                        <div className="font-bold">{exam.name}</div>
                        <div>{[exam.term, exam.year].filter(Boolean).join(', ')}</div>
                        {school?.name && <div className="text-white-dark">Issued {date(new Date().toISOString().slice(0, 10))}</div>}
                    </div>
                }
            />

            <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <Info label="Name" value={c.full_name} wide />
                <Info label="Admission No." value={c.admission_no} />
                <Info label="Class" value={`${className}${c.stream ? ` ${c.stream}` : ''}`} />
                {aLevel && <Info label="Combination" value={c.combination ?? '—'} />}
                <Info label="Gender" value={c.gender === 'female' ? 'Female' : 'Male'} />
                <Info label="Position" value={c.position ? `${c.position} of ${context.class_size}` : '—'} />
                <Info label="Class teacher" value={c.class_teacher ?? '—'} />
            </div>

            <div className="table-responsive">
                <table className="table-compact table text-sm">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th className="text-end!">Score / {num(exam.max_score)}</th>
                            <th className="text-end!">%</th>
                            <th className="text-center!">Grade</th>
                            {aLevel && <th className="text-center!">Pts</th>}
                            <th>Remark</th>
                            <th>Teacher</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((s) => (
                            <tr key={s.subject} className={cn(s.role === 'subsidiary' && 'text-white-dark')}>
                                <td className="font-semibold">
                                    {s.subject}
                                    {s.role === 'subsidiary' && <span className="ms-1 text-[10px] font-normal uppercase">(Subsidiary – not in division)</span>}
                                </td>
                                <td className="text-end">{s.is_absent ? 'ABS' : s.score !== null ? num(s.score, s.score % 1 ? 1 : 0) : '—'}</td>
                                <td className="text-end">{s.percentage !== null ? s.percentage.toFixed(0) : '—'}</td>
                                <td className={cn('text-center font-bold', s.grade === 'F' && 'text-danger')}>{s.grade ?? '—'}</td>
                                {aLevel && <td className="text-center">{s.role === 'principal' && s.points !== null ? s.points : '—'}</td>}
                                <td>{s.remarks || s.remark || '—'}</td>
                                <td className="text-xs">{s.teacher ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold">
                            <td>{aLevel ? `Principal subjects (${c.sat})` : `Total (${c.sat} subjects)`}</td>
                            <td className="text-end">{num(c.total, c.total % 1 ? 1 : 0)}</td>
                            <td className="text-end">{c.average !== null ? c.average.toFixed(1) : '—'}</td>
                            <td className="text-center">{c.grade ?? '—'}</td>
                            {aLevel && <td className="text-center">{c.points ?? '—'}</td>}
                            <td colSpan={2}>{c.remark ?? ''}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Summary label="Average" value={c.average !== null ? `${c.average.toFixed(1)}%` : '—'} />
                <Summary label="Position" value={c.position ? `${c.position} / ${context.class_size}` : '—'} />
                {hasDivision ? (
                    <Summary
                        label="Division"
                        value={c.division === 'INC' ? 'Incomplete' : (c.division ?? '—')}
                        hint={c.points !== null ? `${c.points} points (${aLevel ? '3 principal subjects' : 'best 7'})` : undefined}
                    />
                ) : (
                    <Summary label="Average grade" value={c.grade ?? '—'} hint={c.average === null ? undefined : c.passed ? 'Pass' : 'Not passed'} />
                )}
                <Summary label="Class average" value={context.class_average !== null ? `${context.class_average}%` : '—'} />
            </div>

            <div className="mt-5 rounded-md border border-white-light p-3 text-sm dark:border-[#1b2e4b]">
                <div className="mb-1 font-bold">Attendance this term</div>
                {c.attendance.days ? (
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span>Days marked: {c.attendance.days}</span>
                        <span>Present: {c.attendance.present}</span>
                        <span>Late: {c.attendance.late}</span>
                        <span>Absent: {c.attendance.absent}</span>
                        <span>Excused: {c.attendance.excused}</span>
                        <span className="font-bold">Attendance: {c.attendance.rate}%</span>
                    </div>
                ) : (
                    <span className="text-white-dark">No attendance recorded for this term.</span>
                )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
                <div>
                    <div className="font-bold">Class teacher's comment</div>
                    <p className="mt-1 min-h-[2.5rem] border-b border-dashed border-white-dark/50 pb-1 italic">{c.comment}</p>
                    <div className="mt-6 flex justify-between text-xs text-white-dark">
                        <span>Signature: ____________________</span>
                        <span>Date: __________</span>
                    </div>
                </div>
                <div>
                    <div className="font-bold">Head of school's comment</div>
                    <p className="mt-1 min-h-[2.5rem] border-b border-dashed border-white-dark/50 pb-1" />
                    <div className="mt-6 flex justify-between text-xs text-white-dark">
                        <span>Signature & stamp: ______________</span>
                        <span>Date: __________</span>
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white-light pt-3 text-xs dark:border-[#1b2e4b]">
                <span className="font-semibold">
                    <FileText className="me-1 inline h-3.5 w-3.5" />
                    Next term opens: <b>{context.next_term ? weekdayDate(context.next_term) : '________________'}</b>
                </span>
                <span className="text-white-dark">
                    Grading: {scale.map((g) => `${g.grade} ${g.min}–${Math.round(g.max)}`).join(' · ')} ·{' '}
                    {!hasDivision
                        ? `Pass: ${passGrades.join(', ')}`
                        : aLevel
                          ? 'Div I 3–9, II 10–12, III 13–17, IV 18–19, 0 20–21 (3 principal subjects)'
                          : 'Div I 7–17, II 18–21, III 22–25, IV 26–33, 0 34–35'}
                </span>
            </div>
        </div>
    );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
    return (
        <div className={cn(wide && 'col-span-2')}>
            <div className="text-xs text-white-dark uppercase">{label}</div>
            <div className="font-bold text-black dark:text-white-light">{value}</div>
        </div>
    );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-md bg-primary-light p-3 text-center dark:bg-primary-dark-light">
            <div className="text-xs font-semibold text-white-dark uppercase">{label}</div>
            <div className="text-xl font-extrabold text-primary">{value}</div>
            {hint && <div className="text-[11px] text-white-dark">{hint}</div>}
        </div>
    );
}
