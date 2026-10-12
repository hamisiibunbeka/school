import { Link, useForm, usePage } from '@inertiajs/react';
import { Building, CheckCircle2, Plus, ShoppingCart, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Switch } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { date, money, num } from '@/lib/utils';
import type { Paginated } from '@/types';
import ImportButton from '@/components/ui/import-button';

type Supplier = {
    id: number;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    tin: string | null;
    is_active: boolean;
    orders: number;
    spend: string;
    last_order: string | null;
};
type Props = {
    suppliers: Paginated<Supplier>;
    filters: { search: string; status: string };
    stats: { total: number; active: number; spend_year: string; open_orders: number };
};

const blank = { name: '', contact_person: '', phone: '', email: '', address: '', tin: '', is_active: true };

export default function Suppliers({ suppliers, filters: initial, stats }: Props) {
    const can = useCan();
    const manage = can('inventory.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Supplier | null>(null);
    const form = useForm(blank);

    const openForm = (s: Supplier | null) => {
        setEditing(s);
        form.clearErrors();
        form.setData(
            s
                ? { name: s.name, contact_person: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', tin: s.tin ?? '', is_active: s.is_active }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/inventory/suppliers/${editing.id}`, opts);
        else form.post('/inventory/suppliers', opts);
    };

    const columns: Column<Supplier>[] = [
        {
            key: 'name',
            header: 'Supplier',
            render: (s) => (
                <div className="flex items-center gap-3">
                    <Avatar name={s.name} />
                    <div>
                        <div className="font-bold text-black dark:text-white-light">{s.name}</div>
                        <div className="text-xs text-white-dark">{s.tin ? `TIN ${s.tin}` : 'No TIN'}</div>
                    </div>
                </div>
            ),
        },
        {
            key: 'contact',
            header: 'Contact',
            render: (s) => (
                <div className="text-sm">
                    <div className="font-semibold">{s.contact_person ?? '—'}</div>
                    <div className="text-xs text-white-dark">{[s.phone, s.email].filter(Boolean).join(' · ')}</div>
                </div>
            ),
        },
        { key: 'address', header: 'Address', render: (s) => <span className="text-xs">{s.address ?? '—'}</span> },
        {
            key: 'orders',
            header: 'Orders',
            align: 'center',
            render: (s) => (s.orders ? <Link href={`/inventory/purchase-orders?supplier=${s.id}`} className="font-semibold text-primary hover:underline">{s.orders}</Link> : '0'),
        },
        { key: 'spend', header: 'Spend', align: 'right', render: (s) => money(s.spend, cur) },
        { key: 'last', header: 'Last order', render: (s) => date(s.last_order) },
        { key: 'status', header: 'Status', render: (s) => (s.is_active ? <span className="badge badge-soft-success">Active</span> : <span className="badge badge-soft-dark">Inactive</span>) },
        { key: 'actions', header: '', align: 'right', render: (s) => (manage ? <RowActions onEdit={() => openForm(s)} destroy={`/inventory/suppliers/${s.id}`} label="supplier" /> : null) },
    ];

    return (
        <>
            <PageHeader
                title="Suppliers"
                subtitle="Vendors for stores, food, stationery and services."
                breadcrumbs={[{ title: 'Inventory', href: '/inventory/items' }, { title: 'Suppliers' }]}
                actions={
                    <>
                        {can('inventory.manage') && <ImportButton type="suppliers" label="Import suppliers" />}
                        {manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Add supplier
                        </button>
                    )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Suppliers" value={num(stats.total)} icon={Building} tone="primary" />
                <StatCard title="Active" value={num(stats.active)} icon={CheckCircle2} tone="success" />
                <StatCard title="Spend this year" value={money(stats.spend_year, cur)} icon={Wallet} tone="info" hint="Approved & received POs" />
                <StatCard title="Open orders" value={num(stats.open_orders)} icon={ShoppingCart} tone="warning" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name, contact, TIN…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' },
                        ]}
                        placeholder="All suppliers"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={suppliers} empty="No suppliers found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add supplier'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Company name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} wrapperClassName="sm:col-span-2" />
                        <Input label="Contact person" value={form.data.contact_person} onChange={(e) => form.setData('contact_person', e.target.value)} error={form.errors.contact_person} />
                        <Input label="Phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        <Input label="Email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                        <Input label="TIN" value={form.data.tin} onChange={(e) => form.setData('tin', e.target.value)} error={form.errors.tin} />
                        <Input label="Address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} error={form.errors.address} wrapperClassName="sm:col-span-2" />
                        <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active supplier" />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save supplier
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
