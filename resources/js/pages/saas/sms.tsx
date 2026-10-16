import { router, useForm } from '@inertiajs/react';
import { CheckCircle2, CircleDollarSign, Clock, Coins, Package, Pencil, Plus, Settings2, Sparkles, Trash2, Wallet, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { confirm } from '@/lib/swal';
import { cn, dateTime, money, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type PackageRow = {
    id: number;
    name: string;
    credits: number;
    price: string;
    per_sms: number;
    description: string | null;
    is_popular: boolean;
    is_active: boolean;
    sort_order: number;
    orders_count: number;
};
type Order = {
    id: number;
    reference: string;
    tenant: string | null;
    school: string | null;
    package_name: string;
    credits: number;
    amount: string;
    status: string;
    payment_method: string | null;
    payment_reference: string | null;
    payer_phone: string | null;
    notes: string | null;
    cancel_reason: string | null;
    requested_by: string | null;
    requester_phone: string | null;
    confirmed_by: string | null;
    created_at: string | null;
    submitted_at: string | null;
    paid_at: string | null;
};
type Balance = { plan: number; purchased: number; total: number; plan_limit: number };
type TenantOption = Option & { balance: Balance };

type Props = {
    packages: PackageRow[];
    orders: Paginated<Order>;
    filters: { search: string; status: string };
    tenants: TenantOption[];
    payment: { instructions: string; account_name: string | null };
    stats: { awaiting: number; unpaid: number; revenue_month: string; credits_sold_month: number };
};

const blankPackage = { name: '', credits: '', price: '', description: '', is_popular: false, is_active: true, sort_order: '0' };

export default function SaasSms({ packages, orders, filters: initial, tenants, payment, stats }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [tab, setTab] = useState('orders');
    const [pkg, setPkg] = useState<PackageRow | 'new' | null>(null);
    const [adjusting, setAdjusting] = useState(false);
    const pkgForm = useForm(blankPackage);
    const adjustForm = useForm({ tenant_id: '', credits: '', reason: '' });
    const payForm = useForm({ instructions: payment.instructions, account_name: payment.account_name ?? '' });

    const openPkg = (p: PackageRow | 'new') => {
        pkgForm.clearErrors();
        pkgForm.setData(
            p === 'new'
                ? blankPackage
                : {
                      name: p.name,
                      credits: String(p.credits),
                      price: p.price,
                      description: p.description ?? '',
                      is_popular: p.is_popular,
                      is_active: p.is_active,
                      sort_order: String(p.sort_order),
                  },
        );
        setPkg(p);
    };
    const savePkg = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setPkg(null) };
        if (pkg === 'new') pkgForm.post('/saas/sms/packages', opts);
        else if (pkg) pkgForm.put(`/saas/sms/packages/${pkg.id}`, opts);
    };
    const deletePkg = async (p: PackageRow) => {
        const { confirmed } = await confirm({ title: `Delete ${p.name}?`, text: 'Packages with orders are deactivated instead.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/saas/sms/packages/${p.id}`, { preserveScroll: true });
    };

    const confirmOrder = async (o: Order) => {
        const { confirmed } = await confirm({
            title: `Confirm payment for ${o.reference}?`,
            text: `${o.tenant}: ${money(o.amount)} (${o.payment_reference ? `ref ${o.payment_reference}` : 'no reference given'}). ${num(o.credits)} SMS will be added immediately.`,
            confirmText: 'Confirm & add credits',
        });
        if (confirmed) router.post(`/saas/sms/orders/${o.id}/confirm`, {}, { preserveScroll: true });
    };
    const cancelOrder = async (o: Order) => {
        const { confirmed, value } = await confirm({
            title: `Cancel ${o.reference}?`,
            input: 'textarea',
            inputPlaceholder: 'Reason (shown to the school)',
            confirmText: 'Cancel order',
            danger: true,
        });
        if (confirmed) router.post(`/saas/sms/orders/${o.id}/cancel`, { reason: value }, { preserveScroll: true });
    };

    const adjustTenant = tenants.find((t) => String(t.value) === adjustForm.data.tenant_id);

    const orderColumns: Column<Order>[] = [
        {
            key: 'reference',
            header: 'Order',
            render: (o) => (
                <div>
                    <div className="font-mono text-xs font-bold">{o.reference}</div>
                    <div className="text-xs text-white-dark">{dateTime(o.created_at)}</div>
                </div>
            ),
        },
        {
            key: 'tenant',
            header: 'Account',
            render: (o) => (
                <div>
                    <div className="font-semibold">{o.tenant}</div>
                    <div className="text-xs text-white-dark">
                        {o.requested_by}
                        {o.requester_phone ? ` · ${o.requester_phone}` : ''}
                    </div>
                </div>
            ),
        },
        {
            key: 'bundle',
            header: 'Bundle',
            render: (o) => (
                <div>
                    <div className="font-semibold">{o.package_name}</div>
                    <div className="text-xs text-white-dark">{num(o.credits)} SMS</div>
                </div>
            ),
        },
        { key: 'amount', header: 'Amount', align: 'right', render: (o) => <span className="font-bold whitespace-nowrap">{money(o.amount)}</span> },
        {
            key: 'payment',
            header: 'Payment',
            render: (o) =>
                o.payment_reference ? (
                    <div className="text-sm">
                        <div className="font-mono font-semibold">{o.payment_reference}</div>
                        <div className="text-xs text-white-dark">
                            {titleCase(o.payment_method ?? '')}
                            {o.payer_phone ? ` · ${o.payer_phone}` : ''}
                        </div>
                        {o.notes && <div className="text-xs text-white-dark italic">{o.notes}</div>}
                    </div>
                ) : (
                    <span className="text-white-dark">—</span>
                ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (o) => (
                <div>
                    <StatusBadge status={o.status} label={o.status === 'submitted' ? 'To verify' : o.status === 'pending' ? 'Unpaid' : undefined} />
                    {o.status === 'paid' && (
                        <div className="text-xs text-white-dark">
                            by {o.confirmed_by} · {dateTime(o.paid_at)}
                        </div>
                    )}
                    {o.cancel_reason && <div className="text-xs text-danger">{o.cancel_reason}</div>}
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (o) =>
                (o.status === 'pending' || o.status === 'submitted') && (
                    <div className="flex justify-end gap-1">
                        <IconButton icon={CheckCircle2} title="Confirm payment" className="text-success" onClick={() => confirmOrder(o)} />
                        <IconButton icon={XCircle} title="Cancel" className="text-danger" onClick={() => cancelOrder(o)} />
                    </div>
                ),
        },
    ];

    return (
        <>
            <PageHeader
                title="SMS Bundles"
                subtitle="Bundles schools can buy, their orders and payments, and every account's SMS balance."
                breadcrumbs={[{ title: 'Platform', href: '/saas' }, { title: 'SMS Bundles' }]}
                actions={
                    <>
                        <button className="btn btn-outline-primary" onClick={() => (adjustForm.reset(), adjustForm.clearErrors(), setAdjusting(true))}>
                            <Coins className="h-4 w-4" /> Adjust credits
                        </button>
                        <button className="btn btn-primary" onClick={() => openPkg('new')}>
                            <Plus className="h-4 w-4" /> New package
                        </button>
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Payments to verify" value={num(stats.awaiting)} icon={Clock} tone={stats.awaiting ? 'warning' : 'success'} />
                <StatCard title="Unpaid orders" value={num(stats.unpaid)} icon={XCircle} tone="secondary" />
                <StatCard title="SMS revenue (month)" value={money(stats.revenue_month)} icon={CircleDollarSign} tone="success" />
                <StatCard title="SMS sold (month)" value={num(stats.credits_sold_month)} icon={Package} tone="primary" />
            </div>

            <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                    { key: 'orders', label: 'Orders', icon: Clock, count: stats.awaiting || undefined },
                    { key: 'packages', label: 'Packages', icon: Package, count: packages.length },
                    { key: 'balances', label: 'Account balances', icon: Wallet },
                    { key: 'payment', label: 'Payment instructions', icon: Settings2 },
                ]}
            />

            {tab === 'orders' && (
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
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Order, payment ref or school…" />
                        <FilterSelect
                            value={filters.status}
                            onChange={(v) => setFilter('status', v)}
                            options={[
                                { value: 'submitted', label: 'To verify' },
                                { value: 'pending', label: 'Unpaid' },
                                { value: 'paid', label: 'Paid' },
                                { value: 'cancelled', label: 'Cancelled' },
                            ]}
                            placeholder="Any status"
                        />
                    </FilterBar>
                    <DataTable columns={orderColumns} paginated={orders} empty="No SMS orders yet" />
                </div>
            )}

            {tab === 'packages' && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {packages.map((p) => (
                        <div key={p.id} className={cn('panel relative', !p.is_active && 'opacity-60', p.is_popular && 'border-2 border-primary')}>
                            {p.is_popular && (
                                <span className="absolute -top-3 start-4 badge badge-primary inline-flex items-center gap-1 rounded-full!">
                                    <Sparkles className="h-3 w-3" /> Popular
                                </span>
                            )}
                            <div className="flex items-start justify-between">
                                <div className="text-sm font-bold text-white-dark uppercase">{p.name}</div>
                                <div className="flex gap-1">
                                    <IconButton icon={Pencil} title="Edit" className="text-primary" onClick={() => openPkg(p)} />
                                    <IconButton icon={Trash2} title="Delete" className="text-danger" onClick={() => deletePkg(p)} />
                                </div>
                            </div>
                            <div className="mt-1 text-3xl font-extrabold text-black dark:text-white-light">{num(p.credits)}</div>
                            <div className="text-xs text-white-dark">SMS credits</div>
                            <div className="mt-3 text-xl font-bold text-primary">{money(p.price)}</div>
                            <div className="text-xs text-white-dark">{money(p.per_sms, 'TZS', 2)} per SMS</div>
                            {p.description && <p className="mt-2 text-xs text-white-dark">{p.description}</p>}
                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className={p.is_active ? 'badge badge-soft-success' : 'badge badge-soft-dark'}>{p.is_active ? 'On sale' : 'Hidden'}</span>
                                <span className="text-white-dark">{num(p.orders_count)} sold</span>
                            </div>
                        </div>
                    ))}
                    {packages.length === 0 && <p className="text-sm text-white-dark">No packages yet. Create the bundles schools can buy, e.g. 1,000 / 5,000 / 20,000 SMS.</p>}
                </div>
            )}

            {tab === 'balances' && (
                <div className="panel">
                    <DataTable<TenantOption & { id: number }>
                        columns={[
                            { key: 'label', header: 'Account', render: (t) => <span className="font-semibold">{t.label}</span> },
                            { key: 'plan', header: 'Plan allowance left', align: 'right', render: (t) => `${num(t.balance.plan)} / ${num(t.balance.plan_limit)}` },
                            { key: 'purchased', header: 'Purchased', align: 'right', render: (t) => num(t.balance.purchased) },
                            {
                                key: 'total',
                                header: 'Total',
                                align: 'right',
                                render: (t) => <span className={cn('font-bold', t.balance.total ? 'text-primary' : 'text-danger')}>{num(t.balance.total)}</span>,
                            },
                        ]}
                        rows={tenants.map((t) => ({ ...t, id: Number(t.value) }))}
                        empty="No accounts"
                    />
                </div>
            )}

            {tab === 'payment' && (
                <div className="panel max-w-3xl">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            payForm.put('/saas/sms/payment', { preserveScroll: true });
                        }}
                        className="space-y-4"
                    >
                        <Input
                            label="Account name"
                            value={payForm.data.account_name}
                            onChange={(e) => payForm.setData('account_name', e.target.value)}
                            error={payForm.errors.account_name}
                            placeholder="e.g. Mzenzi Technologies Ltd"
                        />
                        <Textarea
                            label="How schools should pay"
                            required
                            rows={7}
                            value={payForm.data.instructions}
                            onChange={(e) => payForm.setData('instructions', e.target.value)}
                            error={payForm.errors.instructions}
                            placeholder={'M-Pesa Lipa Namba: 123456\nBank: CRDB, A/C 0150xxxxxxx\nUse the order number as the payment reference.'}
                            help="Shown to schools when they buy an SMS bundle."
                        />
                        <div className="flex justify-end">
                            <button className="btn btn-primary" disabled={payForm.processing}>
                                Save instructions
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <Modal open={!!pkg} onClose={() => setPkg(null)} title={pkg === 'new' ? 'New SMS package' : 'Edit SMS package'}>
                <form onSubmit={savePkg} className="space-y-4">
                    <Input
                        label="Name"
                        required
                        value={pkgForm.data.name}
                        onChange={(e) => pkgForm.setData('name', e.target.value)}
                        error={pkgForm.errors.name}
                        placeholder="e.g. Standard"
                    />
                    <FormGrid>
                        <Input
                            label="SMS credits"
                            type="number"
                            min={1}
                            required
                            value={pkgForm.data.credits}
                            onChange={(e) => pkgForm.setData('credits', e.target.value)}
                            error={pkgForm.errors.credits}
                        />
                        <Input
                            label="Price (TZS)"
                            type="number"
                            min={0}
                            required
                            value={pkgForm.data.price}
                            onChange={(e) => pkgForm.setData('price', e.target.value)}
                            error={pkgForm.errors.price}
                        />
                    </FormGrid>
                    {Number(pkgForm.data.credits) > 0 && Number(pkgForm.data.price) > 0 && (
                        <p className="text-xs text-white-dark">= {money(Number(pkgForm.data.price) / Number(pkgForm.data.credits), 'TZS', 2)} per SMS</p>
                    )}
                    <Input
                        label="Description"
                        value={pkgForm.data.description}
                        onChange={(e) => pkgForm.setData('description', e.target.value)}
                        error={pkgForm.errors.description}
                    />
                    <Input label="Display order" type="number" min={0} value={pkgForm.data.sort_order} onChange={(e) => pkgForm.setData('sort_order', e.target.value)} />
                    <div className="flex flex-wrap gap-6">
                        <Checkbox label="Highlight as popular" checked={pkgForm.data.is_popular} onChange={(e) => pkgForm.setData('is_popular', e.target.checked)} />
                        <Checkbox label="On sale" checked={pkgForm.data.is_active} onChange={(e) => pkgForm.setData('is_active', e.target.checked)} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setPkg(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={pkgForm.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={adjusting} onClose={() => setAdjusting(false)} title="Adjust SMS credits">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        adjustForm.post('/saas/sms/adjust', { preserveScroll: true, onSuccess: () => setAdjusting(false) });
                    }}
                    className="space-y-4"
                >
                    <Select
                        label="Account"
                        required
                        placeholder="Choose account"
                        options={tenants}
                        value={adjustForm.data.tenant_id}
                        onChange={(e) => adjustForm.setData('tenant_id', e.target.value)}
                        error={adjustForm.errors.tenant_id}
                    />
                    {adjustTenant && (
                        <p className="text-sm text-white-dark">
                            Current balance: <b>{num(adjustTenant.balance.total)}</b> ({num(adjustTenant.balance.purchased)} purchased)
                        </p>
                    )}
                    <Input
                        label="Credits to add (negative to deduct)"
                        type="number"
                        required
                        value={adjustForm.data.credits}
                        onChange={(e) => adjustForm.setData('credits', e.target.value)}
                        error={adjustForm.errors.credits}
                        help="Changes the purchased (non-expiring) balance."
                    />
                    <Input
                        label="Reason"
                        required
                        value={adjustForm.data.reason}
                        onChange={(e) => adjustForm.setData('reason', e.target.value)}
                        error={adjustForm.errors.reason}
                        placeholder="e.g. Promotional bonus, correction"
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setAdjusting(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={adjustForm.processing}>
                            Apply
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
