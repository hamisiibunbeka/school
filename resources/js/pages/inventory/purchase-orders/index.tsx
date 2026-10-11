import { Link, router, usePage } from '@inertiajs/react';
import { CheckCircle2, FilePen, Plus, ShoppingCart, Truck, Wallet } from 'lucide-react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { date, exportCsv, money, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import OccupancyBar from '../../boarding/_components/occupancy-bar';

type Order = {
    id: number;
    po_no: string;
    supplier: string;
    order_date: string;
    expected_date: string | null;
    total: string;
    status: string;
    items_count: number;
    progress: number;
    created_by: string | null;
    approved_by: string | null;
};
type Props = {
    orders: Paginated<Order>;
    filters: { search: string; status: string; supplier: string };
    suppliers: Option[];
    stats: { draft: number; approved: number; open_value: string; received_month: string };
};

export default function PurchaseOrders({ orders, filters: initial, suppliers, stats }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);

    const columns: Column<Order>[] = [
        {
            key: 'po_no',
            header: 'PO number',
            render: (o) => (
                <Link href={`/inventory/purchase-orders/${o.id}`} className="font-bold text-primary hover:underline">
                    {o.po_no}
                </Link>
            ),
        },
        { key: 'supplier', header: 'Supplier', render: (o) => <span className="font-semibold">{o.supplier}</span> },
        {
            key: 'dates',
            header: 'Ordered / expected',
            render: (o) => (
                <div className="text-xs">
                    <div>{date(o.order_date)}</div>
                    <div className="text-white-dark">{o.expected_date ? `→ ${date(o.expected_date)}` : ''}</div>
                </div>
            ),
        },
        { key: 'items', header: 'Lines', align: 'center', render: (o) => o.items_count },
        { key: 'total', header: 'Total', align: 'right', render: (o) => <span className="font-semibold">{money(o.total, cur)}</span> },
        {
            key: 'progress',
            header: 'Received',
            render: (o) => (o.status === 'cancelled' || o.status === 'draft' ? <span className="text-white-dark">—</span> : <OccupancyBar value={o.progress} max={100} showLabel={false} className="min-w-[80px]" />),
        },
        { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} label={o.status === 'partial' ? 'Partially received' : undefined} /> },
        {
            key: 'people',
            header: 'Raised / approved',
            render: (o) => (
                <div className="text-xs">
                    <div>{o.created_by ?? '—'}</div>
                    <div className="text-white-dark">{o.approved_by ?? ''}</div>
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Purchase Orders"
                subtitle="Raise, approve and receive purchases from suppliers."
                breadcrumbs={[{ title: 'Inventory', href: '/inventory/items' }, { title: 'Purchase orders' }]}
                actions={
                    <>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('purchase-orders', [
                                    ['PO', 'Supplier', 'Order date', 'Expected', 'Total', 'Status', 'Received %'],
                                    ...orders.data.map((o) => [o.po_no, o.supplier, o.order_date, o.expected_date, o.total, o.status, o.progress]),
                                ])
                            }
                        >
                            Export page
                        </button>
                        {can('inventory.manage') && (
                            <Link href="/inventory/purchase-orders/create" className="btn btn-primary">
                                <Plus className="h-4 w-4" /> New purchase order
                            </Link>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Awaiting approval" value={num(stats.draft)} icon={FilePen} tone="warning" />
                <StatCard title="Approved, awaiting goods" value={num(stats.approved)} icon={Truck} tone="info" />
                <StatCard title="Open order value" value={money(stats.open_value, cur)} icon={ShoppingCart} tone="primary" />
                <StatCard title="Completed this month" value={money(stats.received_month, cur)} icon={Wallet} tone="success" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search PO no., supplier…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'draft', label: 'Draft' },
                            { value: 'approved', label: 'Approved' },
                            { value: 'partial', label: 'Partially received' },
                            { value: 'received', label: 'Received' },
                            { value: 'cancelled', label: 'Cancelled' },
                        ]}
                        placeholder="All statuses"
                    />
                    <FilterSelect value={filters.supplier} onChange={(v) => setFilter('supplier', v)} options={suppliers} placeholder="All suppliers" />
                </FilterBar>
                <DataTable columns={columns} paginated={orders} empty="No purchase orders" onRowClick={(o) => router.get(`/inventory/purchase-orders/${o.id}`)} />
                <div className="mt-3 flex items-center gap-1 text-xs text-white-dark">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Orders must be approved by a different user from the one who raised them.
                </div>
            </div>
        </>
    );
}
