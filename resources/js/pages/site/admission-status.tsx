import { Link, useForm } from '@inertiajs/react';
import { CheckCircle2, Copy, Loader2, PartyPopper, Search, SearchX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { cn, date } from '@/lib/utils';
import { Field } from './_components/form';
import type { ApplicationSummary, SiteChrome } from './_components/types';
import { Section, SiteLayout, useTheme } from './_templates';

const FLOW = ['submitted', 'under_review', 'interview', 'accepted', 'enrolled'];
const FLOW_LABELS: Record<string, string> = { submitted: 'Received', under_review: 'Review', interview: 'Interview', accepted: 'Decision', enrolled: 'Enrolled' };

function Progress({ status }: { status: string }) {
    const closed = ['rejected', 'withdrawn'].includes(status);
    const index = status === 'waitlisted' || status === 'awaiting_fees' ? 3 : FLOW.indexOf(status);
    return (
        <ol className="grid grid-cols-5 gap-1.5">
            {FLOW.map((s, i) => {
                const reached = !closed && i <= index;
                return (
                    <li key={s} className="text-center">
                        <div className={cn('h-2 rounded-full', reached ? 'bg-[var(--site-primary)]' : 'bg-slate-200')} />
                        <span className={cn('mt-1.5 block text-[11px] font-bold', reached ? 'text-slate-700' : 'text-slate-400')}>{FLOW_LABELS[s]}</span>
                    </li>
                );
            })}
        </ol>
    );
}

function ApplicationCard({ application, justSubmitted }: { application: ApplicationSummary; justSubmitted: boolean }) {
    const t = useTheme();
    const [copied, setCopied] = useState(false);
    const tone = ['rejected', 'withdrawn'].includes(application.status) ? 'bg-rose-50 text-rose-700' : application.status === 'waitlisted' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';

    const copy = () => {
        navigator.clipboard?.writeText(application.tracking_code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className={cn('p-6 sm:p-8', t.card)}>
            {justSubmitted && (
                <div className="mb-8 text-center">
                    <span className="mx-auto grid h-16 w-16 place-content-center rounded-full bg-emerald-50 text-emerald-600">
                        <PartyPopper className="h-8 w-8" aria-hidden="true" />
                    </span>
                    <h2 className={cn(t.heading, 'mt-4 text-2xl sm:text-3xl')}>Application received!</h2>
                    <p className="mx-auto mt-2 max-w-md text-slate-600">Thank you. The admissions office will review it and contact you by phone. Keep your tracking code to check progress.</p>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className={cn('flex flex-col items-center justify-center gap-1 border-2 border-dashed border-[color-mix(in_srgb,var(--site-primary)_35%,white)] p-5 sm:col-span-2', t.radius)}>
                    <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Tracking code</span>
                    <span className="font-mono text-3xl font-extrabold tracking-[0.2em] text-[var(--site-primary)]">{application.tracking_code}</span>
                    <button type="button" onClick={copy} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800">
                        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy code'}
                    </button>
                </div>
                <Info label="Application no." value={application.application_no} />
                <Info label="Learner" value={application.name} />
                <Info label="Class applied for" value={application.class ?? '—'} />
                <Info label="Submitted" value={date(application.submitted_at)} />
                {application.interview_date && <Info label="Interview / assessment" value={date(application.interview_date)} />}
            </div>

            <div className="mt-8">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-700">Current status</span>
                    <span className={cn('rounded-full px-3 py-1 text-xs font-bold', tone)}>{application.status_label}</span>
                </div>
                <Progress status={application.status} />
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">{label}</div>
            <div className="font-semibold text-slate-800">{value}</div>
        </div>
    );
}

function TrackForm({ site, notFound }: { site: SiteChrome; notFound: boolean }) {
    const t = useTheme();
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const form = useForm({ reference: params.get('reference') ?? '', phone: params.get('phone') ?? '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.get(`${site.base}/admissions/track`, { preserveScroll: true, preserveState: true });
    };

    return (
        <form onSubmit={submit} className={cn('p-6 sm:p-8', t.card)}>
            <h2 className={cn(t.heading, 'text-xl')}>Track an application</h2>
            <p className="mt-1 text-sm text-slate-500">Enter the tracking code (or application number) and the parent/guardian phone number used on the form.</p>
            {notFound && (
                <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    <SearchX className="h-4 w-4 shrink-0" aria-hidden="true" /> We couldn’t find an application matching those details.
                </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Tracking code or application no." required>
                    {(p) => <input {...p} className={cn(t.input, 'font-mono uppercase')} value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} placeholder="e.g. K7Q2M9XA" maxLength={30} />}
                </Field>
                <Field label="Parent / guardian phone" required>
                    {(p) => <input {...p} type="tel" className={t.input} value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} placeholder="e.g. 0712 345 678" maxLength={25} />}
                </Field>
            </div>
            <button type="submit" className={cn(t.btn, 'mt-6')} disabled={form.processing || !form.data.reference || !form.data.phone}>
                {form.processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} Check status
            </button>
        </form>
    );
}

export default function SiteAdmissionStatus({ site, application, notFound, justSubmitted }: { site: SiteChrome; application: ApplicationSummary | null; notFound: boolean; justSubmitted: boolean }) {
    return (
        <SiteLayout site={site} title={justSubmitted ? 'Application received' : 'Track application'} hero={{ title: justSubmitted ? 'Application received' : 'Track your application', eyebrow: 'Admissions' }}>
            <Section narrow>
                <div className="space-y-8">
                    {application && <ApplicationCard application={application} justSubmitted={justSubmitted} />}
                    {!justSubmitted && <TrackForm site={site} notFound={notFound} />}
                    <div className="flex flex-wrap justify-center gap-3">
                        <Link href={site.base} className="text-sm font-bold text-slate-500 hover:text-slate-800">
                            ← Back to home
                        </Link>
                        {justSubmitted && (
                            <Link href={`${site.base}/admissions`} className="text-sm font-bold text-[var(--site-primary)] hover:underline">
                                Submit another application
                            </Link>
                        )}
                    </div>
                </div>
            </Section>
        </SiteLayout>
    );
}
