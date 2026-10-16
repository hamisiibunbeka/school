import { useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Loader2, LogIn, MessageSquare, RefreshCw, Save, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormSection, Input, Select, Switch } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { cn, num, titleCase } from '@/lib/utils';
import { postJson } from '../communication/_components/helpers';

type SchoolRow = {
    id: number;
    name: string;
    tenant: string | null;
    plan: string | null;
    site_url: string;
    template: string | null;
    published: boolean;
    available: boolean;
    custom_domain: string | null;
};

type SmsInfo = { driver: string; configured: boolean; default_sender: string; key_hint: string | null };

type Props = { homepage: { enabled: boolean; school_id: number | null }; schools: SchoolRow[]; appUrl: string; sms: SmsInfo };

export default function PlatformSettings({ homepage, schools, appUrl, sms }: Props) {
    const form = useForm({ enabled: homepage.enabled, school_id: homepage.school_id ? String(homepage.school_id) : '' });
    const selected = schools.find((s) => String(s.id) === form.data.school_id);
    const live = form.data.enabled && selected?.published && selected.available;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ enabled: d.enabled, school_id: d.school_id ? Number(d.school_id) : null }));
        form.put('/saas/settings', { preserveScroll: true });
    };

    return (
        <>
            <PageHeader title="Platform Settings" subtitle="Platform-wide options that are not tied to a single school." breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Platform Settings' }]} />

            <form onSubmit={submit} className="panel max-w-4xl">
                <FormSection title="Main domain homepage" description={`What visitors see when they open ${appUrl}`}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {[
                            { on: true, icon: Globe, title: 'Show a school website', text: 'The chosen school’s published website loads on the home page. A “Portal login” link takes staff, parents and students to the system.' },
                            { on: false, icon: LogIn, title: 'Go straight to login', text: 'The home page redirects to the login page (signed-in users go to their dashboard).' },
                        ].map(({ on, icon: Icon, title, text }) => (
                            <button
                                key={title}
                                type="button"
                                onClick={() => form.setData('enabled', on)}
                                className={cn('flex items-start gap-3 rounded-lg border-2 p-4 text-start transition', form.data.enabled === on ? 'border-primary bg-primary-light/40 dark:bg-primary-dark-light' : 'border-white-light hover:border-primary/50 dark:border-[#1b2e4b]')}
                            >
                                <span className={cn('grid h-10 w-10 shrink-0 place-content-center rounded-lg', form.data.enabled === on ? 'bg-primary text-white' : 'bg-white-light text-white-dark dark:bg-[#1b2e4b]')}>
                                    <Icon className="h-5 w-5" />
                                </span>
                                <span>
                                    <span className="block font-bold">{title}</span>
                                    <span className="text-xs text-white-dark">{text}</span>
                                </span>
                            </button>
                        ))}
                    </div>

                    {form.data.enabled && (
                        <div className="mt-5 space-y-4">
                            <Select
                                label="School website to show"
                                required
                                placeholder="Select a school"
                                value={form.data.school_id}
                                onChange={(e) => form.setData('school_id', e.target.value)}
                                options={schools.map((s) => ({ value: String(s.id), label: `${s.name}${s.published ? '' : ' (not published)'}` }))}
                                error={form.errors.school_id}
                            />

                            {selected && (
                                <div className="rounded-lg border border-white-light p-4 text-sm dark:border-[#1b2e4b]">
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                        <strong>{selected.name}</strong>
                                        {selected.plan && <span className="badge badge-soft-primary">{selected.plan}</span>}
                                        {selected.template && <span className="badge badge-soft-info">{titleCase(selected.template)} template</span>}
                                        <span className={cn('badge', selected.published ? 'badge-soft-success' : 'badge-soft-warning')}>{selected.published ? 'Published' : 'Not published'}</span>
                                        {!selected.available && <span className="badge badge-soft-danger">Subscription inactive</span>}
                                    </div>
                                    {live ? (
                                        <p className="flex items-start gap-2 text-success">
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {appUrl} will load this school’s website.
                                        </p>
                                    ) : (
                                        <p className="flex items-start gap-2 text-warning">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                            {!selected.available
                                                ? 'This school’s subscription is not active, so the home page will redirect to login.'
                                                : 'This website is not published yet, so the home page will keep redirecting to login until the school publishes it (School Website → Website Builder → Publish).'}
                                        </p>
                                    )}
                                    <a href={selected.site_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                                        <ExternalLink className="h-3.5 w-3.5" /> Preview {selected.site_url}
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    <p className="mt-5 text-xs text-white-dark">
                        Schools on a plan with custom domains always get their own website on their domain’s home page, whatever is chosen here.
                    </p>
                </FormSection>

                <div className="mt-6 flex justify-center">
                    <button className="btn btn-primary" disabled={form.processing}>
                        <Save className="h-4 w-4" /> Save settings
                    </button>
                </div>
            </form>
            <SmsProvider sms={sms} />
        </>
    );
}

type SmsStatus = { ok: boolean; balance?: number; senders?: { senderid: string; status: string }[]; message?: string };

/** SMS provider status: driver, credentials, live Beem balance and sender IDs, and a test send. */
function SmsProvider({ sms }: { sms: SmsInfo }) {
    const [status, setStatus] = useState<SmsStatus | null>(null);
    const [checking, setChecking] = useState(false);
    const [phone, setPhone] = useState('');
    const [sender, setSender] = useState('');
    const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
    const [sending, setSending] = useState(false);
    const live = sms.driver === 'beem' && sms.configured;

    const check = async () => {
        setChecking(true);
        try {
            const res = await fetch('/saas/settings/sms-status', { credentials: 'same-origin', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
            setStatus(await res.json());
        } catch {
            setStatus({ ok: false, message: 'Could not reach the server.' });
        } finally {
            setChecking(false);
        }
    };

    const sendTest = async (e: FormEvent) => {
        e.preventDefault();
        setSending(true);
        setTest(null);
        try {
            const res = await postJson<{ ok: boolean; message: string }>('/saas/settings/sms-test', { phone, sender: sender || null });
            setTest(res);
        } catch (err) {
            const error = err as { message?: string; errors?: Record<string, string[]> };
            setTest({ ok: false, message: Object.values(error.errors ?? {})[0]?.[0] ?? error.message ?? 'The test SMS failed.' });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="panel mt-6 max-w-4xl">
            <FormSection title="SMS provider" description="Bulk SMS, fee reminders and notifications are sent through Beem Africa with one platform account.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                        { label: 'Active driver', value: sms.driver === 'beem' ? 'Beem Africa' : 'Log only (no SMS sent)', good: sms.driver === 'beem' },
                        { label: 'Beem credentials', value: sms.configured ? `Configured (key ${sms.key_hint})` : 'Not set', good: sms.configured },
                        { label: 'Default sender ID', value: sms.default_sender || '—', good: !!sms.default_sender },
                    ].map((c) => (
                        <div key={c.label} className="rounded-lg border border-white-light p-3 dark:border-[#1b2e4b]">
                            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">{c.label}</div>
                            <div className={cn('mt-1 font-bold', c.good ? 'text-success' : 'text-warning')}>{c.value}</div>
                        </div>
                    ))}
                </div>

                {!live && (
                    <p className="mt-4 flex items-start gap-2 rounded-md bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            Messages are only recorded, not sent. To go live, set <code>SMS_DRIVER=beem</code>, <code>BEEM_API_KEY</code>, <code>BEEM_SECRET_KEY</code> and <code>BEEM_SENDER_ID</code> in the server's <code>.env</code> (from Beem: SMS → API Setup), then run <code>php artisan config:clear</code>.
                        </span>
                    </p>
                )}

                {sms.configured && (
                    <div className="mt-5">
                        <button type="button" className="btn btn-outline-primary" onClick={check} disabled={checking}>
                            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check Beem balance &amp; sender IDs
                        </button>
                        {status && !status.ok && <p className="mt-3 text-sm font-semibold text-danger">{status.message}</p>}
                        {status?.ok && (
                            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="rounded-lg bg-primary-light p-4 dark:bg-primary-dark-light">
                                    <div className="text-xs font-bold tracking-wide text-white-dark uppercase">Beem SMS balance</div>
                                    <div className="mt-1 text-2xl font-extrabold text-primary">{num(status.balance ?? 0)}</div>
                                    <div className="text-xs text-white-dark">credits on the platform account</div>
                                </div>
                                <div className="sm:col-span-2">
                                    <div className="mb-2 text-xs font-bold tracking-wide text-white-dark uppercase">Sender IDs on Beem</div>
                                    {status.senders?.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {status.senders.map((s) => (
                                                <span key={s.senderid} className={cn('badge', /active|approved/i.test(s.status) ? 'badge-soft-success' : 'badge-soft-warning')}>
                                                    {s.senderid} · {titleCase(s.status)}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-white-dark">No sender IDs registered yet. Request one in the Beem dashboard (SMS → Sender ID).</p>
                                    )}
                                    <p className="mt-2 text-xs text-white-dark">A school's own sender ID (School Settings → General) must appear here as active, or its messages fail with "sender ID not registered".</p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={sendTest} className="mt-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                            <Input label="Send a test SMS to" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" />
                            <Input label="Sender ID (optional)" value={sender} maxLength={11} onChange={(e) => setSender(e.target.value)} placeholder={sms.default_sender} />
                            <button className="btn btn-primary" disabled={sending || !phone}>
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
                            </button>
                        </form>
                        {test && (
                            <p className={cn('mt-3 flex items-center gap-2 text-sm font-semibold', test.ok ? 'text-success' : 'text-danger')}>
                                {test.ok ? <CheckCircle2 className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />} {test.message}
                            </p>
                        )}
                    </div>
                )}
            </FormSection>
        </div>
    );
}