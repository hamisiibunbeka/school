import { useForm, usePage } from '@inertiajs/react';
import { CheckCircle2, Layers, Plus, Tags, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select, Switch, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { money, num } from '@/lib/utils';
import type { Option } from '@/types';

type Category = {
    id: number;
    name: string;
    code: string | null;
    description: string | null;
    is_active: boolean;
    income_account_id: number | null;
    income_account: string | null;
    structures_count: number;
    billed: string;
};

type Props = { categories: Category[]; filters: { search: string; status: string }; accounts: Option[] };

const blank = { name: '', code: '', income_account_id: '' as string | number, description: '', is_active: true };

export default function FeeCategories({ categories, filters: initial, accounts }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const form = useForm(blank);

    const openForm = (c: Category | null) => {
        setEditing(c);
        form.clearErrors();
        form.setData(c ? { name: c.name, code: c.code ?? '', income_account_id: c.income_account_id ?? '', description: c.description ?? '', is_active: c.is_active } : blank);
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/fees/categories/${editing.id}`, opts);
        else form.post('/fees/categories', opts);
    };

    const totalBilled = categories.reduce((s, c) => s + Number(c.billed), 0);

    const columns: Column<Category>[] = [
        {
            key: 'name',
            header: 'Category',
            render: (c) => (
                <div>
                    <div className="font-bold text-black dark:text-white-light">{c.name}</div>
                    {c.description && <div className="text-xs text-white-dark">{c.description}</div>}
                </div>
            ),
        },
        { key: 'code', header: 'Code', render: (c) => (c.code ? <span className="badge badge-outline-primary">{c.code}</span> : '—') },
        { key: 'account', header: 'Income account', render: (c) => c.income_account ?? <span className="text-white-dark italic">Default 4100 · Tuition</span> },
        { key: 'structures', header: 'Structure lines', align: 'center', render: (c) => num(c.structures_count) },
        {
            key: 'billed',
            header: 'Billed to date',
            align: 'right',
            render: (c) => (
                <div>
                    <div className="font-semibold">{money(c.billed, cur)}</div>
                    <div className="text-xs text-white-dark">{totalBilled > 0 ? `${((Number(c.billed) / totalBilled) * 100).toFixed(1)}% of billing` : '—'}</div>
                </div>
            ),
        },
        { key: 'status', header: 'Status', render: (c) => <span className={`badge ${c.is_active ? 'badge-soft-success' : 'badge-soft-dark'}`}>{c.is_active ? 'Active' : 'Inactive'}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) => (can('fees.manage') ? <RowActions onEdit={() => openForm(c)} destroy={`/fees/categories/${c.id}`} label="fee category" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Fee Categories"
                subtitle="Chargeable items and the income account each one posts to."
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Categories' }]}
                actions={
                    can('fees.manage') && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> New category
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Categories" value={num(categories.length)} icon={Tags} tone="primary" />
                <StatCard title="Active" value={num(categories.filter((c) => c.is_active).length)} icon={CheckCircle2} tone="success" />
                <StatCard title="Structure lines" value={num(categories.reduce((s, c) => s + c.structures_count, 0))} icon={Layers} tone="info" />
                <StatCard title="Total billed" value={money(totalBilled, cur)} icon={Wallet} tone="secondary" />
            </div>

            <div className="panel">
                <FilterBar>
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name or code…" />
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
                <DataTable columns={columns} rows={categories} empty="No fee categories yet" emptyDescription="Create categories such as Tuition, Boarding or Meals." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit fee category' : 'New fee category'} size="lg">
                <form onSubmit={submit} className="space-y-5">
                    <FormGrid>
                        <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} placeholder="e.g. Tuition Fee" />
                        <Input label="Code" value={form.data.code} onChange={(e) => form.setData('code', e.target.value.toUpperCase())} error={form.errors.code} placeholder="e.g. TUI" />
                        <Select
                            label="Income account"
                            wrapperClassName="sm:col-span-2"
                            value={form.data.income_account_id}
                            onChange={(e) => form.setData('income_account_id', e.target.value)}
                            options={accounts}
                            placeholder="Default — 4100 Tuition"
                            error={form.errors.income_account_id}
                            help="Invoices credit this account (net of discounts) and debit 1300 Student Fees Receivable."
                        />
                        <Textarea label="Description" wrapperClassName="sm:col-span-2" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} />
                    </FormGrid>
                    <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active — available on fee structures and invoices" />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save category
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
