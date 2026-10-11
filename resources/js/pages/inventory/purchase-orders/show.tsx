import { Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, Ban, CheckCircle2, Pencil, PackageCheck, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PrintButton } from '@/components/ui/actions';
import { FormGrid, Input } from '@/components/ui/form';
import Letterhead from '@/components/ui/letterhead';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, dateTime, money, num, today } from '@/lib/utils';
import OccupancyBar from '../../boarding/_components/occupancy-bar';

type Line = { id: number; item: string; sku: string | null; unit: string; quantity: string; unit_cost: string; amount: string; received_quantity: string; outstanding: string };
type Receipt = { id: number; date: string; item: string; unit: string; quantity: string; unit_cost: string; user: string | null };
type Props = {
    order: {
        id: number;
        po_no: string;
        status: string;
        raw_status: string;
        order_date: string;
        expected_date: string | null;
        notes: string | null;
        total: string;
        created_by: string | null;
        created_by_id: number | null;
        approved_by: string | null;
        created_at: string;
        progress: number;
        supplier: { id: number; name: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null; tin: string | null } | null;
        lines: Line[];
        receipts: Receipt[];
    };
    can: { approve: boolean; self_created: boolean };
};

const qty = (v: string) => num(v, Number(v) % 1 ? 2 : 0);

