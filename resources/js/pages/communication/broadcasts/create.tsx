import { Link, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Briefcase,
    CalendarClock,
    ClipboardList,
    Coins,
    Contact,
    Eye,
    GraduationCap,
    HandCoins,
    ListPlus,
    LoaderCircle,
    Mail,
    Save,
    Send,
    Smartphone,
    Trash2,
    Truck,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { DateInput } from '@/components/ui/date-picker';
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { toast } from '@/lib/swal';
import { cn, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import { postJson, smsCredits, VARIABLE_HINTS } from '../_components/helpers';

export type Audience = {
    type: string;
    school_class_id?: string | number;
    residence_type?: string;
    category?: string;
    department_id?: string | number;
    academic_year_id?: string | number;
    status?: string[];
    min_balance?: string | number;
    contact_group_id?: string | number;
    numbers?: string;
};

type Balance = { plan: number; purchased: number; total: number; plan_limit: number };
type Template = { id: number; name: string; channel: string; subject: string | null; body: string };
type Preview = {
    sms: number;
    email: number;
    credits: number;
    balance: number;
    enough: boolean;
    per_audience: { type: string; sms: number | null; email: number | null }[];
    samples: { recipient: string; name: string | null; subject: string | null; message: string }[];
};
type Props = {
    draft: { id?: number; title: string; channel: string; subject: string | null; body: string; audiences: Audience[]; scheduled_at?: string | null } | null;
    balance: Balance;
    templates: Template[];
    variables: string[];
    options: { classes: Option[]; departments: Option[]; academic_years: Option[]; groups: Option[]; applicant_statuses: Option[] };
};

export const AUDIENCE_TYPES: { type: string; label: string; icon: LucideIcon; hint: string }[] = [
    { type: 'guardians', label: 'Parents / guardians', icon: Users, hint: 'Parents of active students — one message per parent, wards combined.' },
    { type: 'defaulters', label: 'Fee defaulters', icon: HandCoins, hint: 'Parents whose children owe more than a set amount.' },
    { type: 'students', label: 'Students', icon: GraduationCap, hint: "Uses the phone/email on each student's portal account." },
    { type: 'staff', label: 'Staff / workers', icon: Briefcase, hint: 'Active employees, optionally by category or department.' },
    { type: 'applicants', label: 'Admission applicants', icon: ClipboardList, hint: 'Guardians of applicants, filtered by application status.' },
    { type: 'suppliers', label: 'Suppliers', icon: Truck, hint: 'Everyone in the supplier register.' },
    { type: 'group', label: 'Contact group', icon: Contact, hint: 'A saved list: board, PTA, alumni, partners …' },
    { type: 'custom', label: 'Custom numbers / emails', icon: ListPlus, hint: 'Type or paste phone numbers and/or email addresses.' },
];

const channels = [
    { value: 'sms', label: 'SMS', icon: Smartphone },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'both', label: 'SMS + Email', icon: Send },
] as const;

export default function BroadcastCreate({ draft, balance, templates, variables, options }: Props) {
    const editing = !!draft?.id;
    const form = useForm({
        action: 'send',
        title: draft?.title ?? '',
        channel: draft?.channel ?? 'sms',
        subject: draft?.subject ?? '',
        body: draft?.body ?? '',
        audiences: (draft?.audiences?.length ? draft.audiences : [{ type: 'guardians' }]) as Audience[],
        scheduled_at: draft?.scheduled_at ?? '',
        template_id: '',
    });
    const [when, setWhen] = useState<'now' | 'later'>(draft?.scheduled_at ? 'later' : 'now');
    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewing, setPreviewing] = useState(false);

    const { data } = form;
    const hasSms = data.channel !== 'email';
    const hasEmail = data.channel !== 'sms';
    const perMessage = hasSms ? smsCredits(data.body || ' ') : 0;
    const errors = form.errors as Record<string, string>;

    const setAudience = (i: number, patch: Partial<Audience>) =>
        form.setData(
            'audiences',
            data.audiences.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
        );
    const addAudience = (type: string) => form.setData('audiences', [...data.audiences, { type, ...(type === 'defaulters' ? { min_balance: '100000' } : {}) }]);
    const removeAudience = (i: number) =>
        form.setData(
            'audiences',
            data.audiences.filter((_, idx) => idx !== i),
        );

    const applyTemplate = (id: string) => {
        const t = templates.find((x) => String(x.id) === id);
        form.setData((d) => ({ ...d, template_id: id, ...(t ? { body: t.body, subject: t.subject ?? d.subject, channel: d.channel === 'both' ? 'both' : t.channel } : {}) }));
    };

    const insertVariable = (v: string) => {
        const el = document.getElementById('compose-body') as HTMLTextAreaElement | null;
        const body = data.body;
        if (!el) return form.setData('body', body + v);
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? body.length;
        form.setData('body', body.slice(0, start) + v + body.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + v.length, start + v.length);
        });
    };

    const payload = (action: string) => {
        const { template_id: _t, ...rest } = data;
        void _t;
        return { ...rest, action, scheduled_at: action === 'schedule' ? rest.scheduled_at : null };
    };

    const runPreview = async () => {
        form.clearErrors();
        setPreviewing(true);
        try {
            setPreview(await postJson<Preview>('/communication/broadcasts/preview', payload('send')));
        } catch (e) {
            const err = e as { errors?: Record<string, string[]>; message?: string };
            if (err.errors && Object.keys(err.errors).length) {
                form.setError(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])) as never);
                toast(Object.values(err.errors)[0][0], 'error');
            } else toast(err.message ?? 'Could not build the preview.', 'error');
        } finally {
            setPreviewing(false);
        }
    };

    const submit = (action: 'draft' | 'send' | 'schedule') => {
        form.transform(() => payload(action));
        const opts = { preserveScroll: true, onError: () => setPreview(null) };
        if (draft?.id) form.put(`/communication/broadcasts/${draft.id}`, opts);
        else form.post('/communication/broadcasts', opts);
    };

    const audienceLabel = (type: string) => AUDIENCE_TYPES.find((a) => a.type === type)?.label ?? titleCase(type);

    return (
        <>
            <PageHeader
                title={editing ? 'Edit broadcast' : 'New broadcast'}
                subtitle="Send one message to any mix of stakeholder groups by SMS, email or both. Duplicate contacts are removed automatically."
                breadcrumbs={[{ title: 'Communication' }, { title: 'Broadcast Centre', href: '/communication/broadcasts' }, { title: editing ? 'Edit' : 'New' }]}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="space-y-6 xl:col-span-2">
                    <div className="panel space-y-5">
                        <Input
                            label="Broadcast title (internal)"
                            required
                            value={data.title}
                            onChange={(e) => form.setData('title', e.target.value)}
                            error={form.errors.title}
                            placeholder="e.g. Closing day reminder — Term II"
                        />
                        <Field label="Channel">
                            <div className="grid grid-cols-3 gap-2">
                                {channels.map((c) => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => form.setData('channel', c.value)}
                                        className={cn('btn', data.channel === c.value ? 'btn-primary' : 'btn-outline-primary')}
                                    >
                                        <c.icon className="h-4 w-4" /> {c.label}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </div>

                    <div className="panel">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h5 className="text-lg font-bold">Audience</h5>
                                <p className="text-xs text-white-dark">Add one or more groups. Someone in several groups receives the message once.</p>
                            </div>
                        </div>
                        {errors.audiences && <p className="mb-3 text-sm text-danger">{errors.audiences}</p>}

                        <div className="space-y-3">
                            {data.audiences.map((a, i) => {
                                const meta = AUDIENCE_TYPES.find((t) => t.type === a.type);
                                const Icon = meta?.icon ?? Users;
                                const err = (k: string) => errors[`audiences.${i}.${k}`];
                                return (
                                    <div key={i} className="rounded-lg border border-white-light p-4 dark:border-[#1b2e4b]">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <span className="grid h-9 w-9 place-content-center rounded-lg bg-primary-light text-primary dark:bg-primary-dark-light">
                                                    <Icon className="h-5 w-5" />
                                                </span>
                                                <div>
                                                    <div className="font-bold text-black dark:text-white-light">{meta?.label}</div>
                                                    <div className="text-xs text-white-dark">{meta?.hint}</div>
                                                </div>
                                            </div>
                                            {data.audiences.length > 1 && (
                                                <button type="button" className="text-danger hover:opacity-70" title="Remove" onClick={() => removeAudience(i)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>

                                        {['guardians', 'defaulters', 'students'].includes(a.type) && (
                                            <FormGrid cols={a.type === 'defaulters' ? 3 : 2}>
                                                {a.type === 'defaulters' && (
                                                    <Input
                                                        label="Owing more than"
                                                        type="number"
                                                        min={0}
                                                        value={a.min_balance ?? ''}
                                                        onChange={(e) => setAudience(i, { min_balance: e.target.value })}
                                                        error={err('min_balance')}
                                                    />
                                                )}
                                                <Select
                                                    label="Class"
                                                    placeholder="All classes"
                                                    options={options.classes}
                                                    value={a.school_class_id ?? ''}
                                                    onChange={(e) => setAudience(i, { school_class_id: e.target.value })}
                                                    error={err('school_class_id')}
                                                />
                                                <Select
                                                    label="Residence"
                                                    placeholder="Day & boarding"
                                                    options={[
                                                        { value: 'day', label: 'Day scholars' },
                                                        { value: 'boarding', label: 'Boarders' },
                                                    ]}
                                                    value={a.residence_type ?? ''}
                                                    onChange={(e) => setAudience(i, { residence_type: e.target.value })}
                                                />
                                            </FormGrid>
                                        )}

                                        {a.type === 'staff' && (
                                            <FormGrid>
                                                <Select
                                                    label="Category"
                                                    placeholder="All staff"
                                                    options={[
                                                        { value: 'teaching', label: 'Teaching staff' },
                                                        { value: 'non_teaching', label: 'Non-teaching / support staff' },
                                                    ]}
                                                    value={a.category ?? ''}
                                                    onChange={(e) => setAudience(i, { category: e.target.value })}
                                                />
                                                <Select
                                                    label="Department"
                                                    placeholder="All departments"
                                                    options={options.departments}
                                                    value={a.department_id ?? ''}
                                                    onChange={(e) => setAudience(i, { department_id: e.target.value })}
                                                />
                                            </FormGrid>
                                        )}

                                        {a.type === 'applicants' && (
                                            <div className="space-y-3">
                                                <Field label="Application status" help="Leave all unticked to include every applicant.">
                                                    <div className="flex flex-wrap gap-2">
                                                        {options.applicant_statuses.map((s) => {
                                                            const on = (a.status ?? []).includes(String(s.value));
                                                            return (
                                                                <button
                                                                    key={s.value}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setAudience(i, {
                                                                            status: on ? (a.status ?? []).filter((x) => x !== s.value) : [...(a.status ?? []), String(s.value)],
                                                                        })
                                                                    }
                                                                    className={cn('badge cursor-pointer', on ? 'badge-primary' : 'badge-outline-primary')}
                                                                >
                                                                    {s.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </Field>
                                                <FormGrid>
                                                    <Select
                                                        label="Academic year"
                                                        placeholder="Any year"
                                                        options={options.academic_years}
                                                        value={a.academic_year_id ?? ''}
                                                        onChange={(e) => setAudience(i, { academic_year_id: e.target.value })}
                                                    />
                                                    <Select
                                                        label="Class applied for"
                                                        placeholder="Any class"
                                                        options={options.classes}
                                                        value={a.school_class_id ?? ''}
                                                        onChange={(e) => setAudience(i, { school_class_id: e.target.value })}
                                                    />
                                                </FormGrid>
                                            </div>
                                        )}

                                        {a.type === 'group' &&
                                            (options.groups.length ? (
                                                <Select
                                                    label="Contact group"
                                                    required
                                                    placeholder="Choose a group"
                                                    options={options.groups}
                                                    value={a.contact_group_id ?? ''}
                                                    onChange={(e) => setAudience(i, { contact_group_id: e.target.value })}
                                                    error={err('contact_group_id')}
                                                />
                                            ) : (
                                                <p className="text-sm text-warning">
                                                    No contact groups yet.{' '}
                                                    <Link href="/communication/groups" className="font-semibold underline">
                                                        Create one
                                                    </Link>{' '}
                                                    for board members, PTA, alumni and other contacts.
                                                </p>
                                            ))}

                                        {a.type === 'custom' && (
                                            <Textarea
                                                label="Phone numbers and/or emails"
                                                rows={3}
                                                value={a.numbers ?? ''}
                                                onChange={(e) => setAudience(i, { numbers: e.target.value })}
                                                error={err('numbers')}
                                                placeholder="0754 123 456, +255 713 000 111, name@example.com …"
                                                help="Separate with commas, spaces or new lines. Numbers are used for SMS and emails for email."
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4">
                            <div className="mb-2 text-xs font-bold tracking-wide text-white-dark uppercase">Add another group</div>
                            <div className="flex flex-wrap gap-2">
                                {AUDIENCE_TYPES.map((t) => (
                                    <button key={t.type} type="button" onClick={() => addAudience(t.type)} className="btn btn-sm btn-outline-secondary">
                                        <t.icon className="h-3.5 w-3.5" /> {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="panel space-y-5">
                        <h5 className="text-lg font-bold">Message</h5>
                        <Select
                            label="Start from a template"
                            placeholder="— Write from scratch —"
                            value={data.template_id}
                            onChange={(e) => applyTemplate(e.target.value)}
                            options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.channel.toUpperCase()})` }))}
                        />
                        {hasEmail && (
                            <Input label="Email subject" required value={data.subject} onChange={(e) => form.setData('subject', e.target.value)} error={form.errors.subject} />
                        )}
                        <div>
                            <Textarea
                                id="compose-body"
                                label="Message"
                                required
                                rows={7}
                                value={data.body}
                                onChange={(e) => form.setData('body', e.target.value)}
                                error={form.errors.body}
                                placeholder="Dear {name}, …"
                            />
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-1.5">
                                    {variables.map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            title={VARIABLE_HINTS[v]}
                                            onClick={() => insertVariable(v)}
                                            className="badge badge-outline-primary cursor-pointer hover:bg-primary hover:text-white"
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                                <div className={cn('text-xs font-bold', hasSms && data.body.length > 160 ? 'text-warning' : 'text-white-dark')}>
                                    {data.body.length} chars{hasSms && ` · ${perMessage} SMS credit${perMessage > 1 ? 's' : ''} per recipient`}
                                </div>
                            </div>
                            {hasSms && (
                                <p className="mt-1 text-xs text-white-dark">Variables expand per recipient, so the final length may differ. Avoid sensitive details in SMS.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="panel xl:sticky xl:top-24">
                        <h5 className="mb-4 text-lg font-bold">Delivery</h5>
                        <div className="mb-4 grid grid-cols-2 gap-2">
                            <button type="button" className={cn('btn', when === 'now' ? 'btn-primary' : 'btn-outline-primary')} onClick={() => setWhen('now')}>
                                <Send className="h-4 w-4" /> Send now
                            </button>
                            <button type="button" className={cn('btn', when === 'later' ? 'btn-primary' : 'btn-outline-primary')} onClick={() => setWhen('later')}>
                                <CalendarClock className="h-4 w-4" /> Schedule
                            </button>
                        </div>
                        {when === 'later' && (
                            <Field label="Send at" required error={form.errors.scheduled_at}>
                                <DateInput mode="datetime" className="form-input" value={data.scheduled_at} onChange={(e) => form.setData('scheduled_at', e.target.value)} />
                            </Field>
                        )}

                        {hasSms && (
                            <div className="my-4 rounded-lg bg-primary-light p-3 text-sm dark:bg-primary-dark-light">
                                <div className="flex items-center justify-between font-bold">
                                    <span className="flex items-center gap-1.5">
                                        <Coins className="h-4 w-4 text-primary" /> SMS balance
                                    </span>
                                    <span className={balance.total > 0 ? 'text-primary' : 'text-danger'}>{num(balance.total)}</span>
                                </div>
                                <div className="mt-1 text-xs text-white-dark">
                                    {num(balance.plan)} plan allowance + {num(balance.purchased)} purchased.{' '}
                                    <Link href="/communication/sms-credits" className="font-semibold text-primary underline">
                                        Buy SMS
                                    </Link>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {when === 'now' ? (
                                <button type="button" className="btn btn-success w-full" disabled={previewing || !data.body} onClick={runPreview}>
                                    {previewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview & send
                                </button>
                            ) : (
                                <>
                                    <button type="button" className="btn btn-outline-primary w-full" disabled={previewing || !data.body} onClick={runPreview}>
                                        {previewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview recipients
                                    </button>
                                    <button type="button" className="btn btn-success w-full" disabled={form.processing || !data.scheduled_at} onClick={() => submit('schedule')}>
                                        <CalendarClock className="h-4 w-4" /> Schedule broadcast
                                    </button>
                                </>
                            )}
                            <button type="button" className="btn btn-outline-dark w-full" disabled={form.processing} onClick={() => submit('draft')}>
                                <Save className="h-4 w-4" /> Save as draft
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-white-dark">
                            Up to 200 messages go out immediately; larger broadcasts are sent in the background and you can follow progress on the broadcast page.
                        </p>
                    </div>
                </div>
            </div>

            <Modal
                open={!!preview}
                onClose={() => setPreview(null)}
                title="Review before sending"
                size="lg"
                footer={
                    <>
                        <button className="btn btn-outline-dark" onClick={() => setPreview(null)}>
                            Back to edit
                        </button>
                        {when === 'now' && (
                            <button
                                className="btn btn-success"
                                disabled={form.processing || !preview || preview.sms + preview.email === 0 || !preview.enough}
                                onClick={() => submit('send')}
                            >
                                {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to{' '}
                                {num((preview?.sms ?? 0) + (preview?.email ?? 0))} recipients
                            </button>
                        )}
                    </>
                }
            >
                {preview && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="rounded-lg bg-primary-light p-3 dark:bg-primary-dark-light">
                                <div className="text-xl font-extrabold text-primary">{hasSms ? num(preview.sms) : '—'}</div>
                                <div className="text-[11px] font-bold text-white-dark uppercase">SMS recipients</div>
                            </div>
                            <div className="rounded-lg bg-info-light p-3 dark:bg-info-dark-light">
                                <div className="text-xl font-extrabold text-info">{hasEmail ? num(preview.email) : '—'}</div>
                                <div className="text-[11px] font-bold text-white-dark uppercase">Email recipients</div>
                            </div>
                            <div className="rounded-lg bg-warning-light p-3 dark:bg-warning-dark-light">
                                <div className="text-xl font-extrabold text-warning">{hasSms ? num(preview.credits) : '—'}</div>
                                <div className="text-[11px] font-bold text-white-dark uppercase">SMS credits</div>
                            </div>
                        </div>
                        {hasSms && !preview.enough && (
                            <p className="flex flex-wrap items-center gap-2 rounded-md bg-danger-light p-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">
                                <AlertTriangle className="h-4 w-4" /> Not enough SMS credits: this needs {num(preview.credits)}, your balance is {num(preview.balance)}.
                                <Link href="/communication/sms-credits" className="underline">
                                    Buy an SMS bundle
                                </Link>
                            </p>
                        )}
                        <div>
                            <h6 className="mb-2 text-sm font-bold">By group</h6>
                            <table className="table-compact w-full text-sm">
                                <tbody>
                                    {preview.per_audience.map((p, i) => (
                                        <tr key={i}>
                                            <td>{audienceLabel(p.type)}</td>
                                            {hasSms && <td className="text-end">{num(p.sms ?? 0)} SMS</td>}
                                            {hasEmail && <td className="text-end">{num(p.email ?? 0)} email</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {preview.per_audience.length > 1 && (
                                <p className="mt-1 text-xs text-white-dark">Totals above are after removing people who appear in more than one group.</p>
                            )}
                        </div>
                        {preview.sms + preview.email === 0 ? (
                            <p className="text-sm text-white-dark">No valid recipients match these groups (missing or invalid phone numbers / emails).</p>
                        ) : (
                            <div>
                                <h6 className="mb-2 text-sm font-bold">Sample messages</h6>
                                <div className="space-y-3">
                                    {preview.samples.map((s, i) => (
                                        <div key={i} className="rounded-lg border border-white-light p-3 dark:border-[#1b2e4b]">
                                            <div className="mb-1 text-xs font-bold text-white-dark">
                                                To {s.name ? `${s.name} · ` : ''}
                                                {s.recipient}
                                            </div>
                                            {s.subject && <div className="text-sm font-bold">{s.subject}</div>}
                                            <div className="text-sm whitespace-pre-line">{s.message}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
