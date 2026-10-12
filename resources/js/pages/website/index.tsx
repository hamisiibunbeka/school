import { Link, router, useForm } from '@inertiajs/react';
import {
    Camera,
    Check,
    ExternalLink,
    FileText,
    Globe,
    Image as ImageIcon,
    Inbox,
    LayoutTemplate,
    Lock,
    Megaphone,
    Palette,
    Plus,
    Rocket,
    Save,
    Search,
    Settings2,
    Trash2,
    UserPlus,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Checkbox, FormGrid, FormSection, Input, Select, Switch, Textarea } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import RichTextEditor from '@/components/ui/rich-text-editor';
import StatCard from '@/components/ui/stat-card';
import Tabs from '@/components/ui/tabs';
import { confirm } from '@/lib/swal';
import { cn, dateTime, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';

type Highlight = { icon: string; title: string; text: string };
type Testimonial = { name: string; role: string; quote: string };
type Faq = { question: string; answer: string };
type AdmissionForm = { enabled: boolean; intro: string; academic_year_id: number | null; class_ids: number[]; require_documents: boolean; fee_note: string; closing_date: string };
type Template = { key: string; name: string; description: string; best_for: string; colors: string[]; locked: boolean; unlocked_by: string | null };

type Props = {
    website: {
        template: string;
        is_published: boolean;
        published_at: string | null;
        custom_domain: string | null;
        primary_color: string;
        secondary_color: string;
        tagline: string | null;
        hero_title: string | null;
        hero_subtitle: string | null;
        hero_image_url: string | null;
        about_title: string | null;
        about_body: string | null;
        about_image_url: string | null;
        mission: string | null;
        vision: string | null;
        core_values: string | null;
        head_name: string | null;
        head_title: string | null;
        head_message: string | null;
        head_photo_url: string | null;
        highlights: Highlight[] | null;
        testimonials: Testimonial[] | null;
        faqs: Faq[] | null;
        sections: Record<string, boolean>;
        contact: Record<string, string | null>;
        social: Record<string, string | null>;
        admission_settings: { enabled: boolean; intro?: string | null; academic_year_id?: number | null; class_ids: number[]; require_documents?: boolean; fee_note?: string | null; closing_date?: string | null };
        seo_title: string | null;
        seo_description: string | null;
        updated_at: string | null;
    };
    school: { name: string; slug: string; logo_url: string | null; motto: string | null };
    siteUrl: string;
    templates: Template[];
    plan: { plan: string; available: boolean; max_pages: number | null; max_gallery: number | null; gallery: boolean; online_admission: boolean; document_uploads: boolean; custom_domain: boolean; remove_branding: boolean; templates: string[] };
    counts: { pages: number; posts: number; gallery: number; inquiries_new: number; online_applications: number; online_pending: number };
    classes: Option[];
    years: Option[];
    canManage: boolean;
};

const ICONS = ['graduation', 'users', 'flask', 'shield', 'book', 'trophy', 'globe', 'heart', 'bus', 'music', 'computer', 'star'];
const SECTIONS: { key: string; label: string; help: string }[] = [
    { key: 'stats', label: 'Live statistics', help: 'Students, teachers, classes — pulled live from the system.' },
    { key: 'highlights', label: 'Why choose us', help: 'Your highlight cards.' },
    { key: 'leadership', label: 'Head of school message', help: 'Welcome message with photo.' },
    { key: 'news', label: 'Latest news', help: 'Newest posts from News & Events.' },
    { key: 'events', label: 'Upcoming events', help: 'Website events + public school-calendar events.' },
    { key: 'gallery', label: 'Photo gallery', help: 'Gallery strip on the home page and a Gallery page.' },
    { key: 'testimonials', label: 'Testimonials', help: 'Quotes from parents and alumni.' },
    { key: 'faqs', label: 'FAQs', help: 'Frequently asked questions.' },
    { key: 'fees', label: 'Publish fee structure', help: 'Shows this year’s fee structure (from Fees) on Academics & Admissions.' },
];
const SOCIAL = ['facebook', 'instagram', 'x', 'youtube', 'whatsapp', 'linkedin'];

export default function WebsiteBuilder({ website: w, school, siteUrl, templates, plan, counts, classes, years, canManage }: Props) {
    const [tab, setTab] = useState('overview');

    const form = useForm({
        _method: 'put',
        template: w.template,
        primary_color: w.primary_color,
        secondary_color: w.secondary_color,
        tagline: w.tagline ?? '',
        hero_title: w.hero_title ?? '',
        hero_subtitle: w.hero_subtitle ?? '',
        about_title: w.about_title ?? '',
        about_body: w.about_body ?? '',
        mission: w.mission ?? '',
        vision: w.vision ?? '',
        core_values: w.core_values ?? '',
        head_name: w.head_name ?? '',
        head_title: w.head_title ?? '',
        head_message: w.head_message ?? '',
        highlights: (w.highlights ?? []) as Highlight[],
        testimonials: (w.testimonials ?? []) as Testimonial[],
        faqs: (w.faqs ?? []) as Faq[],
        sections: w.sections,
        contact: { phone: '', email: '', address: '', office_hours: '', map_embed_url: '', ...w.contact } as Record<string, string | null>,
        social: Object.fromEntries(SOCIAL.map((s) => [s, w.social?.[s] ?? ''])) as Record<string, string | null>,
        admission_settings: {
            enabled: w.admission_settings.enabled ?? true,
            intro: w.admission_settings.intro ?? '',
            academic_year_id: w.admission_settings.academic_year_id ?? null,
            class_ids: (w.admission_settings.class_ids ?? []).map(Number),
            require_documents: !!w.admission_settings.require_documents,
            fee_note: w.admission_settings.fee_note ?? '',
            closing_date: w.admission_settings.closing_date ?? '',
        } as AdmissionForm,
        seo_title: w.seo_title ?? '',
        seo_description: w.seo_description ?? '',
        custom_domain: w.custom_domain ?? '',
        hero_image: null as File | null,
        about_image: null as File | null,
        head_photo: null as File | null,
        remove_images: [] as string[],
    });
    const err = form.errors as Record<string, string>;

    const save = (e?: FormEvent) => {
        e?.preventDefault();
        const options = { preserveScroll: true, onSuccess: () => form.setData((d) => ({ ...d, hero_image: null, about_image: null, head_photo: null, remove_images: [] })) };
        // Multipart drops empty arrays (e.g. all FAQs removed), so only use it when an image is attached.
        if (form.data.hero_image || form.data.about_image || form.data.head_photo) {
            form.post('/website', { ...options, forceFormData: true });
        } else {
            form.put('/website', options);
        }
    };

    const togglePublish = async () => {
        const publish = !w.is_published;
        const { confirmed } = await confirm({
            title: publish ? 'Publish your website?' : 'Take the website offline?',
            text: publish ? `It will be public at ${siteUrl}` : 'Visitors will see a “coming soon” page. Online admission will stop accepting applications.',
            confirmText: publish ? 'Publish now' : 'Unpublish',
            danger: !publish,
        });
        if (confirmed) router.post('/website/publish', { publish }, { preserveScroll: true });
    };

    const setList = <K extends 'highlights' | 'testimonials' | 'faqs'>(key: K, index: number, field: string, value: string) =>
        form.setData(key, (form.data[key] as Record<string, string>[]).map((item, i) => (i === index ? { ...item, [field]: value } : item)) as never);
    const removeFrom = (key: 'highlights' | 'testimonials' | 'faqs', index: number) => form.setData(key, (form.data[key] as unknown[]).filter((_, i) => i !== index) as never);

    const SaveBar = () =>
        canManage ? (
            <div className="sticky bottom-4 z-20 mt-6 flex justify-center">
                <button type="submit" className="btn btn-primary shadow-lg" disabled={form.processing}>
                    <Save className="h-4 w-4" /> {form.processing ? 'Saving…' : 'Save changes'}
                </button>
            </div>
        ) : null;

    return (
        <>
            <PageHeader
                title="Website Builder"
                subtitle="Design, write and publish your school's public website — with online admission built in."
                breadcrumbs={[{ title: 'School Website' }, { title: 'Builder' }]}
                actions={
                    <>
                        <a href={siteUrl} target="_blank" rel="noreferrer" className="btn btn-outline-primary">
                            <ExternalLink className="h-4 w-4" /> {w.is_published ? 'View live site' : 'Preview site'}
                        </a>
                        {canManage && (
                            <button type="button" onClick={togglePublish} className={cn('btn', w.is_published ? 'btn-outline-danger' : 'btn-success')}>
                                <Rocket className="h-4 w-4" /> {w.is_published ? 'Unpublish' : 'Publish website'}
                            </button>
                        )}
                    </>
                }
            />

            <div className={cn('mb-6 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3', w.is_published ? 'border-success/30 bg-success-light dark:bg-success-dark-light' : 'border-warning/30 bg-warning-light dark:bg-warning-dark-light')}>
                <span className={cn('relative flex h-3 w-3')}>
                    {w.is_published && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
                    <span className={cn('relative inline-flex h-3 w-3 rounded-full', w.is_published ? 'bg-success' : 'bg-warning')} />
                </span>
                <div className="flex-1 text-sm">
                    <strong className={w.is_published ? 'text-success' : 'text-warning'}>{w.is_published ? 'Live' : 'Not published'}</strong>
                    <span className="text-white-dark"> · </span>
                    <a href={siteUrl} target="_blank" rel="noreferrer" className="font-mono text-xs font-semibold text-primary hover:underline">
                        {siteUrl}
                    </a>
                    {!plan.available && <span className="ms-2 badge badge-soft-danger">Subscription inactive — site offline</span>}
                </div>
                <span className="badge badge-soft-primary">{plan.plan} plan</span>
            </div>

            <Tabs
                tabs={[
                    { key: 'overview', label: 'Overview', icon: Globe },
                    { key: 'design', label: 'Template & theme', icon: Palette },
                    { key: 'home', label: 'Home page', icon: LayoutTemplate },
                    { key: 'sections', label: 'Sections', icon: Settings2 },
                    { key: 'admissions', label: 'Online admission', icon: UserPlus },
                    { key: 'contact', label: 'Contact & social', icon: Megaphone },
                    { key: 'seo', label: 'SEO & domain', icon: Search },
                ]}
                active={tab}
                onChange={setTab}
            />

            <form onSubmit={save}>
                {tab === 'overview' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                            <StatCard title="Online applications" value={num(counts.online_applications)} icon={UserPlus} tone="success" hint={`${counts.online_pending} awaiting review`} />
                            <StatCard title="New enquiries" value={num(counts.inquiries_new)} icon={Inbox} tone="warning" />
                            <StatCard title="Published posts" value={num(counts.posts)} icon={Megaphone} tone="info" />
                            <StatCard title="Pages / photos" value={`${counts.pages} / ${counts.gallery}`} icon={FileText} tone="primary" />
                        </div>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                            <div className="panel lg:col-span-2">
                                <h5 className="mb-4 text-lg font-bold">Manage content</h5>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {[
                                        { href: '/website/pages', icon: FileText, title: 'Pages', text: 'Boarding life, uniform, clubs, prospectus…' },
                                        { href: '/website/posts', icon: Megaphone, title: 'News & Events', text: 'Announce achievements, events and notices.' },
                                        { href: '/website/gallery', icon: ImageIcon, title: 'Gallery', text: 'Upload photos into albums.' },
                                        { href: '/website/inquiries', icon: Inbox, title: 'Enquiries', text: 'Messages from the contact form.' },
                                        { href: '/admissions?source=online', icon: UserPlus, title: 'Online applications', text: 'Applications submitted on the website.' },
                                    ].map(({ href, icon: Icon, title, text }) => (
                                        <Link key={href} href={href} className="flex items-start gap-3 rounded-lg border border-white-light p-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md dark:border-[#1b2e4b]">
                                            <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-primary-light text-primary dark:bg-primary-dark-light">
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <span>
                                                <span className="block font-bold text-black dark:text-white-light">{title}</span>
                                                <span className="text-xs text-white-dark">{text}</span>
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                            <div className="panel">
                                <h5 className="mb-3 text-lg font-bold">Your plan includes</h5>
                                <ul className="space-y-2 text-sm">
                                    {[
                                        [`${plan.templates.length} of ${templates.length} templates`, true],
                                        [plan.max_pages === null ? 'Unlimited custom pages' : `Up to ${plan.max_pages} custom pages`, true],
                                        [plan.max_gallery === null ? 'Unlimited gallery photos' : `Up to ${plan.max_gallery} gallery photos`, plan.gallery],
                                        ['Online admission form', plan.online_admission],
                                        ['Document uploads with applications', plan.document_uploads],
                                        ['Custom domain', plan.custom_domain],
                                        ['Remove platform branding', plan.remove_branding],
                                    ].map(([label, ok]) => (
                                        <li key={label as string} className="flex items-center gap-2">
                                            {ok ? <Check className="h-4 w-4 text-success" /> : <Lock className="h-4 w-4 text-white-dark" />}
                                            <span className={ok ? '' : 'text-white-dark'}>{label}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link href="/admin/subscription" className="mt-4 inline-block text-sm font-bold text-primary hover:underline">
                                    Upgrade plan →
                                </Link>
                                {w.updated_at && <p className="mt-4 text-xs text-white-dark">Last edited {dateTime(w.updated_at)}</p>}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'design' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
                            {templates.map((t) => {
                                const active = form.data.template === t.key;
                                return (
                                    <button
                                        key={t.key}
                                        type="button"
                                        disabled={t.locked || !canManage}
                                        onClick={() => form.setData('template', t.key)}
                                        className={cn(
                                            'panel group relative overflow-hidden p-0 text-start transition',
                                            active ? 'ring-2 ring-primary' : 'hover:-translate-y-0.5 hover:shadow-lg',
                                            t.locked && 'cursor-not-allowed opacity-70',
                                        )}
                                    >
                                        <TemplateThumb template={t.key} primary={active ? form.data.primary_color : t.colors[0]} secondary={active ? form.data.secondary_color : t.colors[1]} name={school.name} />
                                        <div className="p-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-base font-extrabold">{t.name}</span>
                                                {active ? (
                                                    <span className="badge badge-soft-success">
                                                        <Check className="h-3 w-3" /> Selected
                                                    </span>
                                                ) : t.locked ? (
                                                    <span className="badge badge-soft-dark">
                                                        <Lock className="h-3 w-3" /> {t.unlocked_by ?? 'Upgrade'}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="mt-1 text-xs text-white-dark">{t.description}</p>
                                            <p className="mt-2 text-[11px] font-bold tracking-wide text-primary uppercase">Best for: {t.best_for}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {err.template && <p className="form-error text-center">{err.template}</p>}
                        <div className="panel">
                            <FormSection title="Brand colours" description="Applied to buttons, highlights and headings in every template.">
                                <FormGrid cols={3}>
                                    <ColorField label="Primary colour" value={form.data.primary_color} onChange={(v) => form.setData('primary_color', v)} error={err.primary_color} />
                                    <ColorField label="Secondary colour" value={form.data.secondary_color} onChange={(v) => form.setData('secondary_color', v)} error={err.secondary_color} />
                                    <div>
                                        <label>Quick palettes</label>
                                        <div className="flex flex-wrap gap-2">
                                            {templates.map((t) => (
                                                <button
                                                    key={t.key}
                                                    type="button"
                                                    title={`${t.name} palette`}
                                                    onClick={() => form.setData((d) => ({ ...d, primary_color: t.colors[0], secondary_color: t.colors[1] }))}
                                                    className="h-9 w-14 rounded-md ring-1 ring-black/10"
                                                    style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </FormGrid>
                                <Input wrapperClassName="mt-5" label="Tagline" value={form.data.tagline} onChange={(e) => form.setData('tagline', e.target.value)} error={err.tagline} placeholder={school.motto ?? 'e.g. Excellence through discipline'} help="Shown under the school name in the header." />
                                <p className="mt-3 text-xs text-white-dark">
                                    Logo, school name, motto and registration number come from <Link href="/admin/settings" className="text-primary underline">School Settings</Link>.
                                </p>
                            </FormSection>
                        </div>
                        <SaveBar />
                    </div>
                )}

                {tab === 'home' && (
                    <div className="panel space-y-6">
                        <FormSection title="Hero banner" description="The first thing visitors see.">
                            <FormGrid>
                                <Input label="Headline" value={form.data.hero_title} onChange={(e) => form.setData('hero_title', e.target.value)} error={err.hero_title} />
                                <ImageField label="Hero image" current={w.hero_image_url} file={form.data.hero_image} onFile={(f) => form.setData('hero_image', f)} removed={form.data.remove_images.includes('hero_image')} onRemove={() => form.setData('remove_images', [...form.data.remove_images, 'hero_image'])} help="Wide photo, at least 1600 px across." error={err.hero_image} />
                                <Textarea wrapperClassName="sm:col-span-2" label="Sub-heading" rows={2} value={form.data.hero_subtitle} onChange={(e) => form.setData('hero_subtitle', e.target.value)} error={err.hero_subtitle} />
                            </FormGrid>
                        </FormSection>
                        <FormSection title="About the school" description="Shown on the home page (excerpt) and the About page (full text).">
                            <FormGrid>
                                <Input label="Title" value={form.data.about_title} onChange={(e) => form.setData('about_title', e.target.value)} />
                                <ImageField label="About image" current={w.about_image_url} file={form.data.about_image} onFile={(f) => form.setData('about_image', f)} removed={form.data.remove_images.includes('about_image')} onRemove={() => form.setData('remove_images', [...form.data.remove_images, 'about_image'])} error={err.about_image} />
                            </FormGrid>
                            <div className="mt-4">
                                <label>About text</label>
                                <RichTextEditor value={form.data.about_body} onChange={(html) => form.setData('about_body', html)} />
                            </div>
                            <FormGrid cols={3} className="mt-4">
                                <Textarea label="Mission" rows={3} value={form.data.mission} onChange={(e) => form.setData('mission', e.target.value)} />
                                <Textarea label="Vision" rows={3} value={form.data.vision} onChange={(e) => form.setData('vision', e.target.value)} />
                                <Textarea label="Core values (one per line)" rows={3} value={form.data.core_values} onChange={(e) => form.setData('core_values', e.target.value)} />
                            </FormGrid>
                        </FormSection>
                        <FormSection title="Head of school message">
                            <FormGrid cols={3}>
                                <Input label="Name" value={form.data.head_name} onChange={(e) => form.setData('head_name', e.target.value)} placeholder="e.g. Dr. Agnes Kimaro" />
                                <Input label="Title" value={form.data.head_title} onChange={(e) => form.setData('head_title', e.target.value)} />
                                <ImageField label="Photo" current={w.head_photo_url} file={form.data.head_photo} onFile={(f) => form.setData('head_photo', f)} removed={form.data.remove_images.includes('head_photo')} onRemove={() => form.setData('remove_images', [...form.data.remove_images, 'head_photo'])} error={err.head_photo} />
                                <Textarea wrapperClassName="sm:col-span-3" label="Message" rows={4} value={form.data.head_message} onChange={(e) => form.setData('head_message', e.target.value)} />
                            </FormGrid>
                        </FormSection>
                        <FormSection title="Why choose us (highlights)" description="Up to 8 short cards.">
                            <div className="space-y-3">
                                {form.data.highlights.map((h, i) => (
                                    <Repeater key={i} onRemove={() => removeFrom('highlights', i)}>
                                        <FormGrid cols={3}>
                                            <Select label="Icon" value={h.icon} onChange={(e) => setList('highlights', i, 'icon', e.target.value)} options={ICONS.map((x) => ({ value: x, label: titleCase(x) }))} />
                                            <Input label="Title" value={h.title} onChange={(e) => setList('highlights', i, 'title', e.target.value)} error={err[`highlights.${i}.title`]} />
                                            <Input label="Text" value={h.text} onChange={(e) => setList('highlights', i, 'text', e.target.value)} />
                                        </FormGrid>
                                    </Repeater>
                                ))}
                                {form.data.highlights.length < 8 && <AddButton onClick={() => form.setData('highlights', [...form.data.highlights, { icon: 'star', title: '', text: '' }])}>Add highlight</AddButton>}
                            </div>
                        </FormSection>
                        <FormSection title="Testimonials">
                            <div className="space-y-3">
                                {form.data.testimonials.map((t, i) => (
                                    <Repeater key={i} onRemove={() => removeFrom('testimonials', i)}>
                                        <FormGrid cols={3}>
                                            <Input label="Name" value={t.name} onChange={(e) => setList('testimonials', i, 'name', e.target.value)} error={err[`testimonials.${i}.name`]} />
                                            <Input label="Role" value={t.role} onChange={(e) => setList('testimonials', i, 'role', e.target.value)} placeholder="Parent, Alumnus…" />
                                            <Textarea label="Quote" rows={2} value={t.quote} onChange={(e) => setList('testimonials', i, 'quote', e.target.value)} error={err[`testimonials.${i}.quote`]} />
                                        </FormGrid>
                                    </Repeater>
                                ))}
                                <AddButton onClick={() => form.setData('testimonials', [...form.data.testimonials, { name: '', role: 'Parent', quote: '' }])}>Add testimonial</AddButton>
                            </div>
                        </FormSection>
                        <FormSection title="Frequently asked questions">
                            <div className="space-y-3">
                                {form.data.faqs.map((f, i) => (
                                    <Repeater key={i} onRemove={() => removeFrom('faqs', i)}>
                                        <FormGrid>
                                            <Input label="Question" value={f.question} onChange={(e) => setList('faqs', i, 'question', e.target.value)} error={err[`faqs.${i}.question`]} />
                                            <Textarea label="Answer" rows={2} value={f.answer} onChange={(e) => setList('faqs', i, 'answer', e.target.value)} error={err[`faqs.${i}.answer`]} />
                                        </FormGrid>
                                    </Repeater>
                                ))}
                                <AddButton onClick={() => form.setData('faqs', [...form.data.faqs, { question: '', answer: '' }])}>Add question</AddButton>
                            </div>
                        </FormSection>
                        <SaveBar />
                    </div>
                )}

                {tab === 'sections' && (
                    <div className="panel">
                        <p className="mb-5 text-sm text-white-dark">Choose which sections appear on your website. Live sections update automatically from the school system.</p>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {SECTIONS.map((s) => (
                                <div key={s.key} className="flex items-start justify-between gap-4 rounded-lg border border-white-light p-4 dark:border-[#1b2e4b]">
                                    <div>
                                        <div className="font-bold">{s.label}</div>
                                        <div className="text-xs text-white-dark">{s.help}</div>
                                        {s.key === 'gallery' && !plan.gallery && <span className="badge badge-soft-dark mt-1">Not in plan</span>}
                                    </div>
                                    <Switch checked={!!form.data.sections[s.key]} onChange={(v) => form.setData('sections', { ...form.data.sections, [s.key]: v })} />
                                </div>
                            ))}
                        </div>
                        <SaveBar />
                    </div>
                )}

                {tab === 'admissions' && (
                    <div className="panel space-y-6">
                        {!plan.online_admission ? (
                            <p className="text-sm text-white-dark">Online admission is not included in your plan.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-light p-4 dark:bg-primary-dark-light">
                                    <div>
                                        <div className="font-bold text-primary">Online admission form</div>
                                        <div className="text-xs text-white-dark">Applications land in Admissions with an “Online” badge — the office reviews, interviews and enrols as usual.</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Switch checked={!!form.data.admission_settings.enabled} onChange={(v) => form.setData('admission_settings', { ...form.data.admission_settings, enabled: v })} label="Accepting applications" />
                                        <a href={`${siteUrl}/admissions`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-primary">
                                            <ExternalLink className="h-3.5 w-3.5" /> Open form
                                        </a>
                                    </div>
                                </div>
                                <FormGrid>
                                    <Select
                                        label="Intake (academic year)"
                                        placeholder="Current year"
                                        value={String(form.data.admission_settings.academic_year_id ?? '')}
                                        onChange={(e) => form.setData('admission_settings', { ...form.data.admission_settings, academic_year_id: e.target.value ? Number(e.target.value) : null })}
                                        options={years}
                                        error={err['admission_settings.academic_year_id']}
                                    />
                                    <Input
                                        label="Closing date"
                                        type="date"
                                        value={form.data.admission_settings.closing_date ?? ''}
                                        onChange={(e) => form.setData('admission_settings', { ...form.data.admission_settings, closing_date: e.target.value })}
                                        help="Leave empty to accept applications all year."
                                    />
                                    <Textarea wrapperClassName="sm:col-span-2" label="Introduction shown above the form" rows={2} value={form.data.admission_settings.intro ?? ''} onChange={(e) => form.setData('admission_settings', { ...form.data.admission_settings, intro: e.target.value })} />
                                    <Textarea wrapperClassName="sm:col-span-2" label="Fees / payment note" rows={2} value={form.data.admission_settings.fee_note ?? ''} onChange={(e) => form.setData('admission_settings', { ...form.data.admission_settings, fee_note: e.target.value })} />
                                </FormGrid>
                                <div>
                                    <label>Classes open for applications</label>
                                    <p className="mb-2 text-xs text-white-dark">Leave all unticked to allow every class.</p>
                                    <div className="flex flex-wrap gap-2">
                                        {classes.map((c) => {
                                            const ids = form.data.admission_settings.class_ids ?? [];
                                            const on = ids.includes(Number(c.value));
                                            return (
                                                <button
                                                    key={c.value}
                                                    type="button"
                                                    onClick={() => form.setData('admission_settings', { ...form.data.admission_settings, class_ids: on ? ids.filter((x) => x !== Number(c.value)) : [...ids, Number(c.value)] })}
                                                    className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold transition', on ? 'border-primary bg-primary text-white' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]')}
                                                >
                                                    {on && <Check className="me-1 inline h-3.5 w-3.5" />}
                                                    {c.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                {plan.document_uploads ? (
                                    <Checkbox
                                        label="Require applicants to upload documents (birth certificate, latest report…)"
                                        checked={!!form.data.admission_settings.require_documents}
                                        onChange={(e) => form.setData('admission_settings', { ...form.data.admission_settings, require_documents: e.target.checked })}
                                    />
                                ) : (
                                    <p className="text-xs text-white-dark">
                                        <Lock className="me-1 inline h-3.5 w-3.5" /> Document uploads with applications are available from the Starter plan.
                                    </p>
                                )}
                                <SaveBar />
                            </>
                        )}
                    </div>
                )}

                {tab === 'contact' && (
                    <div className="panel space-y-6">
                        <FormSection title="Contact details" description="Defaults to the school’s settings; override them here for the website.">
                            <FormGrid>
                                <Input label="Phone" value={form.data.contact.phone ?? ''} onChange={(e) => form.setData('contact', { ...form.data.contact, phone: e.target.value })} error={err['contact.phone']} />
                                <Input label="Email" type="email" value={form.data.contact.email ?? ''} onChange={(e) => form.setData('contact', { ...form.data.contact, email: e.target.value })} error={err['contact.email']} />
                                <Input label="Address" value={form.data.contact.address ?? ''} onChange={(e) => form.setData('contact', { ...form.data.contact, address: e.target.value })} />
                                <Input label="Office hours" value={form.data.contact.office_hours ?? ''} onChange={(e) => form.setData('contact', { ...form.data.contact, office_hours: e.target.value })} />
                                <Input
                                    wrapperClassName="sm:col-span-2"
                                    label="Google Maps embed link"
                                    value={form.data.contact.map_embed_url ?? ''}
                                    onChange={(e) => form.setData('contact', { ...form.data.contact, map_embed_url: e.target.value })}
                                    error={err['contact.map_embed_url']}
                                    help='Google Maps → Share → Embed a map → copy the src="…" link.'
                                />
                            </FormGrid>
                        </FormSection>
                        <FormSection title="Social media">
                            <FormGrid cols={3}>
                                {SOCIAL.map((s) => (
                                    <Input key={s} label={s === 'x' ? 'X (Twitter)' : titleCase(s)} value={form.data.social[s] ?? ''} onChange={(e) => form.setData('social', { ...form.data.social, [s]: e.target.value })} error={err[`social.${s}`]} placeholder="https://…" />
                                ))}
                            </FormGrid>
                        </FormSection>
                        <SaveBar />
                    </div>
                )}

                {tab === 'seo' && (
                    <div className="panel space-y-6">
                        <FormSection title="Search engines" description="How your website appears on Google.">
                            <FormGrid>
                                <Input label="Site title" value={form.data.seo_title} onChange={(e) => form.setData('seo_title', e.target.value)} error={err.seo_title} />
                                <Textarea label="Description" rows={2} value={form.data.seo_description} onChange={(e) => form.setData('seo_description', e.target.value)} error={err.seo_description} help={`${form.data.seo_description.length}/300`} />
                            </FormGrid>
                            <div className="mt-4 rounded-lg border border-white-light p-4 dark:border-[#1b2e4b]">
                                <div className="text-xs text-success">{siteUrl}</div>
                                <div className="text-lg text-[#1a0dab] dark:text-info">{form.data.seo_title || school.name}</div>
                                <div className="text-sm text-white-dark">{form.data.seo_description || 'Add a description to help parents find you.'}</div>
                            </div>
                        </FormSection>
                        <FormSection title="Custom domain" description="Use your own address, e.g. www.mzenzisecondary.ac.tz.">
                            {plan.custom_domain ? (
                                <Input label="Domain" value={form.data.custom_domain} onChange={(e) => form.setData('custom_domain', e.target.value)} error={err.custom_domain} placeholder="www.yourschool.ac.tz" help="Point the domain’s DNS (CNAME) to this platform, then contact support to activate SSL." />
                            ) : (
                                <p className="text-sm text-white-dark">
                                    <Lock className="me-1 inline h-4 w-4" /> Custom domains are available on the Enterprise plan. Your website address is <span className="font-mono text-primary">{siteUrl}</span>.
                                </p>
                            )}
                        </FormSection>
                        <SaveBar />
                    </div>
                )}
            </form>
        </>
    );
}

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
    return (
        <div>
            <label>{label}</label>
            <div className="flex items-center gap-2">
                <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-white-light bg-transparent p-1 dark:border-[#17263c]" />
                <input className="form-input font-mono uppercase" value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
            </div>
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

function ImageField({ label, current, file, onFile, onRemove, removed, help, error }: { label: string; current: string | null; file: File | null; onFile: (f: File | null) => void; onRemove: () => void; removed: boolean; help?: string; error?: string }) {
    const preview = file ? URL.createObjectURL(file) : removed ? null : current;
    return (
        <div>
            <label>{label}</label>
            <div className="flex items-center gap-3">
                <div className="grid h-16 w-24 shrink-0 place-content-center overflow-hidden rounded-md border border-dashed border-white-light bg-[#fafafa] dark:border-[#17263c] dark:bg-[#121e32]">
                    {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Camera className="h-5 w-5 text-white-dark" />}
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="btn btn-sm btn-outline-primary mb-0 cursor-pointer">
                        <Camera className="h-3.5 w-3.5" /> {preview ? 'Change' : 'Upload'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {preview && (
                        <button type="button" className="text-xs font-semibold text-danger hover:underline" onClick={() => (file ? onFile(null) : onRemove())}>
                            Remove
                        </button>
                    )}
                </div>
            </div>
            {help && !error && <p className="form-help">{help}</p>}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

function Repeater({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
    return (
        <div className="relative rounded-lg border border-white-light p-4 pe-12 dark:border-[#1b2e4b]">
            {children}
            <button type="button" onClick={onRemove} className="absolute end-3 top-3 text-danger hover:opacity-70" title="Remove">
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="btn btn-sm btn-outline-primary">
            <Plus className="h-4 w-4" /> {children}
        </button>
    );
}

/** Small visual sketch of each template's look. */
function TemplateThumb({ template, primary, secondary, name }: { template: string; primary: string; secondary: string; name: string }) {
    const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('');
    if (template === 'classic') {
        return (
            <div className="h-40 bg-[#f8f5ee]">
                <div className="h-3" style={{ background: secondary }} />
                <div className="flex flex-col items-center py-3" style={{ background: primary }}>
                    <span className="grid h-8 w-8 place-content-center rounded-full border-2 font-serif text-xs font-bold text-white" style={{ borderColor: secondary }}>
                        {initials}
                    </span>
                    <span className="mt-1 font-serif text-[10px] tracking-widest text-white uppercase">{name.slice(0, 26)}</span>
                </div>
                <div className="mx-auto mt-3 h-2 w-2/3 rounded bg-black/15" />
                <div className="mx-auto mt-1.5 h-2 w-1/2 rounded bg-black/10" />
                <div className="mx-auto mt-3 h-1 w-16" style={{ background: secondary }} />
            </div>
        );
    }
    if (template === 'minimal') {
        return (
            <div className="h-40 bg-white p-4">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold">{initials}</span>
                    <span className="flex gap-2">
                        {[1, 2, 3].map((i) => (
                            <span key={i} className="h-1 w-5 rounded bg-black/20" />
                        ))}
                    </span>
                </div>
                <div className="mt-6 h-3 w-3/4 rounded bg-black/80" />
                <div className="mt-2 h-3 w-1/2 rounded bg-black/80" />
                <div className="mt-3 h-1.5 w-12 rounded" style={{ background: primary }} />
                <div className="mt-4 grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((i) => (
                        <span key={i} className="h-5 rounded border border-black/10" />
                    ))}
                </div>
            </div>
        );
    }
    if (template === 'playful') {
        return (
            <div className="relative h-40 overflow-hidden" style={{ background: `${primary}22` }}>
                <span className="absolute -top-6 -left-6 h-24 w-24 rounded-full" style={{ background: primary }} />
                <span className="absolute -right-4 bottom-2 h-20 w-20 rounded-[40%]" style={{ background: secondary }} />
                <span className="absolute top-6 right-10 h-6 w-6 rounded-full bg-yellow-300" />
                <div className="relative flex h-full flex-col items-center justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold shadow" style={{ color: primary }}>
                        {name.split(' ')[0]}
                    </span>
                    <span className="mt-2 h-3 w-24 rounded-full bg-white/90" />
                    <span className="mt-2 rounded-full px-3 py-1 text-[10px] font-bold text-white" style={{ background: secondary }}>
                        Apply now
                    </span>
                </div>
            </div>
        );
    }
    return (
        <div className="relative h-40 overflow-hidden" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
            <span className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-white/15" />
            <div className="flex items-center gap-1.5 p-3">
                <span className="grid h-5 w-5 place-content-center rounded bg-white/30 text-[8px] font-bold text-white">{initials}</span>
                <span className="h-1.5 w-16 rounded bg-white/50" />
            </div>
            <div className="px-4 pt-3">
                <div className="h-3 w-3/4 rounded bg-white/90" />
                <div className="mt-2 h-2 w-1/2 rounded bg-white/60" />
                <div className="mt-4 flex gap-2">
                    <span className="h-5 w-16 rounded-full bg-white" />
                    <span className="h-5 w-12 rounded-full border border-white/70" />
                </div>
            </div>
            <div className="absolute right-3 bottom-3 rounded-lg bg-white/25 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">1,248 students</div>
        </div>
    );
}
