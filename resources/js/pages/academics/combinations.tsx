import { Link, router, useForm } from '@inertiajs/react';
import { BookMarked, GraduationCap, Layers, Lock, Pencil, Plus, Scale, Sparkles, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, num } from '@/lib/utils';
import type { Option } from '@/types';

type SubjectRef = { id: number; name: string | null; code: string | null };
type Row = {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    notes: string | null;
    principal: SubjectRef[];
    optional: SubjectRef[];
    streams: string[];
    students: number;
};
type ClassRules = { id: number; name: string; pinned: boolean; label: string; compulsory: SubjectRef[]; average: 'all' | 'principal'; students: number };
type Props = {
    combinations: Row[];
    principalSubjects: Option[];
    optionalSubjects: Option[];
    current: { compulsory: SubjectRef[]; average: 'all' | 'principal' };
    classes: ClassRules[];
    newSystemReady: boolean;
    standardCount: number;
};

const blank = { code: '', name: '', principal_subject_ids: ['', '', ''], optional_subject_ids: [] as string[], is_active: true, notes: '' };
const averageLabel = { all: 'all subjects', principal: 'principal subjects only' } as const;

function SubjectBadges({ subjects, tone }: { subjects: SubjectRef[]; tone: string }) {
    if (!subjects.length) return <span className="text-xs text-white-dark">None</span>;
    return (
        <span className="inline-flex flex-wrap gap-1">
            {subjects.map((s) => (
                <span key={s.id} className={cn('badge', tone)} title={s.name ?? ''}>
                    {s.code ?? s.name}
                </span>
            ))}
        </span>
    );
}

