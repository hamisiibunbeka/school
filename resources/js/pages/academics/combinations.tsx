import { router, useForm } from '@inertiajs/react';
import { BookMarked, Layers, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
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
    requires_bam: boolean;
    is_active: boolean;
    notes: string | null;
    principal: SubjectRef[];
    subsidiary: SubjectRef[];
    streams: string[];
    students: number;
};

const blank = { code: '', name: '', principal_subject_ids: ['', '', ''], requires_bam: false, is_active: true, notes: '' };

export default function Combinations({ combinations, subjects, standardCount }: { combinations: Row[]; subjects: Option[]; standardCount: number }) {
    const can = useCan();
    const manage = can('academics.manage');
    const [editing, setEditing] = useState<Row | 'new' | null>(null);
    const form = useForm(blank);
    const errors = form.errors as Record<string, string>;

    const open = (row: Row | 'new') => {
        form.clearErrors();
        form.setData(
            row === 'new'
                ? blank
                : {
                      code: row.code,
                      name: row.name,
                      principal_subject_ids: [0, 1, 2].map((i) => (row.principal[i] ? String(row.principal[i].id) : '')),
                      requires_bam: row.requires_bam,
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

    // Suggest a name from the chosen subjects, e.g. "Physics, Chemistry, Advanced Mathematics".
    const suggestedName = form.data.principal_subject_ids
        .map((id) => subjects.find((s) => String(s.value) === id)?.label.replace(/\s*\(.*\)$/, ''))
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
            text: `Adds ${standardCount} long-established combinations (PCM, PCB, CBG, HGL, ECA …) with any missing subjects. Existing codes are skipped. Review the BAM setting afterwards.`,
            confirmText: 'Add combinations',
        });
        if (confirmed) router.post('/academics/combinations/standard', {}, { preserveScroll: true });
    };

    const remove = async (row: Row) => {
        const { confirmed } = await confirm({ title: `Delete ${row.code}?`, text: 'Only possible when no stream uses it.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/academics/combinations/${row.id}`, { preserveScroll: true });
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
        {
            key: 'subsidiary',
            header: 'Subsidiary',
            render: (c) => (
                <div className="flex flex-wrap gap-1">
                    {c.subsidiary.map((s) => (
                        <span key={s.id} className="badge badge-outline-secondary" title={s.name ?? ''}>
                            {s.code ?? s.name}
                        </span>
                    ))}
                </div>
            ),
        },
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
                subtitle="Form V–VI subject combinations (tahasusi): three principal subjects, General Studies, and Basic Applied Mathematics where required. Link each A-Level stream to one combination."
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

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard
                    title="Combinations"
                    value={num(combinations.length)}
                    icon={BookMarked}
                    tone="primary"
                    hint={`${combinations.filter((c) => c.is_active).length} active`}
                />
                <StatCard title="Linked streams" value={num(combinations.reduce((a, c) => a + c.streams.length, 0))} icon={Layers} tone="secondary" />
                <StatCard title="A-Level students" value={num(combinations.reduce((a, c) => a + c.students, 0))} icon={Users} tone="success" />
                <StatCard title="Require BAM" value={num(combinations.filter((c) => c.requires_bam).length)} icon={BookMarked} tone="info" />
            </div>

            <div className="panel">
                <DataTable
                    columns={columns}
                    rows={combinations}
                    empty="No combinations yet"
                    emptyDescription="Click “Add standard combinations” for PCM, PCB, CBG, HGL and the others, or create your own (e.g. HGFa, HGLi)."
                />
                <p className="mt-4 text-xs text-white-dark">
                    Division (NECTA ACSEE): points of the 3 principal subjects, A=1 … F=7 — I: 3–9, II: 10–12, III: 13–17, IV: 18–19, 0: 20–21. General Studies and BAM are graded
                    and shown on report cards but never counted.
                </p>
            </div>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New combination' : `Edit ${editing ? editing.code : ''}`} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input
                            label="Code"
                            required
                            placeholder="e.g. PCM or HGFa"
                            value={form.data.code}
                            onChange={(e) => form.setData('code', e.target.value)}
                            error={form.errors.code}
                        />
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
                    >
                        <FormGrid cols={3}>
                            {[0, 1, 2].map((i) => (
                                <Select
                                    key={i}
                                    placeholder={`Subject ${i + 1}`}
                                    options={subjects.filter(
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
                        <div className="mb-2 text-sm">
                            <span className="badge badge-soft-secondary">GS</span> General Studies is included in every combination.
                        </div>
                        <Checkbox
                            label="Students in this combination also take Basic Applied Mathematics (BAM)"
                            checked={form.data.requires_bam}
                            onChange={(e) => form.setData('requires_bam', e.target.checked)}
                        />
                        <p className="mt-1 text-xs text-white-dark">Usually ticked for combinations without Advanced Mathematics, e.g. PCB, CBG, ECA.</p>
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
        </>
    );
}
