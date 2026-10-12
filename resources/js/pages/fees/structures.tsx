import { useForm, usePage } from '@inertiajs/react';
import { BedDouble, CalendarRange, Copy, Grid3x3, List, Plus, Sun } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { cn, date, money, num } from '@/lib/utils';
import type { Option } from '@/types';

type Line = {
    id: number;
    academic_year_id: number;
    term_id: number;
    school_class_id: number;
    fee_category_id: number;
    class: string;
    category: string;
    residence_type: 'all' | 'day' | 'boarding';
    amount: string;
    due_date: string | null;
};

type Props = {
    structures: Line[];
    term: { id: number; name: string; year: string | null; academic_year_id: number; start_date: string | null } | null;
    filters: { term: string; class: string; category: string };
    terms: (Option & { is_current: boolean; structures: number })[];
    classes: Option[];
    categories: Option[];
};

const residenceLabel: Record<string, string> = { all: 'All students', day: 'Day scholars', boarding: 'Boarders' };
const residenceBadge: Record<string, string> = { all: 'badge-soft-primary', day: 'badge-soft-info', boarding: 'badge-soft-secondary' };

export default function FeeStructures({ structures, term, filters: initial, terms, classes, categories }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter } = useFilters(initial);
    const [view, setView] = useState('matrix');
    const [editing, setEditing] = useState<Line | null>(null);
    const [open, setOpen] = useState(false);
    const [copyOpen, setCopyOpen] = useState(false);

    const form = useForm({
        term_id: String(term?.id ?? ''),
        fee_category_id: '' as string | number,
        residence_type: 'all',
        amount: '',
        due_date: '',
        school_class_ids: [] as number[],
        school_class_id: '' as string | number,
    });
    const copy = useForm({ from_term_id: '', to_term_id: String(term?.id ?? ''), overwrite: false, adjust_percent: '' });

    const columnsUsed = useMemo(() => {
        const ids = new Set(structures.map((s) => s.school_class_id));
        const list = classes.filter((c) => ids.has(Number(c.value)));
        return filters.class ? list : list.length ? list : classes;
    }, [structures, classes, filters.class]);

    const matrixRows = useMemo(() => {
        const map = new Map<string, { key: string; category: string; residence: string; cells: Record<number, Line> }>();
        structures.forEach((s) => {
            const key = `${s.fee_category_id}-${s.residence_type}`;
            if (!map.has(key)) map.set(key, { key, category: s.category, residence: s.residence_type, cells: {} });
            map.get(key)!.cells[s.school_class_id] = s;
        });
        return [...map.values()].sort((a, b) => a.category.localeCompare(b.category) || a.residence.localeCompare(b.residence));
    }, [structures]);

    const totalFor = (classId: number, residence: 'day' | 'boarding') =>
        structures.filter((s) => s.school_class_id === classId && (s.residence_type === 'all' || s.residence_type === residence)).reduce((t, s) => t + Number(s.amount), 0);

    const avg = (residence: 'day' | 'boarding') => {
        const vals = columnsUsed.map((c) => totalFor(Number(c.value), residence)).filter((v) => v > 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const openForm = (line: Line | null, preset?: Partial<{ fee_category_id: number; residence_type: string; school_class_id: number }>) => {
        setEditing(line);
        form.clearErrors();
        form.setData({
            term_id: String(line?.term_id ?? term?.id ?? ''),
            fee_category_id: line?.fee_category_id ?? preset?.fee_category_id ?? '',
            residence_type: line?.residence_type ?? preset?.residence_type ?? 'all',
            amount: line ? String(Number(line.amount)) : '',
            due_date: line?.due_date ?? '',
            school_class_ids: preset?.school_class_id ? [preset.school_class_id] : [],
            school_class_id: line?.school_class_id ?? '',
        });
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/fees/structures/${editing.id}`, opts);
        else form.post('/fees/structures', opts);
    };

    const listColumns: Column<Line>[] = [
        { key: 'class', header: 'Class', render: (l) => <span className="font-semibold">{l.class}</span> },
        { key: 'category', header: 'Fee category' },
        { key: 'residence', header: 'Applies to', render: (l) => <span className={`badge ${residenceBadge[l.residence_type]}`}>{residenceLabel[l.residence_type]}</span> },
        { key: 'due', header: 'Due date', render: (l) => date(l.due_date) },
        { key: 'amount', header: 'Amount', align: 'right', render: (l) => <span className="font-bold">{money(l.amount, cur)}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (l) => (can('fees.manage') ? <RowActions onEdit={() => openForm(l)} destroy={`/fees/structures/${l.id}`} label="fee line" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Fee Structures"
                subtitle={term ? `Class and term rates for ${term.name} ${term.year ?? ''}` : 'Class and term rates'}
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Structures' }]}
                actions={
                    can('fees.manage') && (
                        <>
                            <button className="btn btn-outline-primary" onClick={() => setCopyOpen(true)}>
                                <Copy className="h-4 w-4" /> Copy from term
                            </button>
                            <button className="btn btn-primary" onClick={() => openForm(null)} disabled={!term}>
                                <Plus className="h-4 w-4" /> Add fee line
                            </button>
                        </>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Fee lines this term" value={num(structures.length)} icon={CalendarRange} tone="primary" hint={term ? `${term.name} ${term.year ?? ''}` : undefined} />
                <StatCard title="Classes covered" value={`${num(new Set(structures.map((s) => s.school_class_id)).size)} / ${classes.length}`} icon={Grid3x3} tone="info" />
                <StatCard title="Avg. day scholar / term" value={money(avg('day'), cur)} icon={Sun} tone="warning" />
                <StatCard title="Avg. boarder / term" value={money(avg('boarding'), cur)} icon={BedDouble} tone="secondary" />
            </div>

            <div className="panel">
                <FilterBar
                    actions={
                        <Tabs
                            className="mb-0 border-0"
                            tabs={[
                                { key: 'matrix', label: 'Matrix', icon: Grid3x3 },
                                { key: 'list', label: 'List', icon: List },
                            ]}
                            active={view}
                            onChange={setView}
                        />
                    }
                >
                    <FilterSelect value={filters.term} onChange={(v) => setFilter('term', v)} options={terms.map((t) => ({ value: t.value, label: `${t.label}${t.is_current ? ' (current)' : ''} · ${t.structures} lines` }))} placeholder="Select term" />
                    <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                    <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} options={categories} placeholder="All categories" />
                </FilterBar>

                {structures.length === 0 ? (
                    <EmptyState
                        title="No fee structure for this term yet"
                        description="Add fee lines per class, or copy the whole structure from a previous term."
                        action={
                            can('fees.manage') && (
                                <button className="btn btn-primary" onClick={() => setCopyOpen(true)}>
                                    <Copy className="h-4 w-4" /> Copy from another term
                                </button>
                            )
                        }
                    />
                ) : view === 'list' ? (
                    <DataTable columns={listColumns} rows={structures} compact />
                ) : (
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Fee category</th>
                                    {columnsUsed.map((c) => (
                                        <th key={c.value} className="text-end!">
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixRows.map((r) => (
                                    <tr key={r.key}>
                                        <td>
                                            <div className="font-semibold text-black dark:text-white-light">{r.category}</div>
                                            <span className={`badge mt-0.5 ${residenceBadge[r.residence]}`}>{residenceLabel[r.residence]}</span>
                                        </td>
                                        {columnsUsed.map((c) => {
                                            const cell = r.cells[Number(c.value)];
                                            return (
                                                <td key={c.value} className="text-end!">
                                                    {cell ? (
                                                        <button
                                                            type="button"
                                                            disabled={!can('fees.manage')}
                                                            onClick={() => openForm(cell)}
                                                            className="rounded px-1.5 py-0.5 font-semibold hover:bg-primary-light hover:text-primary disabled:hover:bg-transparent dark:hover:bg-primary-dark-light"
                                                            title={cell.due_date ? `Due ${date(cell.due_date)}` : undefined}
                                                        >
                                                            {num(cell.amount)}
                                                        </button>
                                                    ) : can('fees.manage') ? (
                                                        <button
                                                            type="button"
                                                            className="text-xs text-white-dark hover:text-primary"
                                                            onClick={() => openForm(null, { fee_category_id: Number(Object.values(r.cells)[0]?.fee_category_id), residence_type: r.residence, school_class_id: Number(c.value) })}
                                                        >
                                                            + add
                                                        </button>
                                                    ) : (
                                                        <span className="text-white-dark">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-info-light/50 dark:bg-info-dark-light">
                                    <td className="font-bold">
                                        <Sun className="me-1 inline h-4 w-4 text-warning" /> Day scholar total
                                    </td>
                                    {columnsUsed.map((c) => (
                                        <td key={c.value} className="text-end! font-extrabold">
                                            {money(totalFor(Number(c.value), 'day'), cur)}
                                        </td>
                                    ))}
                                </tr>
                                <tr className="bg-secondary-light/50 dark:bg-secondary-dark-light">
                                    <td className="font-bold">
                                        <BedDouble className="me-1 inline h-4 w-4 text-secondary" /> Boarder total
                                    </td>
                                    {columnsUsed.map((c) => (
                                        <td key={c.value} className="text-end! font-extrabold">
                                            {money(totalFor(Number(c.value), 'boarding'), cur)}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                        <p className="mt-3 text-xs text-white-dark">Amounts in {cur} per term. Click an amount to edit it. Changes do not affect invoices already issued.</p>
                    </div>
                )}
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit fee line — ${editing.class}` : 'Add fee line'} size="lg">
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid>
                        <Select label="Term" required value={form.data.term_id} onChange={(e) => form.setData('term_id', e.target.value)} options={terms} placeholder="Select term" error={form.errors.term_id} />
                        <Select
                            label="Fee category"
                            required
                            value={form.data.fee_category_id}
                            onChange={(e) => form.setData('fee_category_id', e.target.value)}
                            options={categories}
                            placeholder="Select category"
                            error={form.errors.fee_category_id}
                        />
                        <Select
                            label="Applies to"
                            required
                            value={form.data.residence_type}
                            onChange={(e) => form.setData('residence_type', e.target.value)}
                            options={Object.entries(residenceLabel).map(([value, label]) => ({ value, label }))}
                            error={form.errors.residence_type}
                        />
                        <Input label={`Amount (${cur})`} type="number" min={0} step="1" required value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value)} error={form.errors.amount} />
                        <Input label="Due date" type="date" value={form.data.due_date} onChange={(e) => form.setData('due_date', e.target.value)} error={form.errors.due_date} />
                        {editing && (
                            <Select label="Class" required value={form.data.school_class_id} onChange={(e) => form.setData('school_class_id', e.target.value)} options={classes} error={form.errors.school_class_id} />
                        )}
                    </FormGrid>
                    {!editing && (
                        <Field label="Classes" required error={form.errors.school_class_ids}>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => form.setData('school_class_ids', form.data.school_class_ids.length === classes.length ? [] : classes.map((c) => Number(c.value)))}
                                >
                                    {form.data.school_class_ids.length === classes.length ? 'Clear' : 'All classes'}
                                </button>
                                {classes.map((c) => {
                                    const on = form.data.school_class_ids.includes(Number(c.value));
                                    return (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => form.setData('school_class_ids', on ? form.data.school_class_ids.filter((x) => x !== Number(c.value)) : [...form.data.school_class_ids, Number(c.value)])}
                                            className={cn('btn btn-sm', on ? 'btn-primary' : 'btn-outline-dark')}
                                        >
                                            {c.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                    )}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="Copy fee structure between terms">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        copy.post('/fees/structures/copy', { preserveScroll: true, onSuccess: () => setCopyOpen(false) });
                    }}
                    className="space-y-4"
                >
                    <Select
                        label="Copy from"
                        required
                        value={copy.data.from_term_id}
                        onChange={(e) => copy.setData('from_term_id', e.target.value)}
                        options={terms.filter((t) => t.structures > 0).map((t) => ({ value: t.value, label: `${t.label} (${t.structures} lines)` }))}
                        placeholder="Select source term"
                        error={copy.errors.from_term_id}
                    />
                    <Select label="Copy to" required value={copy.data.to_term_id} onChange={(e) => copy.setData('to_term_id', e.target.value)} options={terms} placeholder="Select target term" error={copy.errors.to_term_id} />
                    <Input
                        label="Adjust amounts by (%)"
                        type="number"
                        step="0.5"
                        value={copy.data.adjust_percent}
                        onChange={(e) => copy.setData('adjust_percent', e.target.value)}
                        help="Optional, e.g. 5 for a 5% increase. Due dates shift with the term start date."
                        error={copy.errors.adjust_percent}
                    />
                    <Checkbox label="Overwrite lines that already exist in the target term" checked={copy.data.overwrite} onChange={(e) => copy.setData('overwrite', e.target.checked)} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setCopyOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={copy.processing}>
                            <Copy className="h-4 w-4" /> Copy structure
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