export default function Combinations({ combinations, principalSubjects, optionalSubjects, current, classes, newSystemReady, standardCount }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const [editing, setEditing] = useState<Row | 'new' | null>(null);
    const [adopting, setAdopting] = useState(false);
    const form = useForm(blank);
    const adopt = useForm({ class_ids: classes.slice(0, 1).map((c) => c.id) });
    const errors = form.errors as Record<string, string>;
    const anyPinned = classes.some((c) => c.pinned);

    const open = (row: Row | 'new') => {
        form.clearErrors();
        form.setData(
            row === 'new'
                ? blank
                : {
                      code: row.code,
                      name: row.name,
                      principal_subject_ids: [0, 1, 2].map((i) => (row.principal[i] ? String(row.principal[i].id) : '')),
                      optional_subject_ids: row.optional.map((s) => String(s.id)),
                      is_active: row.is_active,
                      notes: row.notes ?? '',
                  },
        );
        setEditing(row);
    };

    const setPrincipal = (i: number, value: string) =>
        form.setData(
            'principal_subject_ids',
            form.data.principal_subject_ids.map((v, idx) => (idx === i ? value : v)),
        );
    const toggleOptional = (id: string, on: boolean) =>
        form.setData('optional_subject_ids', on ? [...form.data.optional_subject_ids, id] : form.data.optional_subject_ids.filter((x) => x !== id));

    // Suggest a name from the chosen subjects, e.g. "Physics, Chemistry, Advanced Mathematics".
    const suggestedName = form.data.principal_subject_ids
        .map((id) => principalSubjects.find((s) => String(s.value) === id)?.label.replace(/\s*\(.*\)$/, ''))
        .filter(Boolean)
        .join(', ');

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setEditing(null) };
        if (editing === 'new') form.post('/academics/combinations', opts);
        else if (editing) form.put(`/academics/combinations/${editing.id}`, opts);
    };

    const seed = async () => {
        const { confirmed } = await confirm({
            title: 'Add the standard combinations?',
            text: `Adds ${standardCount} long-established combinations (PCM, PCB, CBG, HGL, ECA …) with any missing subjects. Existing codes are skipped. Review which ones take BAM afterwards.`,
            confirmText: 'Add combinations',
        });
        if (confirmed) router.post('/academics/combinations/standard', {}, { preserveScroll: true });
    };

    const remove = async (row: Row) => {
        const { confirmed } = await confirm({ title: `Delete ${row.code}?`, text: 'Only possible when no stream uses it.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/academics/combinations/${row.id}`, { preserveScroll: true });
    };

    const setClassMode = async (c: ClassRules, mode: 'current' | 'keep') => {
        const { confirmed } = await confirm({
            title: mode === 'current' ? `${c.name}: follow the current rules?` : `${c.name}: keep its present rules?`,
            text:
                mode === 'current'
                    ? `${c.name} will take ${current.compulsory.map((s) => s.code ?? s.name).join(', ') || 'no compulsory subsidiaries'} and average ${averageLabel[current.average]}. Unpublished exams follow the change; published results do not.`
                    : `${c.name} keeps its present subsidiaries and average even if the school's rules change later — for students who started on an older system and should finish on it.`,
            confirmText: 'Confirm',
        });
        if (confirmed) router.put(`/academics/a-level-rules/classes/${c.id}`, { mode }, { preserveScroll: true });
    };

    const setAverage = (average: 'all' | 'principal') => router.put('/academics/a-level-rules/average', { average }, { preserveScroll: true });

    const submitAdopt = (e: FormEvent) => {
        e.preventDefault();
        adopt.post('/academics/a-level-rules/adopt', { preserveScroll: true, onSuccess: () => setAdopting(false) });
    };

    const columns: Column<Row>[] = [
        {
            key: 'code',
            header: 'Combination',
            render: (c) => (
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            'grid h-10 min-w-12 place-content-center rounded-lg px-2 font-extrabold',
                            c.is_active ? 'bg-primary-light text-primary dark:bg-primary-dark-light' : 'bg-white-light text-white-dark',
                        )}
                    >
                        {c.code}
                    </span>
                    <div>
                        <div className="font-semibold text-black dark:text-white-light">{c.name}</div>
                        {!c.is_active && <span className="badge badge-soft-dark">Inactive</span>}
                    </div>
                </div>
            ),
        },
        {
            key: 'principal',
            header: 'Principal subjects',
            render: (c) => (
                <div className="flex flex-wrap gap-1">
                    {c.principal.map((s) => (
                        <span key={s.id} className="badge badge-soft-primary">
                            {s.name}
                        </span>
                    ))}
                </div>
            ),
        },
        { key: 'optional', header: 'Optional subsidiary', render: (c) => <SubjectBadges subjects={c.optional} tone="badge-outline-info" /> },
        {
            key: 'streams',
            header: 'Streams',
            render: (c) => (c.streams.length ? <span className="text-sm">{c.streams.join(', ')}</span> : <span className="text-xs text-white-dark">Not linked yet</span>),
        },
        { key: 'students', header: 'Students', align: 'center', render: (c) => num(c.students) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) =>
                manage && (
                    <div className="flex justify-end gap-1">
                        <button className="grid h-8 w-8 place-content-center rounded-md text-primary hover:bg-primary-light" title="Edit" onClick={() => open(c)}>
                            <Pencil className="h-4 w-4" />
                        </button>
                        <button className="grid h-8 w-8 place-content-center rounded-md text-danger hover:bg-danger-light" title="Delete" onClick={() => remove(c)}>
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Combinations (A-Level)"
                subtitle="Form V–VI subject combinations (tahasusi): three principal subjects plus any optional subsidiary such as BAM. Compulsory subsidiaries come from each class's rules below."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Combinations' }]}
                actions={
                    manage && (
                        <>
                            <button className="btn btn-outline-primary" onClick={seed}>
                                <Sparkles className="h-4 w-4" /> Add standard combinations
                            </button>
                            <button className="btn btn-primary" onClick={() => open('new')}>
                                <Plus className="h-4 w-4" /> New combination
                            </button>
                        </>
                    )
                }
            />

            {!newSystemReady && manage && classes.length > 0 && (
                <div className="mb-6 flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-light p-4 sm:flex-row sm:items-center dark:bg-warning-dark-light">
                    <Sparkles className="h-6 w-6 shrink-0 text-warning" />
                    <div className="flex-1 text-sm text-black dark:text-white-light">
                        <div className="font-bold">New A-Level system for the new intake</div>
                        General Studies is abolished; <strong>Academic Communication</strong> and <strong>Historia ya Tanzania na Maadili</strong> are compulsory subsidiaries (BAM
                        stays optional) and the average counts all subjects. Switch the new intake now — other classes keep their present rules until they finish.
                    </div>
                    <button className="btn btn-warning shrink-0" onClick={() => setAdopting(true)}>
                        Switch new intake
                    </button>
                </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Combinations" value={num(combinations.length)} icon={BookMarked} tone="primary" hint={`${combinations.filter((c) => c.is_active).length} active`} />
                <StatCard title="Linked streams" value={num(combinations.reduce((a, c) => a + c.streams.length, 0))} icon={Layers} tone="secondary" />
                <StatCard title="A-Level students" value={num(combinations.reduce((a, c) => a + c.students, 0))} icon={Users} tone="success" />
                <StatCard title="Take an optional subsidiary" value={num(combinations.filter((c) => c.optional.length).length)} icon={BookMarked} tone="info" />
            </div>

            {/* Rules per class */}
            <div className="panel mb-6">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h5 className="flex items-center gap-2 text-lg font-bold">
                            <Scale className="h-5 w-5 text-primary" /> A-Level rules
                        </h5>
                        <p className="text-sm text-white-dark">
                            Current rules: compulsory subsidiaries <SubjectBadges subjects={current.compulsory} tone="badge-soft-secondary" /> · average counts{' '}
                            <strong>{averageLabel[current.average]}</strong>. Subject roles are set under{' '}
                            <Link href="/academics/subjects" className="text-primary hover:underline">
                                Subjects
                            </Link>
                            .
                        </p>
                    </div>
                    {manage && (
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-white-dark">Average counts</span>
                            <select className="form-select w-auto" value={current.average} onChange={(e) => setAverage(e.target.value as 'all' | 'principal')} aria-label="Average counts">
                                <option value="all">All subjects</option>
                                <option value="principal">Principal subjects only</option>
                            </select>
                        </div>
                    )}
                </div>

                {classes.length === 0 ? (
                    <p className="text-sm text-white-dark">No A-Level classes yet. Mark Form Five / Form Six as A-Level under Classes & Streams.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {classes.map((c) => (
                            <div key={c.id} className={cn('rounded-md border p-4', c.pinned ? 'border-warning/40 bg-warning-light/40 dark:bg-warning-dark-light' : 'border-success/40 bg-success-light/40 dark:bg-success-dark-light')}>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 font-bold">
                                        <GraduationCap className="h-4 w-4" /> {c.name}
                                        <span className="text-xs font-normal text-white-dark">{num(c.students)} students</span>
                                    </div>
                                    {c.pinned ? (
                                        <span className="badge badge-soft-warning inline-flex items-center gap-1">
                                            <Lock className="h-3 w-3" /> {c.label}
                                        </span>
                                    ) : (
                                        <span className="badge badge-soft-success">Current rules</span>
                                    )}
                                </div>
                                <div className="text-sm">
                                    Compulsory subsidiaries: <SubjectBadges subjects={c.compulsory} tone="badge-soft-secondary" />
                                </div>
                                <div className="text-sm">
                                    Average counts: <strong>{averageLabel[c.average]}</strong>
                                </div>
                                {manage && (
                                    <div className="mt-3">
                                        {c.pinned ? (
                                            <button className="btn btn-sm btn-outline-success" onClick={() => setClassMode(c, 'current')}>
                                                Follow current rules
                                            </button>
                                        ) : (
                                            <button className="btn btn-sm btn-outline-warning" onClick={() => setClassMode(c, 'keep')}>
                                                <Lock className="h-3.5 w-3.5" /> Keep these rules
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <p className="mt-4 text-xs text-white-dark">
                    Division (NECTA ACSEE): points of the best 3 principal subjects, A=1 … F=7 — I: 3–9, II: 10–12, III: 13–17, IV: 18–19, 0: 20–21. Subsidiaries never count towards
                    the division. Position: division points first (I.3 is above I.4), then average, then total marks; equal on all three share the position. Published results keep the
                    rules they were published with. When students are promoted, the next class takes on their rules{anyPinned ? ' — so the old system ends when the last students who started on it finish Form Six' : ''}.
                </p>
            </div>

            <div className="panel">
                <DataTable
                    columns={columns}
                    rows={combinations}
                    empty="No combinations yet"
                    emptyDescription="Click “Add standard combinations” for PCM, PCB, CBG, HGL and the others, or create your own (e.g. HGFa, HGLi)."
                />
            </div>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New combination' : `Edit ${editing ? editing.code : ''}`} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Code" required placeholder="e.g. PCM or HGFa" value={form.data.code} onChange={(e) => form.setData('code', e.target.value)} error={form.errors.code} />
                        <Input
                            label="Name"
                            required
                            placeholder={suggestedName || 'e.g. Physics, Chemistry, Advanced Mathematics'}
                            value={form.data.name}
                            onChange={(e) => form.setData('name', e.target.value)}
                            onFocus={() => !form.data.name && suggestedName && form.setData('name', suggestedName)}
                            error={form.errors.name}
                        />
                    </FormGrid>
                    <Field
                        label="Principal subjects (3)"
                        required
                        error={errors.principal_subject_ids ?? errors['principal_subject_ids.0'] ?? errors['principal_subject_ids.1'] ?? errors['principal_subject_ids.2']}
                        help={principalSubjects.length < 3 ? 'Mark subjects as “Principal subject” under Academics → Subjects first.' : undefined}
                    >
                        <FormGrid cols={3}>
                            {[0, 1, 2].map((i) => (
                                <Select
                                    key={i}
                                    placeholder={`Subject ${i + 1}`}
                                    options={principalSubjects.filter(
                                        (s) => !form.data.principal_subject_ids.includes(String(s.value)) || form.data.principal_subject_ids[i] === String(s.value),
                                    )}
                                    value={form.data.principal_subject_ids[i]}
                                    onChange={(e) => setPrincipal(i, e.target.value)}
                                />
                            ))}
                        </FormGrid>
                    </Field>
                    <div className="rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                        <div className="mb-2 text-xs font-bold tracking-wide text-white-dark uppercase">Subsidiary subjects</div>
                        <div className="mb-3 text-sm">
                            Compulsory for every student (from each class's rules): <SubjectBadges subjects={current.compulsory} tone="badge-soft-secondary" />
                        </div>
                        {optionalSubjects.length === 0 ? (
                            <p className="text-xs text-white-dark">No optional subsidiaries defined. Mark one (e.g. BAM) as “Optional subsidiary” under Subjects.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {optionalSubjects.map((s) => (
                                    <Checkbox
                                        key={s.value}
                                        label={`Students in this combination also take ${s.label}`}
                                        checked={form.data.optional_subject_ids.includes(String(s.value))}
                                        onChange={(e) => toggleOptional(String(s.value), e.target.checked)}
                                    />
                                ))}
                                <p className="text-xs text-white-dark">BAM is usually taken by combinations without Advanced Mathematics, e.g. PCB, CBG, ECA.</p>
                            </div>
                        )}
                        {errors.optional_subject_ids && <p className="form-error mt-1">{errors.optional_subject_ids}</p>}
                    </div>
                    <Input label="Notes" value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={form.errors.notes} />
                    <Checkbox label="Active (offered at this school)" checked={form.data.is_active} onChange={(e) => form.setData('is_active', e.target.checked)} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save combination
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={adopting} onClose={() => setAdopting(false)} title="Switch the new intake to the new A-Level system">
                <form onSubmit={submitAdopt} className="space-y-4">
                    <ul className="list-disc space-y-1 ps-5 text-sm">
                        <li>
                            Adds <strong>Academic Communication</strong> and <strong>Historia ya Tanzania na Maadili</strong> as compulsory subsidiaries.
                        </li>
                        <li>Retires General Studies from the current rules (its past marks and published results stay).</li>
                        <li>The average counts all subjects; BAM stays optional per combination.</li>
                    </ul>
                    <Field label="Classes starting the new system" required error={(adopt.errors as Record<string, string>).class_ids}>
                        <div className="space-y-1.5">
                            {classes.map((c) => (
                                <Checkbox
                                    key={c.id}
                                    label={`${c.name} (${num(c.students)} students)`}
                                    checked={adopt.data.class_ids.includes(c.id)}
                                    onChange={(e) => adopt.setData('class_ids', e.target.checked ? [...adopt.data.class_ids, c.id] : adopt.data.class_ids.filter((x) => x !== c.id))}
                                />
                            ))}
                        </div>
                    </Field>
                    <p className="text-xs text-white-dark">
                        Classes not ticked keep their present rules (General Studies) until their students leave. Teacher allocations for the new subjects are created per stream.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setAdopting(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={adopt.processing}>
                            Switch selected classes
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
