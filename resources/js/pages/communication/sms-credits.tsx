import { router, useForm } from '@inertiajs/react';
import { CalendarClock, CheckCircle2, Coins, CreditCard, Package, ShoppingCart, Sparkles, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, dateTime, money, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';

type PackageRow = { id: number; name: string; credits: number; price: string; per_sms: number; description: string | null; is_popular: boolean };
type Order = {
    id: number;
    reference: string;
    package_name: string;
    credits: number;
    amount: string;
    status: string;
    payment_method: string | null;
    payment_reference: string | null;
    cancel_reason: string | null;
    school: string | null;
    requested_by: string | null;
    created_at: string | null;
    paid_at: string | null;
};
type Ledger = { id: number; type: string; credits: number; balance_after: number; description: string; user: string | null; created_at: string | null };

type Props = {
    balance: { plan: number; purchased: number; total: number; plan_limit: number };
    plan: string | null;
    packages: PackageRow[];
    orders: Order[];
    ledger: Ledger[];
    usage: { label: string; credits: number }[];
    payment: { instructions: string; account_name: string | null };
    methods: Option[];
};

const PLATFORM_CURRENCY = 'TZS';

export default function SmsCredits({ balance, plan, packages, orders, ledger, usage, payment, methods }: Props) {
    const can = useCan();
    const manage = can('communication.manage');
    const [paying, setPaying] = useState<Order | null>(null);
    const payForm = useForm({ payment_method: 'mobile_money', payment_reference: '', payer_phone: '', notes: '' });

    const buy = async (p: PackageRow) => {
        const { confirmed } = await confirm({
            title: `Buy ${p.name}?`,
            text: `${num(p.credits)} SMS for ${money(p.price, PLATFORM_CURRENCY)}. An order is created; credits are added once your payment is confirmed.`,
            confirmText: 'Create order',
        });
        if (!confirmed) return;
        router.post(
            '/communication/sms-credits/orders',
            { sms_package_id: p.id },
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    const id = page.flash?.sms_order;
                    const order = (page.props.orders as Order[]).find((o) => o.id === id);
                    if (order) openPay(order);
                },
            },
        );
    };

    const openPay = (o: Order) => {
        payForm.reset();
        payForm.clearErrors();
        setPaying(o);
    };
    const submitPay = (e: FormEvent) => {
        e.preventDefault();
        if (!paying) return;
        payForm.post(`/communication/sms-credits/orders/${paying.id}/payment`, { preserveScroll: true, onSuccess: () => setPaying(null) });
    };
    const cancel = async (o: Order) => {
        const { confirmed } = await confirm({ title: `Cancel order ${o.reference}?`, confirmText: 'Cancel order', danger: true });
        if (confirmed) router.post(`/communication/sms-credits/orders/${o.id}/cancel`, {}, { preserveScroll: true });
    };

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
            key: 'package',
            header: 'Bundle',
            render: (o) => (
                <div>
                    <div className="font-semibold">{o.package_name}</div>
                    <div className="text-xs text-white-dark">{num(o.credits)} SMS</div>
                </div>
            ),
        },
        { key: 'amount', header: 'Amount', align: 'right', render: (o) => <span className="font-semibold whitespace-nowrap">{money(o.amount, PLATFORM_CURRENCY)}</span> },
        {
            key: 'status',
            header: 'Status',
            render: (o) => (
                <div>
                    <StatusBadge status={o.status} label={o.status === 'pending' ? 'Awaiting payment' : o.status === 'submitted' ? 'Verifying payment' : undefined} />
                    {o.payment_reference && <div className="mt-1 text-xs text-white-dark">Ref {o.payment_reference}</div>}
                    {o.cancel_reason && <div className="mt-1 text-xs text-danger">{o.cancel_reason}</div>}
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (o) =>
                manage &&
                (o.status === 'pending' || o.status === 'submitted') && (
                    <div className="flex justify-end gap-1">
                        <button className="btn btn-sm btn-primary" onClick={() => openPay(o)}>
                            <CreditCard className="h-3.5 w-3.5" /> {o.status === 'pending' ? 'I have paid' : 'Update payment'}
                        </button>
                        {o.status === 'pending' && (
                            <button className="btn btn-sm btn-outline-danger" onClick={() => cancel(o)} title="Cancel order">
                                <XCircle className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                ),
        },
    ];

    return (
        <>
            <PageHeader
                title="SMS Credits"
                subtitle="Your account's SMS balance, shared by all your schools. Buy bundles below; they never expire."
                breadcrumbs={[{ title: 'Communication' }, { title: 'SMS Credits' }]}
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Total SMS balance" value={num(balance.total)} icon={Coins} tone={balance.total > 0 ? 'primary' : 'danger'} hint="Available to send now" />
                <StatCard
                    title="Plan allowance left"
                    value={num(balance.plan)}
                    icon={CalendarClock}
                    tone="info"
                    hint={`${num(balance.plan_limit)} / month on ${plan ?? 'your plan'} · resets monthly`}
                />
                <StatCard title="Purchased credits" value={num(balance.purchased)} icon={Package} tone="success" hint="Never expire" />
                <StatCard title="Used this month" value={num(usage[usage.length - 1]?.credits ?? 0)} icon={CheckCircle2} tone="warning" />
            </div>

            <div className="panel mb-6">
                <h5 className="mb-1 text-lg font-bold">Buy an SMS bundle</h5>
                <p className="mb-5 text-sm text-white-dark">The plan allowance is used first each month, then purchased credits.</p>
                {packages.length === 0 ? (
                    <p className="text-sm text-white-dark">No SMS bundles are on sale right now. Please contact support.</p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {packages.map((p) => (
                            <div
                                key={p.id}
                                className={cn('relative flex flex-col rounded-xl border-2 p-5', p.is_popular ? 'border-primary' : 'border-white-light dark:border-[#1b2e4b]')}
                            >
                                {p.is_popular && (
                                    <span className="absolute -top-3 start-4 badge badge-primary inline-flex items-center gap-1 rounded-full!">
                                        <Sparkles className="h-3 w-3" /> Popular
                                    </span>
                                )}
                                <div className="text-sm font-bold text-white-dark uppercase">{p.name}</div>
                                <div className="mt-2 text-3xl font-extrabold text-black dark:text-white-light">{num(p.credits)}</div>
                                <div className="text-xs font-semibold text-white-dark">SMS credits</div>
                                <div className="mt-3 text-xl font-bold text-primary">{money(p.price, PLATFORM_CURRENCY)}</div>
                                <div className="text-xs text-white-dark">{money(p.per_sms, PLATFORM_CURRENCY, 2)} per SMS</div>
                                {p.description && <p className="mt-2 text-xs text-white-dark">{p.description}</p>}
                                <div className="mt-auto pt-4">
                                    {manage ? (
                                        <button className={cn('btn w-full', p.is_popular ? 'btn-primary' : 'btn-outline-primary')} onClick={() => buy(p)}>
                                            <ShoppingCart className="h-4 w-4" /> Buy
                                        </button>
                                    ) : (
                                        <p className="text-center text-xs text-white-dark">Ask an administrator to buy.</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 text-lg font-bold">Orders</h5>
                    <DataTable columns={orderColumns} rows={orders} empty="No orders yet" emptyDescription="Bundles you buy appear here until payment is confirmed." />
                </div>
                <div className="panel">
                    <h5 className="mb-2 text-lg font-bold">SMS used — last 6 months</h5>
                    <Chart
                        type="bar"
                        height={240}
                        series={[{ name: 'Credits', data: usage.map((u) => u.credits) }]}
                        options={{ xaxis: { categories: usage.map((u) => u.label) }, plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } }, colors: ['#4361ee'] }}
                    />
                </div>
            </div>

            <div className="panel">
                <h5 className="mb-4 text-lg font-bold">Credit history</h5>
                <DataTable
                    columns={[
                        { key: 'date', header: 'Date', render: (l) => <span className="whitespace-nowrap">{dateTime(l.created_at)}</span> },
                        { key: 'type', header: 'Type', render: (l) => <span className="badge badge-outline-primary">{titleCase(l.type)}</span> },
                        { key: 'description', header: 'Details', render: (l) => l.description },
                        {
                            key: 'credits',
                            header: 'Credits',
                            align: 'right',
                            render: (l) => (
                                <span className={cn('font-bold', l.credits >= 0 ? 'text-success' : 'text-danger')}>
                                    {l.credits >= 0 ? '+' : ''}
                                    {num(l.credits)}
                                </span>
                            ),
                        },
                        { key: 'balance', header: 'Purchased balance', align: 'right', render: (l) => num(l.balance_after) },
                    ]}
                    rows={ledger}
                    empty="No credit movements yet"
                    emptyDescription="Purchases, monthly allowances and adjustments appear here. Individual SMS usage is in the delivery log."
                />
            </div>

            <Modal open={!!paying} onClose={() => setPaying(null)} title={`Pay for ${paying?.reference ?? ''}`} size="lg">
                {paying && (
                    <form onSubmit={submitPay} className="space-y-4">
                        <div className="rounded-lg bg-primary-light p-4 dark:bg-primary-dark-light">
                            <div className="text-sm">
                                Amount to pay: <b className="text-lg text-primary">{money(paying.amount, PLATFORM_CURRENCY)}</b> for {num(paying.credits)} SMS
                            </div>
                            <div className="text-sm">
                                Use reference <b className="font-mono">{paying.reference}</b> when paying.
                            </div>
                        </div>
                        <div>
                            <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">
                                How to pay{payment.account_name ? ` — ${payment.account_name}` : ''}
                            </div>
                            <div className="rounded-md border border-white-light p-3 text-sm whitespace-pre-line dark:border-[#1b2e4b]">{payment.instructions}</div>
                        </div>
                        <FormGrid>
                            <Select
                                label="Paid via"
                                required
                                options={methods}
                                value={payForm.data.payment_method}
                                onChange={(e) => payForm.setData('payment_method', e.target.value)}
                                error={payForm.errors.payment_method}
                            />
                            <Input
                                label="Transaction / receipt number"
                                required
                                value={payForm.data.payment_reference}
                                onChange={(e) => payForm.setData('payment_reference', e.target.value)}
                                error={payForm.errors.payment_reference}
                                placeholder="e.g. QJK7ABC123"
                            />
                            <Input
                                label="Phone used to pay"
                                value={payForm.data.payer_phone}
                                onChange={(e) => payForm.setData('payer_phone', e.target.value)}
                                error={payForm.errors.payer_phone}
                            />
                            <Input label="Note" value={payForm.data.notes} onChange={(e) => payForm.setData('notes', e.target.value)} error={payForm.errors.notes} />
                        </FormGrid>
                        <div className="flex justify-end gap-2">
                            <button type="button" className="btn btn-outline-dark" onClick={() => setPaying(null)}>
                                Pay later
                            </button>
                            <button className="btn btn-primary" disabled={payForm.processing}>
                                Submit payment details
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
}