export default function PurchaseOrderShow({ order, can: perms }: Props) {
    const can = useCan();
    const manage = can('inventory.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const [receiving, setReceiving] = useState(false);
    const grn = useForm<{ date: string; notes: string; lines: Record<number, string> }>({ date: today(), notes: '', lines: {} });
    const errors = grn.errors as Record<string, string>;

    const openReceive = () => {
        grn.clearErrors();
        grn.setData({ date: today(), notes: '', lines: Object.fromEntries(order.lines.map((l) => [l.id, Number(l.outstanding) > 0 ? l.outstanding : ''])) });
        setReceiving(true);
    };

    const submitGrn = (e: FormEvent) => {
        e.preventDefault();
        grn.post(`/inventory/purchase-orders/${order.id}/receive`, { preserveScroll: true, onSuccess: () => setReceiving(false) });
    };

    const approve = async () => {
        const { confirmed } = await confirm({ title: `Approve ${order.po_no}?`, text: `Commit ${money(order.total, cur)} with ${order.supplier?.name ?? 'the supplier'}.`, confirmText: 'Approve order' });
        if (confirmed) router.post(`/inventory/purchase-orders/${order.id}/approve`, {}, { preserveScroll: true });
    };

    const cancel = async () => {
        const { confirmed, value } = await confirm({ title: `Cancel ${order.po_no}?`, text: 'Give a reason for cancelling this order.', confirmText: 'Cancel order', danger: true, input: 'textarea' });
        if (confirmed) router.post(`/inventory/purchase-orders/${order.id}/cancel`, { reason: value }, { preserveScroll: true });
    };

    const remove = async () => {
        const { confirmed } = await confirm({ title: `Delete draft ${order.po_no}?`, text: 'This cannot be undone.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/inventory/purchase-orders/${order.id}`);
    };

    const receiveTotal = order.lines.reduce((s, l) => s + Number(grn.data.lines[l.id] || 0) * Number(l.unit_cost), 0);

    return (
        <>
            <PageHeader
                title={`Purchase Order ${order.po_no}`}
                breadcrumbs={[{ title: 'Inventory', href: '/inventory/items' }, { title: 'Purchase orders', href: '/inventory/purchase-orders' }, { title: order.po_no }]}
                actions={
                    <>
                        <Link href="/inventory/purchase-orders" className="btn btn-outline-primary">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        {manage && order.raw_status === 'draft' && (
                            <>
                                <Link href={`/inventory/purchase-orders/${order.id}/edit`} className="btn btn-outline-primary">
                                    <Pencil className="h-4 w-4" /> Edit
                                </Link>
                                <button className="btn btn-outline-danger" onClick={remove}>
                                    <Trash2 className="h-4 w-4" /> Delete
                                </button>
                            </>
                        )}
                        {perms.approve && (
                            <button className="btn btn-success" onClick={approve}>
                                <CheckCircle2 className="h-4 w-4" /> Approve
                            </button>
                        )}
                        {manage && order.raw_status === 'approved' && (
                            <button className="btn btn-primary" onClick={openReceive}>
                                <PackageCheck className="h-4 w-4" /> Receive goods
                            </button>
                        )}
                        {manage && ['draft', 'approved'].includes(order.raw_status) && order.progress === 0 && (
                            <button className="btn btn-outline-danger" onClick={cancel}>
                                <Ban className="h-4 w-4" /> Cancel
                            </button>
                        )}
                        <PrintButton />
                    </>
                }
            />

            {order.raw_status === 'draft' && perms.self_created && (
                <div className="no-print mb-5 rounded-md border border-info/30 bg-info-light p-3 text-sm text-info dark:bg-info-dark-light">
                    You raised this order, so another user with inventory rights must approve it (segregation of duties).
                </div>
            )}

            <div className="panel">
                <Letterhead
                    title="Purchase Order"
                    meta={
                        <>
                            <div className="text-base font-bold">{order.po_no}</div>
                            <div>Date: {date(order.order_date)}</div>
                            {order.expected_date && <div>Delivery by: {date(order.expected_date)}</div>}
                            <div className="mt-1">
                                <StatusBadge status={order.status} label={order.status === 'partial' ? 'Partially received' : undefined} />
                            </div>
                        </>
                    }
                />

                <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <div className="mb-1 text-xs font-bold text-white-dark uppercase">Supplier</div>
                        <div className="text-base font-bold">{order.supplier?.name}</div>
                        {order.supplier?.contact_person && <div>Attn: {order.supplier.contact_person}</div>}
                        {order.supplier?.address && <div>{order.supplier.address}</div>}
                        <div className="text-white-dark">{[order.supplier?.phone, order.supplier?.email].filter(Boolean).join(' · ')}</div>
                        {order.supplier?.tin && <div className="text-white-dark">TIN: {order.supplier.tin}</div>}
                    </div>
                    <div className="sm:text-end">
                        <div className="mb-1 text-xs font-bold text-white-dark uppercase">Receipt progress</div>
                        <OccupancyBar value={order.progress} max={100} showLabel={false} className="mb-1 sm:ms-auto sm:max-w-xs" />
                        <div className="text-sm">{order.progress}% of ordered quantity received</div>
                    </div>
                </div>

                <div className="table-responsive mb-6">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Item</th>
                                <th className="text-end!">Qty</th>
                                <th className="text-end!">Unit cost</th>
                                <th className="text-end!">Amount ({cur})</th>
                                <th className="text-end! no-print">Received</th>
                                <th className="text-end! no-print">Outstanding</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.lines.map((l, i) => (
                                <tr key={l.id}>
                                    <td>{i + 1}</td>
                                    <td>
                                        <div className="font-semibold">{l.item}</div>
                                        <div className="text-xs text-white-dark">{l.sku}</div>
                                    </td>
                                    <td className="text-end!">
                                        {qty(l.quantity)} {l.unit}
                                    </td>
                                    <td className="text-end!">{num(l.unit_cost, 2)}</td>
                                    <td className="text-end! font-semibold">{num(l.amount, 2)}</td>
                                    <td className="text-end! no-print text-success">{qty(l.received_quantity)}</td>
                                    <td className={`text-end! no-print ${Number(l.outstanding) > 0 ? 'font-bold text-warning' : 'text-white-dark'}`}>{qty(l.outstanding)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={4} className="text-end! font-bold">
                                    Total
                                </td>
                                <td className="text-end! text-lg font-extrabold">{money(order.total, cur, 2)}</td>
                                <td colSpan={2} className="no-print" />
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {order.notes && (
                    <div className="mb-6 rounded-md bg-[#f6f8fa] p-3 text-sm dark:bg-[#1b2e4b]">
                        <span className="font-bold">Notes: </span>
                        {order.notes}
                    </div>
                )}

                <div className="mb-8 grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
                    <div>
                        <div className="text-xs text-white-dark uppercase">Prepared by</div>
                        <div className="font-semibold">{order.created_by ?? '—'}</div>
                        <div className="text-xs text-white-dark">{dateTime(order.created_at)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-white-dark uppercase">Approved by</div>
                        <div className="font-semibold">{order.approved_by ?? 'Pending approval'}</div>
                    </div>
                </div>

                {order.receipts.length > 0 && (
                    <div className="no-print">
                        <h6 className="mb-2 font-bold">Goods received history</h6>
                        <div className="table-responsive">
                            <table className="table table-compact table-striped">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Item</th>
                                        <th className="text-end!">Qty</th>
                                        <th className="text-end!">Value</th>
                                        <th>Received by</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.receipts.map((r) => (
                                        <tr key={r.id}>
                                            <td>{date(r.date)}</td>
                                            <td>{r.item}</td>
                                            <td className="text-end!">
                                                {qty(r.quantity)} {r.unit}
                                            </td>
                                            <td className="text-end!">{money(Number(r.quantity) * Number(r.unit_cost), cur)}</td>
                                            <td>{r.user ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <Modal open={receiving} onClose={() => setReceiving(false)} title={`Receive goods — ${order.po_no}`} size="xl">
                <form onSubmit={submitGrn} className="space-y-4">
                    <FormGrid>
                        <Input label="Date received" type="date" required value={grn.data.date} onChange={(e) => grn.setData('date', e.target.value)} error={errors.date} />
                        <Input label="Delivery note / remarks" value={grn.data.notes} onChange={(e) => grn.setData('notes', e.target.value)} error={errors.notes} placeholder="e.g. DN 4471, delivered by supplier truck" />
                    </FormGrid>
                    {errors.lines && <p className="form-error">{errors.lines}</p>}
                    {errors.status && <p className="form-error">{errors.status}</p>}
                    <div className="table-responsive">
                        <table className="table table-compact">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th className="text-end!">Ordered</th>
                                    <th className="text-end!">Received</th>
                                    <th className="text-end!">Outstanding</th>
                                    <th className="w-36">Receive now</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.lines.map((l) => (
                                    <tr key={l.id}>
                                        <td className="font-semibold">{l.item}</td>
                                        <td className="text-end!">{qty(l.quantity)}</td>
                                        <td className="text-end!">{qty(l.received_quantity)}</td>
                                        <td className="text-end!">
                                            {qty(l.outstanding)} {l.unit}
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min={0}
                                                max={l.outstanding}
                                                disabled={Number(l.outstanding) <= 0}
                                                className="form-input"
                                                value={grn.data.lines[l.id] ?? ''}
                                                onChange={(e) => grn.setData('lines', { ...grn.data.lines, [l.id]: e.target.value })}
                                            />
                                            {errors[`lines.${l.id}`] && <p className="form-error">{errors[`lines.${l.id}`]}</p>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-white-dark">
                            Value received: <strong className="text-black dark:text-white-light">{money(receiveTotal, cur, 2)}</strong> — posts Dr Inventory / Cr Accounts Payable.
                        </div>
                        <div className="flex gap-3">
                            <button type="button" className="btn btn-outline-dark" onClick={() => setReceiving(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" disabled={grn.processing}>
                                <PackageCheck className="h-4 w-4" /> Record receipt
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>
        </>
    );
}
