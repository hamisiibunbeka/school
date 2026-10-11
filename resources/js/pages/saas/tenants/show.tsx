import { router, useForm } from '@inertiajs/react';
import { Ban, CalendarPlus, CheckCircle2, Copy, Hourglass, LogIn, Pencil, PlayCircle, Repeat, XCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { confirm, toast } from '@/lib/swal';
import { cn, date, dateTime, money, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';

type Plan = { id: number; name: string; price: string; billing_interval: string; max_students: number | null; max_users: number | null; max_schools: number; sms_credits: number };
type Props = {
    tenant: {
        id: number;
        name: string;
        slug: string;
        email: string | null;
        phone: string | null;
        country: string;
        status: string;
        plan_id: number | null;
        plan: Plan | null;
        trial_ends_at: string | null;
        subscription_ends_at: string | null;
        created_at: string | null;
    };
    schools: { id: number; name: string; code: string | null; level: string; region: string | null; is_active: boolean; students: number; users: number }[];
    admins: { id: number; name: string; email: string; phone: string | null; status: string; last_login_at: string | null }[];
    usage: { students: number; users: number; schools: number; sms: number };
    subscriptions: { id: number; plan: string | null; starts_at: string | null; ends_at: string | null; amount: string; status: string; reference: string | null; paid_at: string | null }[];
    tickets: { id: number; subject: string; priority: string; status: string; created_at: string }[];
    activity: { id: number; action: string; description: string | null; created_at: string; user: string | null }[];
    credentials: { name: string; email: string; password: string } | null;
    plans: Option[];
};

const transitions: Record<string, { action: string; label: string; icon: typeof Ban; cls: string; danger?: boolean }[]> = {
    trial: [
        { action: 'activate', label: 'Activate', icon: CheckCircle2, cls: 'btn-outline-success' },
        { action: 'suspend', label: 'Suspend', icon: Ban, cls: 'btn-outline-danger', danger: true },
        { action: 'cancel', label: 'Cancel', icon: XCircle, cls: 'btn-outline-dark', danger: true },
    ],
    active: [
        { action: 'grace', label: 'Grace period', icon: Hourglass, cls: 'btn-outline-warning' },
        { action: 'suspend', label: 'Suspend', icon: Ban, cls: 'btn-outline-danger', danger: true },
        { action: 'cancel', label: 'Cancel', icon: XCircle, cls: 'btn-outline-dark', danger: true },
    ],
    grace: [
        { action: 'activate', label: 'Activate', icon: CheckCircle2, cls: 'btn-outline-success' },
        { action: 'suspend', label: 'Suspend', icon: Ban, cls: 'btn-outline-danger', danger: true },
        { action: 'cancel', label: 'Cancel', icon: XCircle, cls: 'btn-outline-dark', danger: true },
    ],
    suspended: [
        { action: 'reactivate', label: 'Reactivate', icon: PlayCircle, cls: 'btn-outline-success' },
        { action: 'cancel', label: 'Cancel', icon: XCircle, cls: 'btn-outline-dark', danger: true },
    ],
    cancelled: [{ action: 'reactivate', label: 'Reactivate', icon: PlayCircle, cls: 'btn-outline-success' }],
};

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
    const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
    return (
        <div>
            <div className="mb-1 flex justify-between text-sm">
                <span className="font-semibold">{label}</span>
                <span className="text-white-dark">
                    {num(used)} / {max ? num(max) : '∞'}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                <div className={cn('h-full rounded-full', !max ? 'bg-info/40' : pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success')} style={{ width: max ? `${pct}%` : '100%' }} />
            </div>
        </div>
    );
}

export default function TenantShow({ tenant, schools, admins, usage, subscriptions, tickets, activity, credentials, plans }: Props) {
    const [modal, setModal] = useState<'plan' | 'trial' | 'edit' | null>(null);
    const [creds, setCreds] = useState(credentials);
    useEffect(() => setCreds(credentials), [credentials]);

    const planForm = useForm({ plan_id: String(tenant.plan_id ?? ''), reason: '' });
    const trialForm = useForm({ days: '14', reason: '' });
    const editForm = useForm({ name: tenant.name, email: tenant.email ?? '', phone: tenant.phone ?? '', country: tenant.country });

    const close = () => setModal(null);
    const changeStatus = async (t: (typeof transitions)['trial'][number]) => {
        const { confirmed, value } = await confirm({
            title: `${t.label} ${tenant.name}?`,
            text: t.action === 'suspend' || t.action === 'cancel' ? 'Users lose access immediately. Data is retained and can be reactivated. A reason is required for the audit log.' : 'A reason is required for the audit log.',
            confirmText: t.label,
            danger: t.danger,
            input: 'textarea',
            inputPlaceholder: 'Reason…',
        });
        if (confirmed) router.post(`/saas/tenants/${tenant.id}/status`, { action: t.action, reason: value }, { preserveScroll: true });
    };

    const enterSchool = async (id: number, name: string) => {
        const { confirmed } = await confirm({ title: `Enter ${name}?`, text: 'Support access is recorded in the audit trail. Use the school switcher to return to the platform console.', confirmText: 'Enter school' });
        if (confirmed) router.post('/switch-school', { school_id: id });
    };

    const ends = tenant.status === 'trial' ? tenant.trial_ends_at : tenant.subscription_ends_at;

    return (
        <>
            <PageHeader
                title={tenant.name}
                subtitle={`Tenant since ${date(tenant.created_at)} · ${tenant.slug}`}
                breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Tenants', href: '/saas/tenants' }, { title: tenant.name }]}
                actions={
                    <>
                        <button className="btn btn-outline-dark" onClick={() => setModal('edit')}>
                            <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button className="btn btn-outline-primary" onClick={() => setModal('plan')}>
                            <Repeat className="h-4 w-4" /> Change plan
                        </button>
                        <button className="btn btn-outline-info" onClick={() => setModal('trial')}>
                            <CalendarPlus className="h-4 w-4" /> Extend trial
                        </button>
                        {(transitions[tenant.status] ?? []).map((t) => (
                            <button key={t.action} className={cn('btn', t.cls)} onClick={() => changeStatus(t)}>
                                <t.icon className="h-4 w-4" /> {t.label}
                            </button>
                        ))}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="panel">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Account</h5>
                        <StatusBadge status={tenant.status} className="text-sm" />
                    </div>
                    <dl className="space-y-3 text-sm">
                        {[
                            ['Plan', tenant.plan ? `${tenant.plan.name} — ${money(tenant.plan.price)} / ${tenant.plan.billing_interval}` : '—'],
                            [tenant.status === 'trial' ? 'Trial ends' : 'Subscription ends', date(ends)],
                            ['Email', tenant.email ?? '—'],
                            ['Phone', tenant.phone ?? '—'],
                            ['Country', tenant.country],
                        ].map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3">
                                <dt className="text-white-dark">{k}</dt>
                                <dd className="text-end font-semibold">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Usage vs plan</h5>
                    <div className="space-y-4">
                        <Usage label="Active students" used={usage.students} max={tenant.plan?.max_students ?? null} />
                        <Usage label="Staff users" used={usage.users} max={tenant.plan?.max_users ?? null} />
                        <Usage label="Schools" used={usage.schools} max={tenant.plan?.max_schools ?? null} />
                        <Usage label="SMS credits (month)" used={usage.sms} max={tenant.plan?.sms_credits || null} />
                    </div>
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Administrators</h5>
                    {admins.length ? (
                        <ul className="space-y-3 text-sm">
                            {admins.map((a) => (
                                <li key={a.id}>
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">{a.name}</span>
                                        <StatusBadge status={a.status} />
                                    </div>
                                    <div className="text-xs text-white-dark">
                                        {a.email} {a.phone && `· ${a.phone}`}
                                    </div>
                                    <div className="text-xs text-white-dark">Last login: {a.last_login_at ? dateTime(a.last_login_at) : 'never'}</div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-white-dark">No administrator accounts.</p>
                    )}
                </div>
            </div>

            <div className="panel mb-6">
                <h5 className="mb-4 text-lg font-bold">Schools</h5>
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>School</th>
                                <th>Level</th>
                                <th>Region</th>
                                <th className="text-center!">Students</th>
                                <th className="text-center!">Users</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {schools.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <div className="font-bold">{s.name}</div>
                                        <div className="text-xs text-white-dark">{s.code ?? '—'}</div>
                                    </td>
                                    <td>{titleCase(s.level)}</td>
                                    <td>{s.region ?? '—'}</td>
                                    <td className="text-center!">{num(s.students)}</td>
                                    <td className="text-center!">{num(s.users)}</td>
                                    <td className="text-end!">
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => enterSchool(s.id, s.name)}>
                                            <LogIn className="h-4 w-4" /> Enter school
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 text-lg font-bold">Subscription history</h5>
                    {subscriptions.length ? (
                        <div className="table-responsive">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Reference</th>
                                        <th>Plan</th>
                                        <th>Period</th>
                                        <th className="text-end!">Amount</th>
                                        <th>Paid</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subscriptions.map((s) => (
                                        <tr key={s.id}>
                                            <td className="font-semibold">{s.reference ?? `#${s.id}`}</td>
                                            <td>{s.plan}</td>
                                            <td className="whitespace-nowrap">
                                                {date(s.starts_at)} → {date(s.ends_at)}
                                            </td>
                                            <td className="text-end! font-bold">{money(s.amount)}</td>
                                            <td>{date(s.paid_at)}</td>
                                            <td>
                                                <StatusBadge status={s.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyState title="No subscriptions yet" description="Record a payment from the Subscriptions page." />
                    )}
                    <h5 className="mt-8 mb-4 text-lg font-bold">Support tickets</h5>
                    {tickets.length ? (
                        <ul className="divide-y divide-white-light dark:divide-[#1b2e4b]">
                            {tickets.map((t) => (
                                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                    <div>
                                        <div className="font-semibold">{t.subject}</div>
                                        <div className="text-xs text-white-dark">
                                            #{t.id} · {dateTime(t.created_at)} · {titleCase(t.priority)}
                                        </div>
                                    </div>
                                    <StatusBadge status={t.status} />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-white-dark">No tickets from this tenant.</p>
                    )}
                </div>
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Platform activity</h5>
                    {activity.length ? (
                        <ol className="relative ms-2 border-s-2 border-primary/20">
                            {activity.map((a) => (
                                <li key={a.id} className="mb-5 ms-4">
                                    <span className="absolute -start-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary" />
                                    <div className="text-sm font-semibold">{titleCase(a.action)}</div>
                                    <div className="text-xs text-white-dark">{a.description}</div>
                                    <div className="text-[11px] text-white-dark">
                                        {dateTime(a.created_at)} · {a.user ?? 'System'}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="text-sm text-white-dark">No platform actions recorded yet.</p>
                    )}
                </div>
            </div>

            <Modal open={modal === 'plan'} onClose={close} title="Change plan">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        planForm.post(`/saas/tenants/${tenant.id}/plan`, { preserveScroll: true, onSuccess: close });
                    }}
                    className="space-y-4"
                >
                    <Select label="New plan" value={planForm.data.plan_id} onChange={(e) => planForm.setData('plan_id', e.target.value)} options={plans} error={planForm.errors.plan_id} />
                    <Textarea label="Reason" required value={planForm.data.reason} onChange={(e) => planForm.setData('reason', e.target.value)} error={planForm.errors.reason} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={close}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={planForm.processing}>
                            Change plan
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={modal === 'trial'} onClose={close} title="Extend trial">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        trialForm.post(`/saas/tenants/${tenant.id}/trial`, { preserveScroll: true, onSuccess: close });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm text-white-dark">Current trial end: {date(tenant.trial_ends_at)}. Extensions start from the later of today or the current end date.</p>
                    <Input label="Extend by (days)" type="number" min={1} max={180} value={trialForm.data.days} onChange={(e) => trialForm.setData('days', e.target.value)} error={trialForm.errors.days} />
                    <Textarea label="Reason" required value={trialForm.data.reason} onChange={(e) => trialForm.setData('reason', e.target.value)} error={trialForm.errors.reason} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={close}>
                            Cancel
                        </button>
                        <button className="btn btn-info" disabled={trialForm.processing}>
                            Extend trial
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={modal === 'edit'} onClose={close} title="Edit tenant details">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        editForm.put(`/saas/tenants/${tenant.id}`, { preserveScroll: true, onSuccess: close });
                    }}
                    className="space-y-4"
                >
                    <FormGrid>
                        <Input label="Name" required value={editForm.data.name} onChange={(e) => editForm.setData('name', e.target.value)} error={editForm.errors.name} wrapperClassName="sm:col-span-2" />
                        <Input label="Email" type="email" value={editForm.data.email} onChange={(e) => editForm.setData('email', e.target.value)} error={editForm.errors.email} />
                        <Input label="Phone" value={editForm.data.phone} onChange={(e) => editForm.setData('phone', e.target.value)} error={editForm.errors.phone} />
                        <Input label="Country" value={editForm.data.country} onChange={(e) => editForm.setData('country', e.target.value)} error={editForm.errors.country} />
                    </FormGrid>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={close}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={editForm.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!creds} onClose={() => setCreds(null)} title="Administrator sign-in details" size="sm">
                {creds && (
                    <div className="space-y-4">
                        <p className="text-sm text-white-dark">Share these securely with {creds.name}. The password will not be shown again.</p>
                        <div className="space-y-2 rounded-lg bg-[#f6f8fa] p-4 font-mono text-sm dark:bg-[#1a2941]">
                            <div>Email: {creds.email}</div>
                            <div>
                                Password: <strong className="text-primary">{creds.password}</strong>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                className="btn btn-outline-primary"
                                onClick={() => {
                                    void navigator.clipboard?.writeText(`Email: ${creds.email}\nPassword: ${creds.password}`);
                                    toast('Copied to clipboard');
                                }}
                            >
                                <Copy className="h-4 w-4" /> Copy
                            </button>
                            <button className="btn btn-primary" onClick={() => setCreds(null)}>
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
