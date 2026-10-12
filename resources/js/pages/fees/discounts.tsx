import { Link, useForm, usePage } from '@inertiajs/react';
import { Award, BadgePercent, Plus, Users, Wallet, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Field, FormGrid, Input, Select, Switch, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { date, money, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import StudentPicker from './_components/student-picker';

type Discount = {
    id: number;
    student_id: number;
    student: string | null;
    admission_no: string | null;
    class: string | null;
    fee_category_id: number | null;
    category: string | null;
    name: string;
    type: 'percent' | 'fixed';
    value: string;
    reason: string | null;
    is_active: boolean;
    approved_by: string | null;
    created_at: string | null;
};

type Props = {
    discounts: Paginated<Discount>;
    filters: { search: string; status: string; category: string; type: string; class: string };
    categories: Option[];
    classes: Option[];
    stats: { active: number; students: number; scholarships: number; granted: string };
};

const presets = [
    { name: 'Sibling discount', type: 'percent', value: '10', reason: 'Two or more children enrolled at the school' },
    { name: 'Academic excellence scholarship', type: 'percent', value: '50', reason: '' },
    { name: 'Staff child bursary', type: 'fixed', value: '200000', reason: '' },
    { name: 'Hardship waiver', type: 'percent', value: '25', reason: '' },
];

export default function FeeDiscounts({ discounts, filters: initial, categories, classes, stats }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Discount | null>(null);
    const [student, setStudent] = useState<{ id: number; name: string; meta: string } | null>(null);
    const form = useForm({ student_id: '' as string | number, fee_category_id: '' as string | number, name: '', type: 'percent', value: '', reason: '', is_active: true });

    const openForm = (d: Discount | null) => {
        setEditing(d);
        form.clearErrors();
        setStudent(d ? { id: d.student_id, name: d.student ?? '', meta: `${d.admission_no ?? ''} · ${d.class ?? ''}` } : null);
        form.setData(
            d
                ? { student_id: d.student_id, fee_category_id: d.fee_category_id ?? '', name: d.name, type: d.type, value: String(Number(d.value)), reason: d.reason ?? '', is_active: d.is_active }
                : { student_id: '', fee_category_id: '', name: '', type: 'percent', value: '', reason: '', is_active: true },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/fees/discounts/${editing.id}`, opts);
        else form.post('/fees/discounts', opts);
    };

    const columns: Column<Discount>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (d) => (
                <div className="flex items-center gap-3">
                    <Avatar name={d.student} />
                    <div>
                        <Link href={`/fees/statements/${d.student_id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {d.student}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {d.admission_no} · {d.class ?? '—'}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'name',
            header: 'Discount / scholarship',
            render: (d) => (
                <div>
                    <div className="font-semibold">{d.name}</div>
                    {d.reason && <div className="max-w-xs truncate text-xs text-white-dark">{d.reason}</div>}
                </div>
            ),
        },
        { key: 'category', header: 'Applies to', render: (d) => d.category ?? <span className="badge badge-soft-dark">All fees</span> },
        {
            key: 'value',
            header: 'Value',
            align: 'right',
            render: (d) => <span className="text-base font-extrabold text-success">{d.type === 'percent' ? `${Number(d.value)}%` : money(d.value, cur)}</span>,
        },
        {
            key: 'approved',
            header: 'Approved by',
            render: (d) => (
                <div>
                    <div>{d.approved_by ?? '—'}</div>
                    <div className="text-xs text-white-dark">{date(d.created_at)}</div>
                </div>
            ),
        },
        { key: 'status', header: 'Status', render: (d) => <span className={`badge ${d.is_active ? 'badge-soft-success' : 'badge-soft-dark'}`}>{d.is_active ? 'Active' : 'Inactive'}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (d) => (can('fees.manage') ? <RowActions onEdit={() => openForm(d)} destroy={`/fees/discounts/${d.id}`} label="discount" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Discounts & Scholarships"
                subtitle="Approved student-specific discounts, bursaries and waivers applied when invoices are generated."
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Discounts' }]}
                actions={
                    can('fees.manage') && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Grant discount
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Active discounts" value={num(stats.active)} icon={BadgePercent} tone="primary" />
                <StatCard title="Beneficiaries" value={num(stats.students)} icon={Users} tone="info" />
                <StatCard title="Scholarships (≥50%)" value={num(stats.scholarships)} icon={Award} tone="warning" />
                <StatCard title="Discount granted" value={money(stats.granted, cur)} icon={Wallet} tone="success" hint="On issued invoices" />
            </div>

            <div className="panel">
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student or discount…" />
                    <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                    <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} options={[{ value: 'all', label: 'All fees (general)' }, ...categories]} placeholder="Any category" />
                    <FilterSelect
                        value={filters.type}
                        onChange={(v) => setFilter('type', v)}
                        options={[
                            { value: 'percent', label: 'Percentage' },
                            { value: 'fixed', label: 'Fixed amount' },
                        ]}
                        placeholder="Any type"
                    />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' },
                        ]}
                        placeholder="Any status"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={discounts} empty="No discounts recorded" emptyDescription="Grant sibling discounts, scholarships or bursaries to individual students." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit discount' : 'Grant a discount'} size="lg">
                <form onSubmit={submit} className="space-y-5">
                    <Field label="Student" required error={form.errors.student_id}>
                        {student ? (
                            <div className="flex items-center gap-3 rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                                <Avatar name={student.name} />
                                <div className="flex-1">
                                    <div className="font-bold">{student.name}</div>
                                    <div className="text-xs text-white-dark">{student.meta}</div>
                                </div>
                                {!editing && (
                                    <button
                                        type="button"
                                        className="text-white-dark hover:text-danger"
                                        onClick={() => {
                                            setStudent(null);
                                            form.setData('student_id', '');
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <StudentPicker
                                currency={cur}
                                onSelect={(s) => {
                                    setStudent({ id: s.id, name: s.full_name, meta: `${s.admission_no} · ${s.class}` });
                                    form.setData('student_id', s.id);
                                }}
                            />
                        )}
                    </Field>
                    {!editing && (
                        <div className="flex flex-wrap gap-2">
                            <span className="self-center text-xs font-semibold text-white-dark">Quick presets:</span>
                            {presets.map((p) => (
                                <button
                                    key={p.name}
                                    type="button"
                                    className="badge badge-outline-primary cursor-pointer"
                                    onClick={() => form.setData((d) => ({ ...d, name: p.name, type: p.type, value: p.value, reason: p.reason || d.reason }))}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}
                    <FormGrid>
                        <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} placeholder="e.g. Sibling discount" />
                        <Select
                            label="Applies to"
                            value={form.data.fee_category_id}
                            onChange={(e) => form.setData('fee_category_id', e.target.value)}
                            options={categories}
                            placeholder="All fee categories"
                            error={form.errors.fee_category_id}
                        />
                        <Select
                            label="Type"
                            required
                            value={form.data.type}
                            onChange={(e) => form.setData('type', e.target.value)}
                            options={[
                                { value: 'percent', label: 'Percentage of fee' },
                                { value: 'fixed', label: `Fixed amount (${cur}) per invoice` },
                            ]}
                        />
                        <Input
                            label={form.data.type === 'percent' ? 'Percentage (%)' : `Amount (${cur})`}
                            type="number"
                            min={0}
                            step={form.data.type === 'percent' ? '0.5' : '1'}
                            required
                            value={form.data.value}
                            onChange={(e) => form.setData('value', e.target.value)}
                            error={form.errors.value}
                        />
                        <Textarea label="Reason / approval note" wrapperClassName="sm:col-span-2" value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} error={form.errors.reason} />
                    </FormGrid>
                    <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active" />
                    <p className="text-xs text-white-dark">Saving records you as the approver. Discounts apply to invoices generated afterwards; issued invoices are not changed.</p>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Approve & save
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
