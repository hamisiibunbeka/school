import { useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, LogIn, Save } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormSection, Select, Switch } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { cn, titleCase } from '@/lib/utils';

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

type Props = { homepage: { enabled: boolean; school_id: number | null }; schools: SchoolRow[]; appUrl: string };

export default function PlatformSettings({ homepage, schools, appUrl }: Props) {
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
        </>
    );
}
