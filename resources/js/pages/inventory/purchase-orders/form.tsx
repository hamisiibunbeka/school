import { Link, useForm, usePage } from '@inertiajs/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormGrid, FormSection, Input, Select, Textarea } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { money, today } from '@/lib/utils';
import type { Option } from '@/types';
import SearchSelect from '../../boarding/_components/search-select';

type ItemOption = Option & { unit: string; unit_cost: string; quantity: string; low: boolean };
type Line = { inventory_item_id: string | number; quantity: string; unit_cost: string };
type Props = {
    order: { id: number; po_no: string; supplier_id: number; order_date: string; expected_date: string; notes: string; lines: Line[] } | null;
    suppliers: Option[];
    items: ItemOption[];
};

type FormData = { supplier_id: string | number; order_date: string; expected_date: string; notes: string; lines: Line[] };

export default function PurchaseOrderForm({ order, suppliers, items }: Props) {
    const cur = usePage().props.school?.currency ?? 'TZS';
    const form = useForm<FormData>({
        supplier_id: order?.supplier_id ?? '',
        order_date: order?.order_date ?? today(),
        expected_date: order?.expected_date ?? '',
        notes: order?.notes ?? '',
        lines: order?.lines.length ? order.lines : [{ inventory_item_id: '', quantity: '', unit_cost: '' }],
    });
    const errors = form.errors as Record<string, string>;

    const setLine = (i: number, patch: Partial<Line>) => form.setData('lines', form.data.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    const total = form.data.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (order) form.put(`/inventory/purchase-orders/${order.id}`);
        else form.post('/inventory/purchase-orders');
    };

    const addLowStock = () => {
        const existing = new Set(form.data.lines.map((l) => String(l.inventory_item_id)));
        const extra = items.filter((i) => i.low && !existing.has(String(i.value))).map((i) => ({ inventory_item_id: i.value, quantity: '', unit_cost: Number(i.unit_cost) > 0 ? i.unit_cost : '' }));
        form.setData('lines', [...form.data.lines.filter((l) => l.inventory_item_id), ...extra]);
    };

    return (
        <>
            <PageHeader
                title={order ? `Edit ${order.po_no}` : 'New Purchase Order'}
                subtitle="Draft orders must be approved by another user before goods are received."
                breadcrumbs={[{ title: 'Inventory', href: '/inventory/items' }, { title: 'Purchase orders', href: '/inventory/purchase-orders' }, { title: order ? order.po_no : 'New' }]}
            />
            <form onSubmit={submit} className="panel space-y-6">
                <FormSection title="Order details">
                    <FormGrid cols={3}>
                        <Select label="Supplier" required placeholder="Select supplier…" options={suppliers} value={form.data.supplier_id} onChange={(e) => form.setData('supplier_id', e.target.value)} error={errors.supplier_id} />
                        <Input label="Order date" type="date" required value={form.data.order_date} onChange={(e) => form.setData('order_date', e.target.value)} error={errors.order_date} />
                        <Input label="Expected delivery" type="date" value={form.data.expected_date} onChange={(e) => form.setData('expected_date', e.target.value)} error={errors.expected_date} />
                    </FormGrid>
                    <Textarea label="Notes / delivery instructions" wrapperClassName="mt-4" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={errors.notes} />
                </FormSection>

                <FormSection title="Items" description="Quantities in each item's unit of measure, priced at the agreed supplier unit cost.">
                    {errors.lines && <p className="form-error mb-3">{errors.lines}</p>}
                    <div className="space-y-3">
                        {form.data.lines.map((l, i) => {
                            const item = items.find((it) => String(it.value) === String(l.inventory_item_id));
                            return (
                                <div key={i} className="grid grid-cols-12 items-start gap-3 rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                                    <div className="col-span-12 md:col-span-6">
                                        <SearchSelect
                                            options={items}
                                            value={l.inventory_item_id}
                                            onChange={(v, o) => setLine(i, { inventory_item_id: v, unit_cost: l.unit_cost || (o && Number(o.unit_cost) > 0 ? o.unit_cost : '') })}
                                            placeholder="Search item…"
                                            error={errors[`lines.${i}.inventory_item_id`]}
                                            help={item ? `On hand ${Number(item.quantity).toLocaleString()} ${item.unit}${item.low ? ' — LOW' : ''}` : undefined}
                                        />
                                    </div>
                                    <div className="col-span-5 md:col-span-2">
                                        <input type="number" step="0.01" min={0} className="form-input" placeholder={`Qty${item ? ` (${item.unit})` : ''}`} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                                        {errors[`lines.${i}.quantity`] && <p className="form-error">{errors[`lines.${i}.quantity`]}</p>}
                                    </div>
                                    <div className="col-span-5 md:col-span-2">
                                        <input type="number" step="0.01" min={0} className="form-input" placeholder="Unit cost" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} />
                                        {errors[`lines.${i}.unit_cost`] && <p className="form-error">{errors[`lines.${i}.unit_cost`]}</p>}
                                    </div>
                                    <div className="col-span-2 flex items-center justify-end gap-2 pt-2 md:col-span-2">
                                        <span className="hidden text-sm font-semibold md:inline">{money(Number(l.quantity || 0) * Number(l.unit_cost || 0), '')}</span>
                                        <button type="button" className="text-danger" title="Remove line" onClick={() => form.setData('lines', form.data.lines.filter((_, j) => j !== i))}>
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => form.setData('lines', [...form.data.lines, { inventory_item_id: '', quantity: '', unit_cost: '' }])}>
                                <Plus className="h-4 w-4" /> Add line
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-warning" onClick={addLowStock}>
                                Add all low-stock items
                            </button>
                        </div>
                        <div className="text-lg font-extrabold">Total: {money(total, cur, 2)}</div>
                    </div>
                </FormSection>

                <div className="flex justify-center gap-3">
                    <Link href={order ? `/inventory/purchase-orders/${order.id}` : '/inventory/purchase-orders'} className="btn btn-outline-dark">
                        Cancel
                    </Link>
                    <button className="btn btn-primary" disabled={form.processing}>
                        <Save className="h-4 w-4" /> {order ? 'Save changes' : 'Save draft'}
                    </button>
                </div>
            </form>
        </>
    );
}
