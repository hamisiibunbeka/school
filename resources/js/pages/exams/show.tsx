import { Link } from '@inertiajs/react';
import { BarChart3, CalendarDays, FileText, History, Lock, NotebookPen, Pencil } from 'lucide-react';
import { useState } from 'react';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cn, date, dateTime, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import ExamFormModal, { type ExamRow, type TermOption } from './_components/exam-form';
import { WorkflowActions, WorkflowSteps } from './_components/workflow';

type Progress = {
    subjects: { id: number; name: string; code: string }[];
    rows: { class_id: number; class: string; expected: number; cells: Record<number, { entered: number; percent: number } | null> }[];
    overall: number;
};

type Props = {
    exam: ExamRow & { published_by: string | null };
    progress: Progress;
    history: { id: number; action: string; description: string | null; user: string | null; created_at: string }[];
    canApprove: boolean;
    canEnter: boolean;
    myAllocations: { class_id: number; stream_id: number | null; subject_id: number; label: string }[] | null;
    years: Option[];
    terms: TermOption[];
    classes: Option[];
    types: Option[];
};

function cellTone(p: number) {
    if (p >= 100) return 'bg-success text-white';
    if (p >= 50) return 'bg-warning-light text-warning dark:bg-warning-dark-light';
    if (p > 0) return 'bg-danger-light text-danger dark:bg-danger-dark-light';
    return 'bg-white-light/50 text-white-dark dark:bg-[#1b2e4b]/50';
}

