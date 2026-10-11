import { useForm } from '@inertiajs/react';
import { AlertTriangle, ArrowUpCircle, CalendarClock, CheckCircle2, CreditCard, LifeBuoy, School, Smartphone, Users, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cn, date, dateTime, money, num, titleCase } from '@/lib/utils';

type Plan = {
    id: number;
    name: string;
    code: string;
    price: string;
    billing_interval: string;
    max_students: number | null;
    max_users: number | null;
    max_schools: number;
    sms_credits: number;
    modules: string[];
};
type Sub = { id: number; plan: string | null; starts_at: string | null; ends_at: string | null; amount: string; status: string; reference: string | null; paid_at: string | null };
type Props = {
    tenant: { name: string; status: string; trial_ends_at: string | null; subscription_ends_at: string | null; days_left: number | null };
    plan: Plan | null;
    usage: { students: number; users: number; schools: number; sms: number };
    history: Sub[];
    plans: Plan[];
    tickets: { id: number; subject: string; status: string; priority: string; created_at: string }[];
};

function Meter({ label, icon: Icon, used, max, hint }: { label: string; icon: LucideIcon; used: number; max: number | null; hint?: string }) {
    const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
    const tone = !max ? 'bg-info' : pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success';
    return (
        <div className="panel">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon className="h-4 w-4 text-primary" /> {label}
                </div>
                {max && pct >= 80 && <AlertTriangle className={cn('h-4 w-4', pct >= 100 ? 'text-danger' : 'text-warning')} />}
            </div>
            <div className="text-2xl font-extrabold">
                {num(used)} <span className="text-sm font-semibold text-white-dark">/ {max ? num(max) : 'Unlimited'}</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: max ? `${pct}%` : '100%', opacity: max ? 1 : 0.25 }} />
            </div>
            <div className="mt-2 text-xs text-white-dark">{max ? (pct >= 100 ? 'Limit reached — upgrade to add more.' : pct >= 80 ? `${pct}% used — approaching the limit.` : `${pct}% used`) : (hint ?? 'No limit on your plan')}</div>
        </div>
    );
}

