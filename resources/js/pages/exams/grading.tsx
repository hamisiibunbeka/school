import { router, useForm } from '@inertiajs/react';
import { AlertTriangle, Info, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { Checkbox, FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import Tabs from '@/components/ui/tabs';

type Grade = { id: number; grade: string; min_score: number; max_score: number; points: number; is_pass: boolean; remark: string | null };
type Props = { grades: Grade[]; gaps: [number, number][]; canManage: boolean; level: string; levels: { value: string; label: string }[]; usesDivision: boolean };

const blank = { education_level: 'o_level', grade: '', min_score: '' as number | string, max_score: '' as number | string, points: '' as number | string, is_pass: true, remark: '' };

/** Short tab names per level (the exam each scale mirrors). */
const tabLabel: Record<string, string> = { pre_primary: 'Pre-primary', primary: 'Primary (PSLE / SFNA)', o_level: 'O-Level (CSEE)', a_level: 'A-Level (ACSEE)' };

export default function Grading({ grades, gaps, canManage, level, levels, usesDivision }: Props) {
    const aLevel = level === 'a_level';
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Grade | null>(null);
    const form = useForm(blank);

    const openForm = (g: Grade | null) => {
        setEditing(g);
        form.clearErrors();
        form.setData(
            g
                ? { education_level: level, grade: g.grade, min_score: g.min_score, max_score: g.max_score, points: g.points, is_pass: g.is_pass, remark: g.remark ?? '' }
                : { ...blank, education_level: level },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/exams/grading/${editing.id}`, opts);
        else form.post('/exams/grading', opts);
    };

    const columns: Column<Grade>[] = [
        { key: 'grade', header: 'Grade', render: (g) => <span className="badge badge-soft-primary px-3 text-base font-extrabold">{g.grade}</span> },
        {
            key: 'range',
            header: 'Score range (%)',
            render: (g) => (
                <span className="font-semibold">
                    {g.min_score} – {g.max_score}
                </span>
            ),
        },
        {
            key: 'bar',
            header: '',
            render: (g) => (
                <div className="relative h-2 w-40 rounded-full bg-white-light dark:bg-[#1b2e4b]">
                    <div className="absolute h-2 rounded-full bg-primary" style={{ left: `${g.min_score}%`, width: `${Math.max(1, g.max_score - g.min_score)}%` }} />
                </div>
            ),
        },
        { key: 'points', header: 'Points', align: 'right', render: (g) => g.points },
        {
            key: 'pass',
            header: 'Result',
            render: (g) => (g.is_pass ? <span className="badge badge-soft-success">Pass</span> : <span className="badge badge-soft-danger">Not a pass</span>),
        },
        { key: 'remark', header: 'Remark', render: (g) => g.remark ?? '—' },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (g) => (canManage ? <RowActions onEdit={() => openForm(g)} destroy={`/exams/grading/${g.id}`} label="grade" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Grading Scale"
                subtitle="Percentage boundaries, grades, points and pass grades used to grade marks, average grades and divisions."
                breadcrumbs={[{ title: 'Exams', href: '/exams' }, { title: 'Grading' }]}
                actions={
                    canManage && (
                        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Add grade
                        </button>
                    )
                }
            />

            <Tabs
                active={level}
                onChange={(k) => router.get('/exams/grading', { level: k }, { preserveScroll: true })}
                tabs={levels.map((l) => ({ key: l.value, label: tabLabel[l.value] ?? l.label }))}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    {gaps.length > 0 && (
                        <div className="mb-4 flex items-start gap-2 rounded-md bg-warning-light px-4 py-3 text-sm font-semibold text-warning dark:bg-warning-dark-light">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            Scores in {gaps.map(([a, b]) => `${a}–${b}%`).join(', ')} are not covered by any grade — they will fall back to the nearest lower grade.
                        </div>
                    )}
                    <DataTable columns={columns} rows={grades} empty="No grades defined" emptyDescription="Add grade boundaries covering 0–100%." />
                </div>
                <div className="panel h-fit text-sm">
                    <h5 className="mb-3 flex items-center gap-2 text-lg font-bold dark:text-white-light">
                        <Info className="h-5 w-5 text-info" /> How grading works
                    </h5>
                    <ul className="list-disc space-y-2 ps-5 text-white-dark">
                        <li>Each mark is converted to a percentage of the exam's maximum score and graded with this scale.</li>
                        <li>
                            The grade and points are stored with the mark when it is saved. Changing this scale does <b>not</b> silently change published results.
                        </li>
                        <li>Lower points are better. Grades marked “Pass” count as a pass; the pass mark is the lowest boundary of those grades.</li>
                        {!usesDivision ? (
                            <>
                                <li>
                                    No divisions at this level (NECTA PSLE / SFNA style): each subject gets a grade, and the learner&apos;s average (mean % of subjects sat) gives
                                    the <b>average grade</b>.
                                </li>
                                <li>A learner passes with a pass grade (A–C by default). Position is by average, then total marks.</li>
                            </>
                        ) : aLevel ? (
                            <>
                                <li>
                                    Division = total points of the 3 principal subjects of the learner&apos;s combination: I (3–9), II (10–12), III (13–17), IV (18–19), 0 (20–21).
                                </li>
                                <li>
                                    Subsidiary subjects (e.g. Academic Communication, Historia ya Tanzania na Maadili, BAM) are graded with this scale but never counted in the
                                    division. S is a subsidiary pass. Which subjects are principal or subsidiary is set under Academics → Subjects.
                                </li>
                            </>
                        ) : (
                            <li>Division = total points of a learner&apos;s best 7 subjects: I (7–17), II (18–21), III (22–25), IV (26–33), 0 (34–35).</li>
                        )}
                        <li>Ranges cannot overlap.</li>
                    </ul>
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit grade ${editing.grade}` : 'Add grade'}>
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input
                            label="Grade"
                            required
                            maxLength={5}
                            value={form.data.grade}
                            onChange={(e) => form.setData('grade', e.target.value.toUpperCase())}
                            error={form.errors.grade}
                        />
                        <Input
                            label="Points"
                            type="number"
                            step="0.5"
                            min={0}
                            required
                            value={form.data.points}
                            onChange={(e) => form.setData('points', e.target.value)}
                            error={form.errors.points}
                        />
                        <Input
                            label="Minimum %"
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            required
                            value={form.data.min_score}
                            onChange={(e) => form.setData('min_score', e.target.value)}
                            error={form.errors.min_score}
                        />
                        <Input
                            label="Maximum %"
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            required
                            value={form.data.max_score}
                            onChange={(e) => form.setData('max_score', e.target.value)}
                            error={form.errors.max_score}
                        />
                        <Input
                            label="Remark"
                            placeholder="e.g. Excellent"
                            value={form.data.remark}
                            onChange={(e) => form.setData('remark', e.target.value)}
                            error={form.errors.remark}
                            wrapperClassName="sm:col-span-2"
                        />
                    </FormGrid>
                    <Checkbox label="This grade is a pass" checked={form.data.is_pass} onChange={(e) => form.setData('is_pass', e.target.checked)} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save grade
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
