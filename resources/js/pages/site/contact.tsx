import { useForm } from '@inertiajs/react';
import { Loader2, Send } from 'lucide-react';
import type { FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { ContactDetails, MapEmbed } from './_components/blocks';
import { Field, Honeypot } from './_components/form';
import type { SiteChrome } from './_components/types';
import { FlashBanner, SocialLinks } from './_components/ui';
import { Section, SiteLayout, useTheme } from './_templates';

function ContactContent({ site }: { site: SiteChrome }) {
    const t = useTheme();
    const form = useForm({ name: '', email: '', phone: '', subject: '', message: '', website: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`${site.base}/contact`, {
            preserveScroll: true,
            onSuccess: () => form.reset(),
        });
    };

    return (
        <Section>
            <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div>
                    <h2 className={cn(t.heading, 'text-2xl sm:text-3xl')}>Get in touch</h2>
                    <p className="mt-3 text-slate-600">Questions about admissions, fees or school life? Call, email or visit — or send us a message and the office will reply.</p>
                    <ContactDetails site={site} className="mt-8" />
                    <SocialLinks social={site.social} className="mt-8" itemClassName="border border-slate-200 bg-white text-slate-700 hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]" />
                </div>

                <div className={cn('p-6 sm:p-8', t.key !== 'minimal' && t.card, t.key === 'minimal' && 'border-t border-neutral-950 px-0 sm:px-0')}>
                    <h2 className={cn(t.heading, 'text-xl sm:text-2xl')}>Send us a message</h2>
                    <FlashBanner className="mt-5" />
                    <form onSubmit={submit} className="mt-6 grid gap-5 sm:grid-cols-2" noValidate>
                        <Honeypot value={form.data.website} onChange={(v) => form.setData('website', v)} />
                        <Field label="Your name" required error={form.errors.name} className="sm:col-span-2">
                            {(p) => <input {...p} className={t.input} value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} autoComplete="name" maxLength={120} />}
                        </Field>
                        <Field label="Email" error={form.errors.email} hint="Email or phone is required">
                            {(p) => <input {...p} type="email" className={t.input} value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} autoComplete="email" maxLength={150} />}
                        </Field>
                        <Field label="Phone" error={form.errors.phone}>
                            {(p) => <input {...p} type="tel" className={t.input} value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} autoComplete="tel" maxLength={25} placeholder="e.g. 0712 345 678" />}
                        </Field>
                        <Field label="Subject" error={form.errors.subject} className="sm:col-span-2">
                            {(p) => <input {...p} className={t.input} value={form.data.subject} onChange={(e) => form.setData('subject', e.target.value)} maxLength={150} />}
                        </Field>
                        <Field label="Message" required error={form.errors.message} className="sm:col-span-2">
                            {(p) => <textarea {...p} rows={6} className={cn(t.input, 'resize-y')} value={form.data.message} onChange={(e) => form.setData('message', e.target.value)} maxLength={3000} />}
                        </Field>
                        <div className="sm:col-span-2">
                            <button type="submit" className={t.btn} disabled={form.processing}>
                                {form.processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                                {form.processing ? 'Sending…' : 'Send message'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {site.contact.map_embed_url && (
                <div className={cn('mt-16 overflow-hidden', t.key !== 'minimal' && t.card)}>
                    <MapEmbed url={site.contact.map_embed_url} title={`Map showing the location of ${site.name}`} className="h-96" />
                </div>
            )}
        </Section>
    );
}

export default function SiteContact({ site }: { site: SiteChrome }) {
    return (
        <SiteLayout site={site} hero={{ title: 'Contact us', subtitle: "We're here to help — reach out any time during office hours.", eyebrow: 'Say hello' }}>
            <ContactContent site={site} />
        </SiteLayout>
    );
}
