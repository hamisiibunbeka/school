import { Link, router } from '@inertiajs/react';
import { BarChart3, Keyboard, Lock, Save } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { cn, num } from '@/lib/utils';
import type { Option } from '@/types';

type Row = { id: number; admission_no: string; full_name: string; stream: string | null; score: number | null; is_absent: boolean; remarks: string | null; grade: string | null; entered_by: string | null };
export type ScaleRow = { grade: string; min: number; max: number; points: number; remark: string | null };

type Props = {
    exam: { id: number; name: string; status: string; max_score: number; term: string | null; year: string | null };
    filters: { class: string; stream: string; subject: string };
    classes: (Option & { streams: Option[] })[];
    subjects: Option[];
    roster: Row[];
    canEdit: boolean;
    lockReason: string | null;
    teacher: string | null;
    scale: ScaleRow[];
};

export function gradeFor(scale: ScaleRow[], pct: number | null): ScaleRow | null {
    if (pct === null || Number.isNaN(pct)) return null;
    return scale.find((g) => pct >= g.min && pct <= g.max) ?? scale.find((g) => pct >= g.min) ?? null;
}

export default function MarkEntry({ exam, filters: initial, classes, subjects, roster, canEdit, lockReason, teacher, scale }: Props) {
    const { filters, setFilter } = useFilters(initial);
    const streams = classes.find((c) => String(c.value) === String(filters.class))?.streams ?? [];
    const ready = initial.class && initial.subject;
    const subjectLabel = subjects.find((s) => String(s.value) === initial.subject)?.label;

    return (
        <>
            <PageHeader
                title="Mark Entry"
                subtitle={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        {exam.name} · {[exam.term, exam.year].filter(Boolean).join(', ')} · out of {num(exam.max_score)} <StatusBadge status={exam.status} />
                    </span>
                }
                breadcrumbs={[{ title: 'Exams', href: '/exams' }, { title: exam.name, href: `/exams/${exam.id}` }, { title: 'Marks' }]}
                actions={
                    <Link href={`/exams/${exam.id}/results${initial.class ? `?class=${initial.class}` : ''}`} className="btn btn-outline-success">
                        <BarChart3 className="h-4 w-4" /> Results
                    </Link>
                }
            />

            <div className="panel">
                <FilterBar>
                    <FilterSelect
                        value={filters.class}
                        onChange={(v) => {
                            setFilter('class', v);
                            setFilter('stream', '');
                            setFilter('subject', '');
                        }}
                        options={classes}
                        placeholder="Select class"
                    />
                    {streams.length > 0 && <FilterSelect value={filters.stream} onChange={(v) => setFilter('stream', v)} options={streams} placeholder="All streams" />}
                    {filters.class && <FilterSelect value={filters.subject} onChange={(v) => setFilter('subject', v)} options={subjects} placeholder="Select subject" />}
                </FilterBar>

                {classes.length === 0 ? (
                    <EmptyState title="No classes available" description="You have no subject allocations in the classes sitting this exam." />
                ) : !ready ? (
                    <EmptyState title="Choose a class and subject" description="The roster loads with any marks already saved." />
                ) : (
                    <MarkGrid
                        key={`${initial.class}-${initial.stream}-${initial.subject}-${roster.map((r) => `${r.score}${r.is_absent}`).join('|')}`}
                        exam={exam}
                        roster={roster}
                        canEdit={canEdit}
                        lockReason={lockReason}
                        scale={scale}
                        classId={initial.class}
                        streamId={initial.stream}
                        subjectId={initial.subject}
                        heading={`${classes.find((c) => String(c.value) === initial.class)?.label ?? ''} ${streams.find((s) => String(s.value) === initial.stream)?.label ?? ''} · ${subjectLabel ?? ''}`}
                        teacher={teacher}
                    />
                )}
            </div>
        </>
    );
}

type Entry = { score: string; is_absent: boolean; remarks: string };