export default function Subscription({ tenant, plan, usage, history, plans, tickets }: Props) {
    const can = useCan();
    const [open, setOpen] = useState(false);
    const form = useForm({ plan_id: '', notes: '' });
    const ends = tenant.status === 'trial' ? tenant.trial_ends_at : tenant.subscription_ends_at;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/admin/subscription/upgrade', { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const columns: Column<Sub>[] = [
        { key: 'reference', header: 'Reference', render: (s) => <span className="font-semibold">{s.reference ?? `#${s.id}`}</span> },
        { key: 'plan', header: 'Plan', render: (s) => s.plan ?? '—' },
        { key: 'period', header: 'Period', render: (s) => `${date(s.starts_at)} → ${date(s.ends_at)}` },
        { key: 'amount', header: 'Amount', align: 'right', render: (s) => <span className="font-bold">{money(s.amount)}</span> },
        { key: 'paid', header: 'Paid on', render: (s) => date(s.paid_at) },
        { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    ];

    return (
        <>
            <PageHeader
                title="Subscription"
                subtitle={`${tenant.name} — plan, usage and billing history.`}
                breadcrumbs={[{ title: 'Administration' }, { title: 'Subscription' }]}
                actions={
                    can('administration.manage') && (
                        <button className="btn btn-primary" onClick={() => setOpen(true)}>
                            <ArrowUpCircle className="h-4 w-4" /> Request upgrade
                        </button>
                    )
                }
            />

            <div className="panel mb-6 overflow-hidden p-0">
                <div className="flex flex-col gap-6 bg-gradient-to-r from-[#4361ee] to-[#805dca] p-6 text-white md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="text-xs font-bold tracking-wider uppercase opacity-80">Current plan</div>
                        <div className="mt-1 text-3xl font-extrabold">{plan?.name ?? 'No plan'}</div>
                        {plan && (
                            <div className="mt-1 text-sm opacity-90">
                                {money(plan.price)} / {plan.billing_interval.replace('ly', '')}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-6">
                        <div>
                            <div className="text-xs font-bold uppercase opacity-80">Status</div>
                            <div className="mt-1">
                                <span className="badge bg-white/20 text-sm text-white">{titleCase(tenant.status)}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase opacity-80">{tenant.status === 'trial' ? 'Trial ends' : 'Renews / expires'}</div>
                            <div className="mt-1 text-lg font-bold">{date(ends)}</div>
                        </div>
                        {tenant.days_left !== null && (
                            <div>
                                <div className="text-xs font-bold uppercase opacity-80">Days left</div>
                                <div className={cn('mt-1 text-lg font-bold', tenant.days_left <= 14 && 'text-[#ffd76a]')}>{tenant.days_left < 0 ? 'Expired' : tenant.days_left}</div>
                            </div>
                        )}
                    </div>
                </div>
                {tenant.days_left !== null && tenant.days_left <= 14 && (
                    <div className="flex items-center gap-2 bg-warning-light px-6 py-3 text-sm font-semibold text-warning dark:bg-warning-dark-light">
                        <CalendarClock className="h-4 w-4" /> Your {tenant.status === 'trial' ? 'trial' : 'subscription'} {tenant.days_left < 0 ? 'has ended' : `ends in ${tenant.days_left} days`}. Renew to avoid interruption — your data is always retained.
                    </div>
                )}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Meter label="Active students" icon={Users} used={usage.students} max={plan?.max_students ?? null} />
                <Meter label="Staff users" icon={CreditCard} used={usage.users} max={plan?.max_users ?? null} />
                <Meter label="Schools / campuses" icon={School} used={usage.schools} max={plan?.max_schools ?? null} />
                <Meter label="SMS credits this month" icon={Smartphone} used={usage.sms} max={plan?.sms_credits || null} hint="No SMS allowance on this plan" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 text-lg font-bold">Subscription history</h5>
                    <DataTable columns={columns} rows={history} empty="No subscription invoices yet" />
                </div>
                <div className="space-y-6">
                    {plan && (
                        <div className="panel">
                            <h5 className="mb-3 text-lg font-bold">Included modules</h5>
                            <div className="flex flex-wrap gap-1.5">
                                {plan.modules.map((m) => (
                                    <span key={m} className="badge badge-soft-primary">
                                        <CheckCircle2 className="me-1 inline h-3 w-3" />
                                        {titleCase(m)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="panel">
                        <h5 className="mb-3 flex items-center gap-2 text-lg font-bold">
                            <LifeBuoy className="h-5 w-5 text-info" /> Support requests
                        </h5>
                        {tickets.length ? (
                            <ul className="space-y-3">
                                {tickets.map((t) => (
                                    <li key={t.id} className="flex items-start justify-between gap-3 text-sm">
                                        <div>
                                            <div className="font-semibold">{t.subject}</div>
                                            <div className="text-xs text-white-dark">{dateTime(t.created_at)}</div>
                                        </div>
                                        <StatusBadge status={t.status} />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-white-dark">No support requests yet.</p>
                        )}
                    </div>
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Request a plan change" size="xl">
                <form onSubmit={submit} className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {plans.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => form.setData('plan_id', String(p.id))}
                                className={cn(
                                    'rounded-lg border-2 p-4 text-start transition',
                                    form.data.plan_id === String(p.id) ? 'border-primary bg-primary-light dark:bg-primary-dark-light' : 'border-white-light hover:border-primary/50 dark:border-[#1b2e4b]',
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold">{p.name}</span>
                                    {plan?.id === p.id && <span className="badge badge-soft-success">Current</span>}
                                </div>
                                <div className="mt-2 text-lg font-extrabold text-primary">{money(p.price)}</div>
                                <div className="text-xs text-white-dark">per {p.billing_interval.replace('ly', '')}</div>
                                <ul className="mt-3 space-y-1 text-xs">
                                    <li>{p.max_students ? `${num(p.max_students)} students` : 'Unlimited students'}</li>
                                    <li>{p.max_users ? `${num(p.max_users)} staff users` : 'Unlimited users'}</li>
                                    <li>
                                        {p.max_schools} school{p.max_schools > 1 ? 's' : ''}
                                    </li>
                                    <li>{num(p.sms_credits)} SMS credits / month</li>
                                </ul>
                            </button>
                        ))}
                    </div>
                    {form.errors.plan_id && <p className="text-sm text-danger">{form.errors.plan_id}</p>}
                    <Select label="Requested plan" required placeholder="Choose a plan" value={form.data.plan_id} onChange={(e) => form.setData('plan_id', e.target.value)} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
                    <Textarea label="Notes for the platform team" value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} placeholder="e.g. We are opening a second campus in January." />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing || !form.data.plan_id}>
                            Send request
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
