import { Link, router, useForm } from '@inertiajs/react';
import { BookOpen, GraduationCap, Layers, Pencil, Plus, School, Trash2, UserRound, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import EmptyState from '@/components/ui/empty-state';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, num } from '@/lib/utils';
import type { Option } from '@/types';
import ImportButton from '@/components/ui/import-button';

type StreamRow = {
    id: number;
    name: string;
    capacity: number | null;
    class_teacher_id: number | null;
    class_teacher: string | null;
    students: number;
    combination_id: number | null;
    combination: string | null;
    combination_name: string | null;
};
type ClassRow = {
    id: number;
    name: string;
    code: string | null;
    level: number;
    education_level: string;
    capacity: number | null;
    students: number;
    boys: number;
    girls: number;
    subjects: number;
    streams: StreamRow[];
};

const palette = [
    'from-[#4361ee] to-[#805dca]',
    'from-[#00ab55] to-[#2196f3]',
    'from-[#e2a03f] to-[#e7515a]',
    'from-[#805dca] to-[#ef1262]',
    'from-[#2196f3] to-[#00ab55]',
    'from-[#3b3f5c] to-[#4361ee]',
];

function Usage({ used, capacity }: { used: number; capacity: number | null }) {
    const pct = capacity ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
    const tone = pct >= 100 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-success';
    return (
        <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-white-dark">
                <span>
                    {num(used)} {capacity ? `/ ${num(capacity)}` : ''} learners
                </span>
                {capacity ? <span>{pct}%</span> : <span>No cap</span>}
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#ebedf2] dark:bg-dark/40">
                <div className={cn('h-1.5 rounded-full', tone)} style={{ width: `${capacity ? pct : 0}%` }} />
            </div>
        </div>
    );
}

const levelName: Record<string, string> = { pre_primary: 'Pre-primary', primary: 'Primary', o_level: 'O-Level', a_level: 'A-Level' };