export default function ExamShow({ exam, progress, history, canApprove, canEnter, myAllocations, years, terms, classes, types }: Props) {
    const can = useCan();
    const [editing, setEditing] = useState(false);
    const enterable = canEnter && can('exams.manage');

    return (
        <>
            <PageHeader
                title={exam.name}
                subtitle={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        <StatusBadge status={exam.status} /> {titleCase(exam.type)} · {[exam.term, exam.year].filter(Boolean).join(', ')}
                    </span>
                }
                breadcrumbs={[{ title: 'Exams', href: '/exams' }, { title: exam.name }]}
                actions={
                    <>
                        {enterable && (
                            <Link href={`/exams/${exam.id}/marks`} className="btn btn-primary">
                                <NotebookPen className="h-4 w-4" /> Enter marks
                            </Link>
                        )}
                        {exam.status !== 'draft' && (
                            <Link href={`/exams/${exam.id}/results`} className="btn btn-outline-success">
                                <BarChart3 className="h-4 w-4" /> Results
                            </Link>
                        )}
                        {exam.status !== 'draft' && (
                            <Link href={`/exams/report-cards?exam=${exam.id}`} className="btn btn-outline-primary">
                                <FileText className="h-4 w-4" /> Report cards
                            </Link>
                        )}
                        {canApprove && exam.status !== 'published' && (
                            <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(true)}>
                                <Pencil className="h-4 w-4" /> Edit
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                        <h5 className="text-lg font-bold dark:text-white-light">Results workflow</h5>
                        {canApprove && (
                            <div className="flex flex-wrap gap-2">
                                <WorkflowActions examId={exam.id} status={exam.status} small />
                            </div>
                        )}
                    </div>
                    <WorkflowSteps status={exam.status} />
                    <div className="mt-6 rounded-md bg-white-light/40 p-4 text-sm dark:bg-[#1b2e4b]/40">
                        {exam.status === 'draft' && 'The exam is being set up. Open mark entry when papers have been marked.'}
                        {exam.status === 'marks_entry' && 'Teachers are entering marks for their allocated classes and subjects. When the progress matrix is complete, close entry and send to moderation.'}
                        {exam.status === 'moderation' && 'Marks are closed to teachers. Moderators review the analysis, adjust marks where needed, then approve and publish.'}
                        {exam.status === 'published' && (
                            <span className="flex items-start gap-2">
                                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                                Published {dateTime(exam.published_at)}
                                {exam.published_by && ` by ${exam.published_by}`}. Results are locked; corrections require unpublishing with a reason.
                            </span>
                        )}
                        {!canApprove && exam.status !== 'published' && <div className="mt-2 text-xs text-white-dark">Only the principal / academic administrators can move the exam between stages.</div>}
                    </div>
                </div>
                <div className="panel">
                    <h5 className="mb-2 text-lg font-bold dark:text-white-light">Mark entry progress</h5>
                    <Chart
                        type="radialBar"
                        height={210}
                        series={[progress.overall]}
                        options={{
                            colors: [progress.overall >= 100 ? '#00ab55' : '#4361ee'],
                            plotOptions: { radialBar: { hollow: { size: '62%' }, dataLabels: { name: { show: false }, value: { fontSize: '26px', fontWeight: 800, offsetY: 8, formatter: (v: number) => `${v}%` } } } },
                        }}
                    />
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-white-dark">Dates</dt>
                            <dd className="flex items-center gap-1 font-semibold">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {exam.start_date ? `${date(exam.start_date)} – ${date(exam.end_date)}` : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-white-dark">Max score · Weight</dt>
                            <dd className="font-semibold">
                                {num(exam.max_score)} · {num(exam.weight)}%
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            {myAllocations && (
                <div className="panel mb-6">
                    <h5 className="mb-3 text-lg font-bold dark:text-white-light">My subjects in this exam</h5>
                    {myAllocations.length ? (
                        <div className="flex flex-wrap gap-2">
                            {myAllocations.map((a) => (
                                <Link
                                    key={`${a.class_id}-${a.stream_id}-${a.subject_id}`}
                                    href={`/exams/${exam.id}/marks?class=${a.class_id}${a.stream_id ? `&stream=${a.stream_id}` : ''}&subject=${a.subject_id}`}
                                    className={cn('btn btn-sm', enterable ? 'btn-outline-primary' : 'btn-outline-dark pointer-events-none opacity-60')}
                                >
                                    <NotebookPen className="h-3.5 w-3.5" /> {a.label}
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-white-dark">You have no subject allocations in the classes sitting this exam.</p>
                    )}
                </div>
            )}

            <div className="panel mb-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-lg font-bold dark:text-white-light">Completion by class × subject</h5>
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="badge bg-success text-white">Complete</span>
                        <span className="badge badge-soft-warning">≥ 50%</span>
                        <span className="badge badge-soft-danger">Started</span>
                        <span className="badge badge-soft-dark">Not started</span>
                    </div>
                </div>
                {progress.rows.length === 0 ? (
                    <EmptyState title="No classes attached" />
                ) : (
                    <div className="table-responsive">
                        <table className="table-compact table">
                            <thead>
                                <tr>
                                    <th>Class</th>
                                    <th className="text-end!">Learners</th>
                                    {progress.subjects.map((s) => (
                                        <th key={s.id} className="text-center!" title={s.name}>
                                            {s.code}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {progress.rows.map((r) => (
                                    <tr key={r.class_id}>
                                        <td className="font-bold whitespace-nowrap">{r.class}</td>
                                        <td className="text-end">{r.expected}</td>
                                        {progress.subjects.map((s) => {
                                            const c = r.cells[s.id];
                                            if (!c) return <td key={s.id} className="text-center text-white-dark">·</td>;
                                            const body = (
                                                <span className={cn('inline-block min-w-[52px] rounded px-2 py-1 text-xs font-bold', cellTone(c.percent))} title={`${c.entered} of ${r.expected} entered`}>
                                                    {c.percent}%
                                                </span>
                                            );
                                            return (
                                                <td key={s.id} className="text-center">
                                                    {enterable ? <Link href={`/exams/${exam.id}/marks?class=${r.class_id}&subject=${s.id}`}>{body}</Link> : body}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="panel">
                <h5 className="mb-4 flex items-center gap-2 text-lg font-bold dark:text-white-light">
                    <History className="h-5 w-5" /> Audit trail
                </h5>
                {history.length === 0 ? (
                    <p className="text-sm text-white-dark">No activity yet.</p>
                ) : (
                    <ol className="relative ms-2 border-s border-white-light dark:border-[#1b2e4b]">
                        {history.map((h) => (
                            <li key={h.id} className="ms-5 pb-4 last:pb-0">
                                <span className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary dark:border-[#0e1726]" />
                                <div className="text-sm font-semibold">{h.description}</div>
                                <div className="text-xs text-white-dark">
                                    {h.user ?? 'System'} · {dateTime(h.created_at)} · <span className="uppercase">{h.action.replace('_', ' ')}</span>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <ExamFormModal open={editing} onClose={() => setEditing(false)} exam={exam} years={years} terms={terms} classes={classes} types={types} />
        </>
    );
}
