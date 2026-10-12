import { Link, useForm, usePage } from '@inertiajs/react';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardList, PackageMinus, PackagePlus, RotateCcw, SlidersHorizontal, Trash } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { cn, compact, date, exportCsv, money, num, titleCase, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import SearchSelect from '../boarding/_components/search-select';
import { DateRangePicker } from '@/components/ui/date-picker';

type Movement = {
    id: number;
    date: string;
    item_id: number;
    item: string;
    sku: string | null;
    unit: string;
    type: string;
    quantity: string;
    unit_cost: string;
    value: string;
    balance_after: string;
    reference: string | null;
    purchase_order_id: number | null;
    issued_to: string | null;
    notes: string | null;
    user: string | null;
};
type ItemOption = Option & { unit: string; quantity: string; unit_cost: string };
type Kind = 'issue' | 'adjustment' | 'return' | 'write_off';
type Props = {
    movements: Paginated<Movement>;
    filters: { search: string; item: string; type: string; from: string; to: string };
    items: ItemOption[];
    destinations: string[];
    types: Option[];
    byDestination: { name: string; value: number }[];
    canOverride: boolean;
    stats: { received_month: string; issued_month: string; written_off_month: string; movements_month: number };
};

const typeTone: Record<string, string> = {
    receipt: 'badge-soft-success',
    issue: 'badge-soft-primary',
    adjustment: 'badge-soft-secondary',
    return: 'badge-soft-info',
    write_off: 'badge-soft-danger',
};

const kinds: { key: Kind; label: string; icon: typeof PackageMinus; help: string }[] = [
    { key: 'issue', label: 'Issue', icon: PackageMinus, help: 'Stock issued out to the kitchen, a department or a class.' },
    { key: 'return', label: 'Return', icon: RotateCcw, help: 'Unused stock returned to the store.' },
    { key: 'adjustment', label: 'Adjust', icon: SlidersHorizontal, help: 'Correct the balance after a stock count (+ or −).' },
    { key: 'write_off', label: 'Write-off', icon: Trash, help: 'Expired, damaged or lost stock removed from the books.' },
];

type FormData = {
    inventory_item_id: string;
    type: Kind;
    direction: 'in' | 'out';
    quantity: string;
    unit_cost: string;
    date: string;
    issued_to: string;
    reference: string;
    notes: string;
    override: boolean;
    override_reason: string;
};

export default function Movements({ movements, filters: initial, items, destinations, types, byDestination, canOverride, stats }: Props) {
    const can = useCan();
    const manage = can('inventory.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const form = useForm<FormData>({
        inventory_item_id: '',
        type: 'issue',
        direction: 'out',
        quantity: '',
        unit_cost: '',
        date: today(),
        issued_to: '',
        reference: '',
        notes: '',
        override: false,
        override_reason: '',
    });

    const item = items.find((i) => String(i.value) === form.data.inventory_item_id);
    const outflow = form.data.type === 'issue' || form.data.type === 'write_off' || (form.data.type === 'adjustment' && form.data.direction === 'out');
    const after = item ? Number(item.quantity) + (outflow ? -1 : 1) * Number(form.data.quantity || 0) : 0;
    const wouldGoNegative = !!item && outflow && after < 0;

    const start = (type: Kind) => {
        form.clearErrors();
        form.setData((d) => ({
            ...d,
            type,
            direction: type === 'adjustment' ? 'out' : d.direction,
            inventory_item_id: d.inventory_item_id || filters.item || '',
            quantity: '',
            unit_cost: '',
            issued_to: '',
            notes: '',
            reference: '',
            override: false,
            override_reason: '',
            date: today(),
        }));
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/inventory/movements', { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const columns: Column<Movement>[] = [
        { key: 'date', header: 'Date', render: (m) => date(m.date) },
        {
            key: 'item',
            header: 'Item',
            render: (m) => (
                <button type="button" className="text-start" onClick={() => setFilter('item', String(m.item_id))}>
                    <div className="font-semibold text-black hover:text-primary dark:text-white-light">{m.item}</div>
                    <div className="text-xs text-white-dark">{m.sku}</div>
                </button>
            ),
        },
        { key: 'type', header: 'Type', render: (m) => <span className={`badge ${typeTone[m.type] ?? 'badge-soft-dark'}`}>{titleCase(m.type)}</span> },
        {
            key: 'details',
            header: 'Reference / to',
            render: (m) => (
                <div className="max-w-[240px] text-xs">
                    {m.purchase_order_id ? (
                        <Link href={`/inventory/purchase-orders/${m.purchase_order_id}`} className="font-semibold text-primary hover:underline">
                            {m.reference}
                        </Link>
                    ) : (
                        m.reference && <div className="font-semibold">{m.reference}</div>
                    )}
                    {m.issued_to && <div>→ {m.issued_to}</div>}
                    {m.notes && <div className="line-clamp-2 text-white-dark">{m.notes}</div>}
                </div>
            ),
        },
        {
            key: 'quantity',
            header: 'Qty',
            align: 'right',
            render: (m) => (
                <span className={cn('font-bold', Number(m.quantity) < 0 ? 'text-danger' : 'text-success')}>
                    {Number(m.quantity) > 0 ? '+' : ''}
                    {num(m.quantity, Number(m.quantity) % 1 ? 2 : 0)} {m.unit}
                </span>
            ),
        },
        { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (m) => money(m.unit_cost, '', 2) },
        { key: 'value', header: `Value (${cur})`, align: 'right', render: (m) => num(m.value) },
        { key: 'balance', header: 'Balance', align: 'right', render: (m) => <span className={cn('font-semibold', Number(m.balance_after) < 0 && 'text-danger')}>{num(m.balance_after, Number(m.balance_after) % 1 ? 2 : 0)}</span> },
        { key: 'user', header: 'By', render: (m) => <span className="text-xs">{m.user ?? '—'}</span> },
    ];

    const kind = kinds.find((k) => k.key === form.data.type);

    return (
        <>
            <PageHeader
                title="Stock Movements"
                subtitle="Movement ledger with running balances: receipts, issues, returns, adjustments and write-offs."
                breadcrumbs={[{ title: 'Inventory', href: '/inventory/items' }, { title: 'Movements' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('stock-movements', [
                                    ['Date', 'Item', 'Type', 'Quantity', 'Unit cost', 'Value', 'Balance after', 'Reference', 'Issued to', 'Notes', 'By'],
                                    ...movements.data.map((m) => [m.date, m.item, m.type, m.quantity, m.unit_cost, m.value, m.balance_after, m.reference, m.issued_to, m.notes, m.user]),
                                ])
                            }
                        >
                            Export page
                        </button>
                        {manage &&
                            kinds.map((k) => (
                                <button key={k.key} className={cn('btn', k.key === 'issue' ? 'btn-primary' : 'btn-outline-primary')} onClick={() => start(k.key)}>
                                    <k.icon className="h-4 w-4" /> {k.label}
                                </button>
                            ))}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Received this month" value={money(stats.received_month, cur)} icon={ArrowDownToLine} tone="success" />
                <StatCard title="Issued this month" value={money(stats.issued_month, cur)} icon={ArrowUpFromLine} tone="primary" />
                <StatCard title="Written off / adjusted out" value={money(stats.written_off_month, cur)} icon={Trash} tone="danger" />
                <StatCard title="Movements this month" value={num(stats.movements_month)} icon={ClipboardList} tone="info" />
            </div>

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
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search item, reference, destination…" />
                        <FilterSelect value={filters.item} onChange={(v) => setFilter('item', v)} options={items} placeholder="All items" />
                        <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={types} placeholder="All types" />
                        <DateRangePicker from={filters.from} to={filters.to} onChange={(f, t) => { setFilter('from', f); setFilter('to', t); }} />
                    </FilterBar>
                    <DataTable columns={columns} paginated={movements} compact empty="No stock movements" />
                </div>
                <div className="panel h-fit">
                    <h5 className="mb-2 text-lg font-semibold dark:text-white-light">Issues by destination</h5>
                    <p className="mb-3 text-xs text-white-dark">Value issued, last 90 days</p>
                    {byDestination.length ? (
                        <Chart
                            type="bar"
                            height={320}
                            series={[{ name: 'Value', data: byDestination.map((d) => d.value) }]}
                            options={{
                                plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
                                xaxis: { categories: byDestination.map((d) => d.name), labels: { formatter: (v: string) => compact(v) } },
                                tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                            }}
                        />
                    ) : (
                        <EmptyState title="No issues yet" />
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={`Stock ${kind?.label.toLowerCase() ?? 'movement'}`} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {kinds.map((k) => (
                            <button key={k.key} type="button" onClick={() => form.setData('type', k.key)} className={cn('btn btn-sm', form.data.type === k.key ? 'btn-primary' : 'btn-outline-primary')}>
                                <k.icon className="h-4 w-4" /> {k.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-white-dark">{kind?.help}</p>
                    <SearchSelect
                        label="Item"
                        required
                        options={items}
                        value={form.data.inventory_item_id}
                        onChange={(v) => form.setData('inventory_item_id', v)}
                        error={form.errors.inventory_item_id}
                        help={item ? `On hand: ${num(item.quantity, 2)} ${item.unit} · average cost ${money(item.unit_cost, cur, 2)}` : undefined}
                    />
                    <FormGrid cols={3}>
                        {form.data.type === 'adjustment' && (
                            <Select
                                label="Direction"
                                required
                                value={form.data.direction}
                                onChange={(e) => form.setData('direction', e.target.value as 'in' | 'out')}
                                options={[
                                    { value: 'out', label: '− Decrease (shortage)' },
                                    { value: 'in', label: '+ Increase (surplus)' },
                                ]}
                                error={form.errors.direction}
                            />
                        )}
                        <Input
                            label={`Quantity${item ? ` (${item.unit})` : ''}`}
                            type="number"
                            step="0.01"
                            min={0}
                            required
                            value={form.data.quantity}
                            onChange={(e) => form.setData('quantity', e.target.value)}
                            error={form.errors.quantity}
                        />
                        <Input label="Date" type="date" required value={form.data.date} onChange={(e) => form.setData('date', e.target.value)} error={form.errors.date} />
                        {form.data.type === 'adjustment' && form.data.direction === 'in' && (
                            <Input
                                label="Unit cost (optional)"
                                type="number"
                                step="0.01"
                                min={0}
                                value={form.data.unit_cost}
                                onChange={(e) => form.setData('unit_cost', e.target.value)}
                                error={form.errors.unit_cost}
                                help="Blank = current average cost"
                            />
                        )}
                    </FormGrid>
                    {(form.data.type === 'issue' || form.data.type === 'return') && (
                        <Field required label={form.data.type === 'issue' ? 'Issued to' : 'Returned from'} error={form.errors.issued_to}>
                            <input className="form-input" list="destinations" required value={form.data.issued_to} onChange={(e) => form.setData('issued_to', e.target.value)} placeholder="Kitchen, Science Lab, Form Two…" />
                            <datalist id="destinations">
                                {destinations.map((d) => (
                                    <option key={d} value={d} />
                                ))}
                            </datalist>
                        </Field>
                    )}
                    <FormGrid>
                        <Input label="Reference" value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} error={form.errors.reference} placeholder="Requisition / count sheet no." />
                        <Input
                            label={form.data.type === 'adjustment' || form.data.type === 'write_off' ? 'Reason' : 'Notes'}
                            required={form.data.type === 'adjustment' || form.data.type === 'write_off'}
                            value={form.data.notes}
                            onChange={(e) => form.setData('notes', e.target.value)}
                            error={form.errors.notes}
                        />
                    </FormGrid>

                    {item && form.data.quantity && (
                        <div className={cn('rounded-md p-3 text-sm font-semibold', wouldGoNegative ? 'bg-danger-light text-danger dark:bg-danger-dark-light' : 'bg-primary-light text-primary dark:bg-primary-dark-light')}>
                            Balance after: {num(after, 2)} {item.unit} · value ≈ {money(Number(form.data.quantity) * Number(form.data.unit_cost || item.unit_cost), cur)}
                        </div>
                    )}

                    {wouldGoNegative && (
                        <div className="space-y-3 rounded-md border border-danger/30 p-3">
                            <p className="text-sm text-danger">This would take stock below zero. Negative stock is blocked unless an inventory manager overrides it with a reason.</p>
                            {canOverride ? (
                                <>
                                    <Checkbox label="Override: allow negative stock" checked={form.data.override} onChange={(e) => form.setData('override', e.target.checked)} />
                                    {form.data.override && (
                                        <Input label="Override reason" required value={form.data.override_reason} onChange={(e) => form.setData('override_reason', e.target.value)} error={form.errors.override_reason} />
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-white-dark">You do not have permission to override.</p>
                            )}
                        </div>
                    )}

                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing || (wouldGoNegative && !(form.data.override && form.data.override_reason))}>
                            <PackagePlus className="h-4 w-4" /> Record {kind?.label.toLowerCase()}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}