export default function Classes({ classes, teachers, levels, combinations }: { classes: ClassRow[]; teachers: Option[]; levels: Option[]; combinations: Option[] }) {
    const can = useCan();
    const manage = can('academics.manage');
    const [classModal, setClassModal] = useState<{ open: boolean; row: ClassRow | null }>({ open: false, row: null });
    const [streamModal, setStreamModal] = useState<{ open: boolean; cls: ClassRow | null; row: StreamRow | null }>({ open: false, cls: null, row: null });
    const classForm = useForm({ name: '', code: '', level: '1', education_level: 'o_level', capacity: '', streams: 'A, B' });
    const streamForm = useForm({ name: '', capacity: '', class_teacher_id: '', combination_id: '' });
    const streamIsALevel = streamModal.cls?.education_level === 'a_level';

    const totals = {
        students: classes.reduce((a, c) => a + c.students, 0),
        streams: classes.reduce((a, c) => a + c.streams.length, 0),
        capacity: classes.reduce((a, c) => a + (c.capacity ?? 0), 0),
        noTeacher: classes.flatMap((c) => c.streams).filter((s) => !s.class_teacher_id).length,
    };

    const openClass = (row: ClassRow | null) => {
        classForm.clearErrors();
        classForm.setData(
            row
                ? {
                      name: row.name,
                      code: row.code ?? '',
                      level: String(row.level),
                      education_level: row.education_level,
                      capacity: row.capacity ? String(row.capacity) : '',
                      streams: '',
                  }
                : {
                      name: '',
                      code: '',
                      level: String((classes.at(-1)?.level ?? 0) + 1),
                      // Continue the level of the last class (e.g. Standard IV → Standard V stays Primary).
                      education_level: classes.at(-1)?.education_level ?? String(levels[0]?.value ?? 'o_level'),
                      capacity: '',
                      streams: 'A, B',
                  },
        );
        setClassModal({ open: true, row });
    };

    const openStream = (cls: ClassRow, row: StreamRow | null) => {
        streamForm.clearErrors();
        streamForm.setData(
            row
                ? {
                      name: row.name,
                      capacity: row.capacity ? String(row.capacity) : '',
                      class_teacher_id: row.class_teacher_id ? String(row.class_teacher_id) : '',
                      combination_id: row.combination_id ? String(row.combination_id) : '',
                  }
                : { name: '', capacity: '', class_teacher_id: '', combination_id: '' },
        );
        setStreamModal({ open: true, cls, row });
    };

    const submitClass = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setClassModal({ open: false, row: null }) };
        if (classModal.row) classForm.put(`/academics/classes/${classModal.row.id}`, opts);
        else classForm.post('/academics/classes', opts);
    };

    const submitStream = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setStreamModal({ open: false, cls: null, row: null }) };
        if (streamModal.row) streamForm.put(`/academics/streams/${streamModal.row.id}`, opts);
        else if (streamModal.cls) streamForm.post(`/academics/classes/${streamModal.cls.id}/streams`, opts);
    };

    const remove = async (url: string, label: string) => {
        const { confirmed } = await confirm({ title: `Delete ${label}?`, text: 'Blocked automatically if students are still assigned.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(url, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader
                title="Classes & Streams"
                subtitle="Class levels, streams, capacity and class teachers."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Classes & Streams' }]}
                actions={
                    <>
                        {can('academics.manage') && <ImportButton type="classes" label="Import classes" />}
                        {can('academics.manage') && <ImportButton type="streams" label="Import streams" />}
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openClass(null)}>
                                <Plus className="h-4 w-4" /> New class
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Classes" value={num(classes.length)} icon={School} tone="primary" />
                <StatCard title="Streams" value={num(totals.streams)} icon={Layers} tone="secondary" />
                <StatCard
                    title="Active learners"
                    value={num(totals.students)}
                    icon={GraduationCap}
                    tone="success"
                    hint={totals.capacity ? `${Math.round((totals.students / totals.capacity) * 100)}% of capacity` : undefined}
                />
                <StatCard title="Streams w/o class teacher" value={num(totals.noTeacher)} icon={UserRound} tone={totals.noTeacher ? 'danger' : 'info'} />
            </div>

            {classes.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No classes yet" description="Create your first class level, e.g. Form One with streams A and B." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
                    {classes.map((c, i) => (
                        <div key={c.id} className="panel overflow-hidden p-0">
                            <div className={cn('relative bg-gradient-to-r px-5 py-4 text-white', palette[i % palette.length])}>
                                <GraduationCap className="absolute -end-3 -bottom-4 h-24 w-24 opacity-15" />
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="text-xs font-semibold tracking-wide uppercase opacity-80">
                                            Level {c.level}
                                            {c.code ? ` · ${c.code}` : ''}
                                            <span className="ms-2 rounded bg-white/25 px-1.5 py-0.5 normal-case">{levelName[c.education_level] ?? c.education_level}</span>
                                        </div>
                                        <h5 className="text-xl font-extrabold">{c.name}</h5>
                                    </div>
                                    {manage && (
                                        <div className="relative flex gap-1">
                                            <button
                                                className="grid h-8 w-8 place-content-center rounded-md bg-white/20 hover:bg-white/30"
                                                title="Edit class"
                                                onClick={() => openClass(c)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                className="grid h-8 w-8 place-content-center rounded-md bg-white/20 hover:bg-white/30"
                                                title="Delete class"
                                                onClick={() => remove(`/academics/classes/${c.id}`, c.name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="relative mt-3 flex gap-4 text-sm font-semibold">
                                    <span className="flex items-center gap-1">
                                        <Users className="h-4 w-4" /> {num(c.students)}
                                    </span>
                                    <span>♂ {num(c.boys)}</span>
                                    <span>♀ {num(c.girls)}</span>
                                    <span className="flex items-center gap-1">
                                        <BookOpen className="h-4 w-4" /> {c.subjects} subjects
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-4 p-5">
                                <Usage used={c.students} capacity={c.capacity} />
                                <div className="space-y-2">
                                    {c.streams.map((s) => (
                                        <div key={s.id} className="flex items-center gap-3 rounded-lg border border-white-light p-3 dark:border-[#1b2e4b]">
                                            <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-primary-light text-lg font-extrabold text-primary dark:bg-primary-dark-light">
                                                {s.name}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Link href={`/students?class=${c.id}&stream=${s.id}`} className="truncate font-bold hover:text-primary">
                                                        {c.name} {s.name}
                                                        {s.combination && (
                                                            <span className="badge badge-soft-secondary ms-1.5" title={s.combination_name ?? ''}>
                                                                {s.combination}
                                                            </span>
                                                        )}
                                                    </Link>
                                                    <span className="shrink-0 text-xs font-semibold text-white-dark">
                                                        {s.students}
                                                        {s.capacity ? `/${s.capacity}` : ''}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs">
                                                    {s.class_teacher ? (
                                                        <>
                                                            <Avatar name={s.class_teacher} className="h-5 w-5 text-[9px]" />
                                                            <span className="text-white-dark">{s.class_teacher}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-danger">No class teacher</span>
                                                    )}
                                                </div>
                                            </div>
                                            {manage && (
                                                <div className="flex shrink-0 gap-0.5">
                                                    <button
                                                        className="grid h-7 w-7 place-content-center rounded-md text-primary hover:bg-primary-light"
                                                        title="Edit stream"
                                                        onClick={() => openStream(c, s)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        className="grid h-7 w-7 place-content-center rounded-md text-danger hover:bg-danger-light"
                                                        title="Delete stream"
                                                        onClick={() => remove(`/academics/streams/${s.id}`, `stream ${c.name} ${s.name}`)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {c.streams.length === 0 && <p className="text-sm text-white-dark">No streams — learners are placed directly in the class.</p>}
                                    {c.education_level === 'a_level' && c.streams.some((s) => !s.combination_id) && (
                                        <p className="text-xs font-semibold text-warning">
                                            Link every A-Level stream to a combination — students' subjects and divisions come from it.
                                        </p>
                                    )}
                                </div>
                                {manage && (
                                    <button className="btn btn-outline-primary btn-sm w-full" onClick={() => openStream(c, null)}>
                                        <Plus className="h-4 w-4" /> Add stream
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={classModal.open} onClose={() => setClassModal({ open: false, row: null })} title={classModal.row ? `Edit ${classModal.row.name}` : 'New class'}>
                <form onSubmit={submitClass} className="space-y-5">
                    <FormGrid>
                        <Input
                            label="Class name"
                            required
                            placeholder="e.g. Form Five"
                            value={classForm.data.name}
                            onChange={(e) => classForm.setData('name', e.target.value)}
                            error={classForm.errors.name}
                        />
                        <Input
                            label="Code"
                            placeholder="e.g. F5"
                            value={classForm.data.code}
                            onChange={(e) => classForm.setData('code', e.target.value)}
                            error={classForm.errors.code}
                        />
                        <Input
                            label="Level (promotion order)"
                            type="number"
                            min={1}
                            required
                            value={classForm.data.level}
                            onChange={(e) => classForm.setData('level', e.target.value)}
                            error={classForm.errors.level}
                        />
                        <Input
                            label="Capacity"
                            type="number"
                            min={1}
                            value={classForm.data.capacity}
                            onChange={(e) => classForm.setData('capacity', e.target.value)}
                            error={classForm.errors.capacity}
                        />
                        <Select
                            label="Education level"
                            required
                            options={levels}
                            value={classForm.data.education_level}
                            onChange={(e) => classForm.setData('education_level', e.target.value)}
                            error={classForm.errors.education_level}
                            help="A-Level classes use combinations, the ACSEE grading and the A-Level calendar."
                            wrapperClassName="sm:col-span-2"
                        />
                        {!classModal.row && (
                            <Input
                                label="Streams"
                                help="Comma-separated, e.g. A, B, C. Leave blank for none."
                                value={classForm.data.streams}
                                onChange={(e) => classForm.setData('streams', e.target.value)}
                                error={classForm.errors.streams}
                                wrapperClassName="sm:col-span-2"
                            />
                        )}
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setClassModal({ open: false, row: null })}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={classForm.processing}>
                            Save class
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={streamModal.open}
                onClose={() => setStreamModal({ open: false, cls: null, row: null })}
                title={streamModal.row ? `Edit stream ${streamModal.cls?.name} ${streamModal.row.name}` : `Add stream to ${streamModal.cls?.name ?? ''}`}
            >
                <form onSubmit={submitStream} className="space-y-5">
                    <FormGrid>
                        <Input
                            label="Stream name"
                            required
                            placeholder="e.g. C or Blue"
                            value={streamForm.data.name}
                            onChange={(e) => streamForm.setData('name', e.target.value)}
                            error={streamForm.errors.name}
                        />
                        <Input
                            label="Capacity"
                            type="number"
                            min={1}
                            value={streamForm.data.capacity}
                            onChange={(e) => streamForm.setData('capacity', e.target.value)}
                            error={streamForm.errors.capacity}
                        />
                        <Select
                            label="Class teacher"
                            placeholder="— None —"
                            options={teachers}
                            value={streamForm.data.class_teacher_id}
                            onChange={(e) => streamForm.setData('class_teacher_id', e.target.value)}
                            error={streamForm.errors.class_teacher_id}
                            wrapperClassName="sm:col-span-2"
                        />
                        {streamIsALevel && (
                            <Select
                                label="Combination"
                                required
                                placeholder={combinations.length ? 'Choose combination…' : 'No combinations yet'}
                                options={combinations}
                                value={streamForm.data.combination_id}
                                onChange={(e) => streamForm.setData('combination_id', e.target.value)}
                                error={streamForm.errors.combination_id}
                                help={
                                    <>
                                        Students in this stream take this combination&apos;s subjects.{' '}
                                        <Link href="/academics/combinations" className="text-primary underline">
                                            Manage combinations
                                        </Link>
                                    </>
                                }
                                wrapperClassName="sm:col-span-2"
                            />
                        )}
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setStreamModal({ open: false, cls: null, row: null })}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={streamForm.processing}>
                            Save stream
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