function MarkGrid({ exam, roster, canEdit, lockReason, scale, classId, streamId, subjectId, heading, teacher }: {
    exam: Props['exam'];
    roster: Row[];
    canEdit: boolean;
    lockReason: string | null;
    scale: ScaleRow[];
    classId: string;
    streamId: string;
    subjectId: string;
    heading: string;
    teacher: string | null;
}) {
    const initial = useMemo(() => Object.fromEntries(roster.map((r) => [r.id, { score: r.score === null ? '' : String(r.score), is_absent: r.is_absent, remarks: r.remarks ?? '' }])), [roster]);
    const [entries, setEntries] = useState<Record<number, Entry>>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    const set = (id: number, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
    const dirty = roster.some((r) => JSON.stringify(entries[r.id]) !== JSON.stringify(initial[r.id]));
    const invalid = (e: Entry) => e.score !== '' && (Number.isNaN(Number(e.score)) || Number(e.score) < 0 || Number(e.score) > exam.max_score);

    const stats = useMemo(() => {
        const scores = Object.values(entries).filter((e) => !e.is_absent && e.score !== '' && !invalid(e)).map((e) => (Number(e.score) / exam.max_score) * 100);
        return {
            entered: Object.values(entries).filter((e) => e.is_absent || e.score !== '').length,
            absent: Object.values(entries).filter((e) => e.is_absent).length,
            average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
            highest: scores.length ? Math.max(...scores) : null,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries]);

    const onKey = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            inputs.current[index + 1]?.focus();
            inputs.current[index + 1]?.select();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            inputs.current[index - 1]?.focus();
            inputs.current[index - 1]?.select();
        }
    };

    const save = () => {
        const marks = roster
            .filter((r) => entries[r.id].is_absent || entries[r.id].score !== '' || r.score !== null || r.is_absent)
            .map((r) => ({ student_id: r.id, score: entries[r.id].is_absent || entries[r.id].score === '' ? null : Number(entries[r.id].score), is_absent: entries[r.id].is_absent, remarks: entries[r.id].remarks || null }));
        setProcessing(true);
        router.post(
            `/exams/${exam.id}/marks`,
            { school_class_id: classId, stream_id: streamId || null, subject_id: subjectId, marks },
            { preserveScroll: true, onError: setErrors, onSuccess: () => setErrors({}), onFinish: () => setProcessing(false) },
        );
    };

    if (roster.length === 0) return <EmptyState title="No learners found" description="There are no active learners in this class/stream." />;

    const hasInvalid = Object.values(entries).some(invalid);

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h5 className="text-lg font-bold dark:text-white-light">{heading}</h5>
                    <p className="text-xs text-white-dark">Subject teacher: {teacher ?? 'not allocated'}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <span className="badge badge-soft-primary">
                        Entered {stats.entered}/{roster.length}
                    </span>
                    <span className="badge badge-soft-danger">Absent {stats.absent}</span>
                    <span className="badge badge-soft-success">Average {stats.average !== null ? `${stats.average.toFixed(1)}%` : '—'}</span>
                    <span className="badge badge-soft-info">Highest {stats.highest !== null ? `${stats.highest.toFixed(1)}%` : '—'}</span>
                </div>
            </div>

            {lockReason || !canEdit ? (
                <div className="mb-4 flex items-start gap-2 rounded-md bg-warning-light px-4 py-3 text-sm font-semibold text-warning dark:bg-warning-dark-light">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" /> {lockReason ?? 'You cannot edit these marks.'}
                </div>
            ) : (
                <p className="mb-3 flex items-center gap-2 text-xs text-white-dark">
                    <Keyboard className="h-4 w-4" /> Type a score and press <kbd className="rounded border px-1">Enter</kbd> to move to the next learner. Grades update automatically.
                </p>
            )}

            <div className="table-responsive">
                <table className="table-compact table-striped table">
                    <thead>
                        <tr>
                            <th className="w-10">#</th>
                            <th>Learner</th>
                            <th className="w-32 text-end!">Score / {num(exam.max_score)}</th>
                            <th className="text-end!">%</th>
                            <th className="text-center!">Grade</th>
                            <th className="text-center!">Absent</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roster.map((r, i) => {
                            const e = entries[r.id];
                            const bad = invalid(e);
                            const pct = !e.is_absent && e.score !== '' && !bad ? (Number(e.score) / exam.max_score) * 100 : null;
                            const g = gradeFor(scale, pct);
                            const serverError = errors[`marks.${roster.filter((x) => entries[x.id].is_absent || entries[x.id].score !== '' || x.score !== null || x.is_absent).findIndex((x) => x.id === r.id)}.score`];
                            return (
                                <tr key={r.id}>
                                    <td className="text-white-dark">{i + 1}</td>
                                    <td>
                                        <div className="font-semibold">{r.full_name}</div>
                                        <div className="text-xs text-white-dark">
                                            {r.admission_no}
                                            {r.stream && ` · ${r.stream}`}
                                        </div>
                                    </td>
                                    <td className="text-end">
                                        <input
                                            ref={(el) => {
                                                inputs.current[i] = el;
                                            }}
                                            type="number"
                                            inputMode="decimal"
                                            step="0.5"
                                            min={0}
                                            max={exam.max_score}
                                            className={cn('form-input w-24 text-end font-bold', (bad || serverError) && 'border-danger! text-danger')}
                                            value={e.score}
                                            disabled={!canEdit || e.is_absent}
                                            onFocus={(ev) => ev.target.select()}
                                            onKeyDown={(ev) => onKey(ev, i)}
                                            onChange={(ev) => set(r.id, { score: ev.target.value })}
                                            aria-label={`Score for ${r.full_name}`}
                                        />
                                        {(bad || serverError) && <div className="text-xs text-danger">{serverError ?? `0 – ${exam.max_score}`}</div>}
                                    </td>
                                    <td className="text-end">{pct !== null ? pct.toFixed(1) : '—'}</td>
                                    <td className="text-center">
                                        {e.is_absent ? (
                                            <span className="badge badge-soft-dark">ABS</span>
                                        ) : g ? (
                                            <span className={cn('badge', g.points >= Math.max(...scale.map((s) => s.points)) ? 'badge-soft-danger' : g.points <= 1 ? 'badge-soft-success' : 'badge-soft-primary')} title={g.remark ?? ''}>
                                                {g.grade}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="text-center">
                                        <input type="checkbox" className="form-checkbox" checked={e.is_absent} disabled={!canEdit} onChange={(ev) => set(r.id, { is_absent: ev.target.checked, score: ev.target.checked ? '' : e.score })} aria-label="Absent" />
                                    </td>
                                    <td>
                                        <input className="form-input min-w-[140px]" value={e.remarks} disabled={!canEdit} maxLength={255} onChange={(ev) => set(r.id, { remarks: ev.target.value })} placeholder="—" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {canEdit && (
                <div className="sticky bottom-0 z-10 mt-4 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-white-light bg-white px-5 py-4 dark:border-[#1b2e4b] dark:bg-[#0e1726]">
                    <span className={cn('text-sm', dirty ? 'font-semibold text-warning' : 'text-white-dark')}>{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
                    {errors.marks && <span className="form-error">{errors.marks}</span>}
                    <button type="button" className="btn btn-primary" onClick={save} disabled={processing || hasInvalid || !dirty}>
                        <Save className="h-4 w-4" /> {processing ? 'Saving…' : 'Save marks'}
                    </button>
                </div>
            )}
        </div>
    );
}
