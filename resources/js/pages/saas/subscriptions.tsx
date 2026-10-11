import { Link, router, useForm } from '@inertiajs/react';
import { CheckCircle2, CircleDollarSign, Clock, Plus, Receipt, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { confirm } from '@/lib/swal';
import { date, money, num, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Row = {
    id: number;
    tenant_id: number;
    tenant: string | null;
    tenant_status: string | null;
    plan: string | null;
    starts_at: string | null;
    ends_at: string | null;
    amount: string;
    status: string;
    reference: string | null;
    paid_at: string | null;
};
type Props = {
    subscriptions: Paginated<Row>;
    filters: { search: string; status: string; plan: string };
    tenants: (Option & { plan_id: number | null; subscription_ends_at: string | null })[];
    plans: (Option & { price: string; billing_interval: string })[];
    stats: { collected_year: string; collected_month: string; pending: string; pending_count: number; active: number };
};

export default function Subscriptions({ subscriptions, filters: initial, tenants, plans, stats }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [paying, setPaying] = useState<Row | null>(null);
    const form = useForm({ tenant_id: '', plan_id: '', periods: '1', starts_at: '', amount: '', reference: '', paid: true, paid_at: today() });
    const payForm = useForm({ paid_at: today(), reference: '' });

    const plan = plans.find((p) => String(p.value) === form.data.plan_id);

    const pickTenant = (id: string) => {
        const t = tenants.find((x) => String(x.value) === id);
        const p = plans.find((x) => x.value === t?.plan_id) ?? plans[0];
        form.setData((d) => ({ ...d, tenant_id: id, plan_id: p ? String(p.value) : '', amount: p ? String(Number(p.price) * Number(d.periods || 1)) : d.amount }));
    };
    const pickPlan = (id: string) => {
        const p = plans.find((x) => String(x.value) === id);
        form.setData((d) => ({ ...d, plan_id: id, amount: p ? String(Number(p.price) * Number(d.periods || 1)) : d.amount }));
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/saas/subscriptions', { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const columns: Column<Row>[] = [
        {
            key: 'reference',
            header: 'Invoice',
            render: (s) => (
                <div>
                    <div className="font-bold">{s.reference ?? `#${s.id}`}</div>
                    <Link href={`/saas/tenants/${s.tenant_id}`} className="text-xs text-primary hover:underline">
                        {s.tenant}
                    </Link>
                </div>
            ),
        },
        { key: 'plan', header: 'Plan', render: (s) => s.plan ?? '—' },
        { key: 'period', header: 'Period', render: (s) => <span className="whitespace-nowrap">{`${date(s.starts_at)} → ${date(s.ends_at)}`}</span> },
        { key: 'amount', header: 'Amount', align: 'right', render: (s) => <span className="font-bold">{money(s.amount)}</span> },
        { key: 'paid', header: 'Paid on', render: (s) => date(s.paid_at) },
        { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) => (
                <div className="flex justify-end gap-1">
                    {s.status === 'pending' && (
                        <IconButton
                            icon={CheckCircle2}
                            title="Record payment"
                            className="text-success"
                            onClick={() => {
                                payForm.setData({ paid_at: today(), reference: s.reference ?? '' });
                                setPaying(s);
                            }}
                        />
                    )}
                    {['pending', 'active'].includes(s.status) && (
                        <IconButton
                            icon={XCircle}
                            title="Cancel"
                            className="text-danger"
                            onClick={async () => {
                                const { confirmed, value } = await confirm({ title: `Cancel ${s.reference}?`, text: 'Give a reason for the audit log. The tenant status is not changed automatically.', confirmText: 'Cancel invoice', danger: true, input: 'textarea' });
                                if (confirmed) router.post(`/saas/subscriptions/${s.id}/cancel`, { reason: value }, { preserveScroll: true });
                            }}
                        />
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Subscriptions"
                subtitle="Subscription invoices and payments across all tenants."
                breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Subscriptions' }]}
                actions={
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            form.reset();
                            form.clearErrors();
                            setOpen(true);
                        }}
                    >
                        <Plus className="h-4 w-4" /> Record payment / invoice
                    </button>
                }
            />
            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Collected this year" value={money(stats.collected_year)} icon={CircleDollarSign} tone="success" />
                <StatCard title="Collected this month" value={money(stats.collected_month)} icon={Receipt} tone="primary" />
                <StatCard title="Pending invoices" value={money(stats.pending)} icon={Clock} tone="warning" hint={`${num(stats.pending_count)} unpaid`} />
                <StatCard title="Active subscriptions" value={num(stats.active)} icon={CheckCircle2} tone="info" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search tenant or reference…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={['pending', 'active', 'expired', 'cancelled'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} placeholder="Any status" />
                    <FilterSelect value={filters.plan} onChange={(v) => setFilter('plan', v)} options={plans} placeholder="All plans" />
                </FilterBar>
                <DataTable columns={columns} paginated={subscriptions} empty="No subscription invoices" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Record subscription payment" size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Select label="Tenant" required placeholder="Select tenant" value={form.data.tenant_id} onChange={(e) => pickTenant(e.target.value)} options={tenants} error={form.errors.tenant_id} wrapperClassName="sm:col-span-2" />
                        <Select label="Plan" required placeholder="Select plan" value={form.data.plan_id} onChange={(e) => pickPlan(e.target.value)} options={plans} error={form.errors.plan_id} />
                        <Input
                            label={`Periods (${plan?.billing_interval ?? 'billing interval'})`}
                            type="number"
                            min={1}
                            max={36}
                            value={form.data.periods}
                            onChange={(e) => form.setData((d) => ({ ...d, periods: e.target.value, amount: plan ? String(Number(plan.price) * Number(e.target.value || 1)) : d.amount }))}
                            error={form.errors.periods}
                        />
                        <Input label="Start date" type="date" value={form.data.starts_at} onChange={(e) => form.setData('starts_at', e.target.value)} error={form.errors.starts_at} help="Blank = continue from the current end date (or today)." />
                        <Input label="Amount (TZS)" type="number" min={0} required value={form.data.amount} onChange={(e) => form.setData('amount', e.target.value)} error={form.errors.amount} />
                        <Input label="Reference" value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} error={form.errors.reference} placeholder="Bank / M-Pesa ref (auto if blank)" />
                        {form.data.paid && <Input label="Paid on" type="date" value={form.data.paid_at} onChange={(e) => form.setData('paid_at', e.target.value)} error={form.errors.paid_at} />}
                    </FormGrid>
                    <Checkbox label="Payment received — activate / extend the tenant now" checked={form.data.paid} onChange={(e) => form.setData('paid', e.target.checked)} />
                    <p className="text-xs text-white-dark">Unpaid entries are saved as pending invoices and can be marked paid later.</p>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {form.data.paid ? 'Record payment' : 'Issue invoice'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!paying} onClose={() => setPaying(null)} title={`Record payment — ${paying?.reference ?? ''}`} size="sm">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        payForm.post(`/saas/subscriptions/${paying?.id}/paid`, { preserveScroll: true, onSuccess: () => setPaying(null) });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm">
                        {paying?.tenant} · <strong>{money(paying?.amount)}</strong>
                    </p>
                    <Input label="Paid on" type="date" value={payForm.data.paid_at} onChange={(e) => payForm.setData('paid_at', e.target.value)} error={payForm.errors.paid_at} />
                    <Input label="Payment reference" value={payForm.data.reference} onChange={(e) => payForm.setData('reference', e.target.value)} error={payForm.errors.reference} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setPaying(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-success" disabled={payForm.processing}>
                            Mark paid
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
