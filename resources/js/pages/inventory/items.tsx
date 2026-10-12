import { Link, router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, ArrowLeftRight, Boxes, Download, Package, PackageX, Pencil, Plus, ShoppingCart, Tags, Trash2, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select, Switch } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, compact, exportCsv, money, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import ImportButton from '@/components/ui/import-button';

type Item = {
    id: number;
    name: string;
    sku: string | null;
    unit: string;
    item_category_id: number | null;
    category: string | null;
    quantity: string;
    unit_cost: string;
    value: string;
    reorder_level: string;
    location: string | null;
    is_active: boolean;
    low: boolean;
};
type Category = Option & { items_count: number };
type Props = {
    items: Paginated<Item>;
    filters: { search: string; category: string; stock: string; status: string };
    categories: Category[];
    byCategory: { name: string; value: number; items: number }[];
    units: string[];
    stats: { items: number; value: string; low: number; out: number; open_pos: number };
};

type FormData = { name: string; sku: string; item_category_id: string | number; unit: string; reorder_level: string | number; location: string; is_active: boolean };
const blank: FormData = { name: '', sku: '', item_category_id: '', unit: 'pcs', reorder_level: '0', location: '', is_active: true };

export default function Items({ items, filters: initial, categories, byCategory, units, stats }: Props) {
    const can = useCan();
    const manage = can('inventory.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Item | null>(null);
    const [catOpen, setCatOpen] = useState(false);
    const [editingCat, setEditingCat] = useState<Category | null>(null);
    const form = useForm<FormData>(blank);
    const catForm = useForm({ name: '' });

    const openForm = (i: Item | null) => {
        setEditing(i);
        form.clearErrors();
        form.setData(
            i
                ? { name: i.name, sku: i.sku ?? '', item_category_id: i.item_category_id ?? '', unit: i.unit, reorder_level: i.reorder_level, location: i.location ?? '', is_active: i.is_active }
                : { ...blank, item_category_id: filters.category || '' },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/inventory/items/${editing.id}`, opts);
        else form.post('/inventory/items', opts);
    };

    const submitCat = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => { catForm.reset(); setEditingCat(null); } };
        if (editingCat) catForm.put(`/inventory/categories/${editingCat.value}`, opts);
        else catForm.post('/inventory/categories', opts);
    };

    const columns: Column<Item>[] = [
        {
            key: 'name',
            header: 'Item',
            render: (i) => (
                <div>
                    <div className={cn('font-bold text-black dark:text-white-light', !i.is_active && 'line-through opacity-60')}>{i.name}</div>
                    <div className="text-xs text-white-dark">
                        {i.sku ?? 'No SKU'} · {i.category ?? 'Uncategorised'}
                    </div>
                </div>
            ),
        },
        { key: 'location', header: 'Location', render: (i) => i.location ?? '—' },
        {
            key: 'quantity',
            header: 'On hand',
            align: 'right',
            render: (i) => (
                <div>
                    <span className={cn('font-bold', Number(i.quantity) <= 0 ? 'text-danger' : i.low ? 'text-warning' : 'text-success')}>
                        {num(i.quantity, Number(i.quantity) % 1 ? 2 : 0)} {i.unit}
                    </span>
                    {i.low && (
                        <div className="text-[11px] text-warning">
                            <AlertTriangle className="me-0.5 inline h-3 w-3" />
                            reorder at {num(i.reorder_level)}
                        </div>
                    )}
                </div>
            ),
        },
        { key: 'unit_cost', header: 'Avg. cost', align: 'right', render: (i) => money(i.unit_cost, cur, 2) },
        { key: 'value', header: 'Value', align: 'right', render: (i) => <span className="font-semibold">{money(i.value, cur)}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) => (
                <RowActions view={`/inventory/movements?item=${i.id}`} onEdit={manage ? () => openForm(i) : undefined} destroy={manage ? `/inventory/items/${i.id}` : undefined} label="item" />
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Stores & Inventory"
                subtitle="Item catalogue, stock on hand and weighted-average valuation."
                breadcrumbs={[{ title: 'Inventory' }, { title: 'Items' }]}
                actions={
                    <>
                        {can('inventory.manage') && <ImportButton type="inventory-items" label="Import items" />}
                        {<>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('stock-on-hand', [
                                    ['Item', 'SKU', 'Category', 'Unit', 'On hand', 'Reorder level', 'Avg cost', 'Value', 'Location'],
                                    ...items.data.map((i) => [i.name, i.sku, i.category, i.unit, i.quantity, i.reorder_level, i.unit_cost, i.value, i.location]),
                                ])
                            }
                        >
                            <Download className="h-4 w-4" /> Export page
                        </button>
                        {manage && (
                            <>
                                <button className="btn btn-outline-secondary" onClick={() => setCatOpen(true)}>
                                    <Tags className="h-4 w-4" /> Categories
                                </button>
                                <button className="btn btn-primary" onClick={() => openForm(null)}>
                                    <Plus className="h-4 w-4" /> Add item
                                </button>
                            </>
                        )}
                    </>}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Active items" value={num(stats.items)} icon={Boxes} tone="primary" />
                <StatCard title="Stock value" value={money(stats.value, cur)} icon={Wallet} tone="success" hint="Weighted average cost" />
                <StatCard title="Low stock" value={num(stats.low)} icon={AlertTriangle} tone={stats.low ? 'warning' : 'success'} hint={`${stats.out} out of stock`} />
                <StatCard title="Open purchase orders" value={num(stats.open_pos)} icon={ShoppingCart} tone="info" />
            </div>

            {stats.low > 0 && filters.stock !== 'low' && (
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-light p-4 text-warning dark:bg-warning-dark-light">
                    <div className="flex items-center gap-2 font-semibold">
                        <PackageX className="h-5 w-5" /> {stats.low} item{stats.low > 1 ? 's are' : ' is'} at or below the reorder level.
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-sm btn-warning" onClick={() => setFilter('stock', 'low')}>
                            Show low stock
                        </button>
                        {manage && (
                            <Link href="/inventory/purchase-orders/create" className="btn btn-sm btn-outline-warning">
                                Raise PO
                            </Link>
                        )}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <div className="panel xl:col-span-3">
                    <FilterBar
                        actions={
                            Object.values(filters).some(Boolean) && (
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                    Clear filters
                                </button>
                            )
                        }
                    >
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name, SKU, location…" />
                        <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} options={categories} placeholder="All categories" />
                        <FilterSelect
                            value={filters.stock}
                            onChange={(v) => setFilter('stock', v)}
                            options={[
                                { value: 'low', label: 'Low stock' },
                                { value: 'out', label: 'Out of stock' },
                            ]}
                            placeholder="Any stock level"
                        />
                        <FilterSelect
                            value={filters.status}
                            onChange={(v) => setFilter('status', v)}
                            options={[
                                { value: 'active', label: 'Active' },
                                { value: 'inactive', label: 'Inactive' },
                            ]}
                            placeholder="Active & inactive"
                        />
                    </FilterBar>
                    <DataTable columns={columns} paginated={items} empty="No items found" />
                </div>
                <div className="panel h-fit">
                    <div className="mb-2 flex items-center justify-between">
                        <h5 className="text-lg font-semibold dark:text-white-light">Value by category</h5>
                        <Link href="/inventory/movements" className="text-primary" title="Movement ledger">
                            <ArrowLeftRight className="h-4 w-4" />
                        </Link>
                    </div>
                    {byCategory.length ? (
                        <Chart
                            type="donut"
                            height={300}
                            series={byCategory.map((c) => c.value)}
                            options={{
                                labels: byCategory.map((c) => c.name),
                                legend: { position: 'bottom', horizontalAlign: 'center' },
                                stroke: { show: false },
                                tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                                plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Total', formatter: () => compact(stats.value) } } } } },
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center py-10 text-white-dark">
                            <Package className="mb-2 h-8 w-8" /> No stock yet
                        </div>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add inventory item'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Item name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} wrapperClassName="sm:col-span-2" />
                        <Input label="SKU / code" value={form.data.sku} onChange={(e) => form.setData('sku', e.target.value.toUpperCase())} error={form.errors.sku} />
                        <Select label="Category" placeholder="— None —" options={categories} value={form.data.item_category_id} onChange={(e) => form.setData('item_category_id', e.target.value)} error={form.errors.item_category_id} />
                        <Select label="Unit of measure" required options={units} value={form.data.unit} onChange={(e) => form.setData('unit', e.target.value)} error={form.errors.unit} />
                        <Input label="Reorder level" type="number" min={0} step="0.01" required value={form.data.reorder_level} onChange={(e) => form.setData('reorder_level', e.target.value)} error={form.errors.reorder_level} />
                        <Input label="Store location" value={form.data.location} onChange={(e) => form.setData('location', e.target.value)} error={form.errors.location} placeholder="e.g. Main store, shelf B2" />
                        <div className="flex items-end pb-2">
                            <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active" />
                        </div>
                    </FormGrid>
                    {!editing && <p className="text-xs text-white-dark">Quantity and average cost start at zero; stock comes in through purchase orders or a stock-count adjustment.</p>}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save item
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={catOpen} onClose={() => setCatOpen(false)} title="Item categories">
                <form onSubmit={submitCat} className="mb-4 flex items-start gap-2">
                    <Input
                        wrapperClassName="flex-1"
                        placeholder={editingCat ? `Rename ${editingCat.label}` : 'New category name'}
                        value={catForm.data.name}
                        onChange={(e) => catForm.setData('name', e.target.value)}
                        error={catForm.errors.name}
                    />
                    <button className="btn btn-primary" disabled={catForm.processing}>
                        {editingCat ? 'Rename' : 'Add'}
                    </button>
                    {editingCat && (
                        <button type="button" className="btn btn-outline-dark" onClick={() => { setEditingCat(null); catForm.reset(); }}>
                            Cancel
                        </button>
                    )}
                </form>
                <ul className="divide-y divide-white-light dark:divide-[#1b2e4b]">
                    {categories.map((c) => (
                        <li key={c.value} className="flex items-center justify-between py-2">
                            <span className="font-semibold">
                                {c.label} <span className="badge badge-soft-primary ms-1">{c.items_count}</span>
                            </span>
                            <span className="flex gap-2">
                                <button type="button" className="text-primary" title="Rename" onClick={() => { setEditingCat(c); catForm.setData('name', c.label); }}>
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    className="text-danger"
                                    title="Delete"
                                    onClick={async () => {
                                        const { confirmed } = await confirm({ title: `Delete category ${c.label}?`, confirmText: 'Delete', danger: true });
                                        if (confirmed) router.delete(`/inventory/categories/${c.value}`, { preserveScroll: true });
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </span>
                        </li>
                    ))}
                    {categories.length === 0 && <li className="py-4 text-center text-white-dark">No categories yet.</li>}
                </ul>
            </Modal>
        </>
    );
}
