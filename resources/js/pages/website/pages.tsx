import { router, useForm } from '@inertiajs/react';
import { Eye, EyeOff, ExternalLink, FileText, Menu, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { Checkbox, FormGrid, Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import RichTextEditor from '@/components/ui/rich-text-editor';
import { confirm } from '@/lib/swal';
import { cn, dateTime } from '@/lib/utils';
import CoverField from './_components/cover-field';

type Page = {
    id: number;
    title: string;
    slug: string;
    summary: string | null;
    body: string | null;
    show_in_menu: boolean;
    sort: number;
    is_published: boolean;
    cover_url: string | null;
    updated_at: string | null;
};

type Props = { pages: Page[]; limit: number | null; siteUrl: string; canManage: boolean };

const blank = { _method: 'post', title: '', slug: '', summary: '', body: '', show_in_menu: true, is_published: true, sort: '0', cover_image: null as File | null };

export default function WebsitePages({ pages, limit, siteUrl, canManage }: Props) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Page | null>(null);
    const form = useForm(blank);
    const atLimit = limit !== null && pages.length >= limit;

    const openForm = (p: Page | null) => {
        setEditing(p);
        form.clearErrors();
        form.setData(
            p
                ? { _method: 'put', title: p.title, slug: p.slug, summary: p.summary ?? '', body: p.body ?? '', show_in_menu: p.show_in_menu, is_published: p.is_published, sort: String(p.sort), cover_image: null }
                : { ...blank, sort: String(pages.length) },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(editing ? `/website/pages/${editing.id}` : '/website/pages', { forceFormData: true, preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const toggle = (p: Page, field: 'is_published' | 'show_in_menu') =>
        router.post(`/website/pages/${p.id}`, { _method: 'put', title: p.title, slug: p.slug, summary: p.summary, body: p.body, sort: p.sort, show_in_menu: p.show_in_menu, is_published: p.is_published, [field]: !p[field] }, { preserveScroll: true });

    const remove = async (p: Page) => {
        const { confirmed } = await confirm({ title: `Delete “${p.title}”?`, text: 'The page will disappear from the website.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/website/pages/${p.id}`, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader
                title="Website Pages"
                subtitle="Extra pages such as Boarding Life, Uniform, Clubs & Societies or a Prospectus."
                breadcrumbs={[{ title: 'School Website', href: '/website' }, { title: 'Pages' }]}
                actions={
                    canManage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)} disabled={atLimit} title={atLimit ? 'Plan limit reached' : undefined}>
                            <Plus className="h-4 w-4" /> New page
                        </button>
                    )
                }
            />

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-light px-4 py-3 text-sm dark:bg-primary-dark-light">
                <span>
                    Built-in pages (Home, About, Academics, Admissions, News, Gallery, Contact) are generated automatically from your Website Builder content and live school data.
                </span>
                <span className="badge badge-soft-primary">
                    {pages.length} / {limit ?? '∞'} custom pages
                </span>
            </div>

            {pages.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No custom pages yet" description="Add pages like “Boarding Life” or “School Uniform” — they appear in the website menu." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {pages.map((p) => (
                        <div key={p.id} className={cn('panel flex flex-col overflow-hidden p-0', !p.is_published && 'opacity-75')}>
                            <div className="relative aspect-[16/7] bg-gradient-to-br from-primary/20 to-secondary/20">
                                {p.cover_url ? <img src={p.cover_url} alt="" className="h-full w-full object-cover" /> : <FileText className="absolute inset-0 m-auto h-10 w-10 text-primary/40" />}
                                <div className="absolute start-3 top-3 flex gap-1.5">
                                    <span className={cn('badge', p.is_published ? 'badge-soft-success bg-white!' : 'badge-soft-dark bg-white!')}>{p.is_published ? 'Published' : 'Hidden'}</span>
                                    {p.show_in_menu && (
                                        <span className="badge badge-soft-info bg-white!">
                                            <Menu className="me-0.5 inline h-3 w-3" /> In menu
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-1 flex-col p-5">
                                <h5 className="text-base font-bold">{p.title}</h5>
                                <a href={`${siteUrl}/p/${p.slug}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline">
                                    /p/{p.slug}
                                </a>
                                <p className="mt-2 line-clamp-3 flex-1 text-sm text-white-dark">{p.summary || 'No summary.'}</p>
                                <div className="mt-4 flex items-center justify-between border-t border-white-light pt-3 dark:border-[#1b2e4b]">
                                    <span className="text-xs text-white-dark">Edited {dateTime(p.updated_at)}</span>
                                    <div className="flex gap-1">
                                        <a href={`${siteUrl}/p/${p.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-dark px-2" title="View">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                        {canManage && (
                                            <>
                                                <button className="btn btn-sm btn-outline-info px-2" onClick={() => toggle(p, 'is_published')} title={p.is_published ? 'Hide' : 'Publish'}>
                                                    {p.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </button>
                                                <button className="btn btn-sm btn-outline-primary px-2" onClick={() => openForm(p)} title="Edit">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger px-2" onClick={() => remove(p)} title="Delete">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit page: ${editing.title}` : 'New page'} size="xl">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={form.errors.title} placeholder="e.g. Boarding Life" />
                        <Input label="Web address" value={form.data.slug} onChange={(e) => form.setData('slug', e.target.value)} error={form.errors.slug} placeholder="auto from title" help={`${siteUrl}/p/${form.data.slug || '…'}`} />
                        <Textarea wrapperClassName="sm:col-span-2" label="Summary" rows={2} value={form.data.summary} onChange={(e) => form.setData('summary', e.target.value)} error={form.errors.summary} help="Short intro shown under the page title and in search results." />
                    </FormGrid>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <label>Content</label>
                            <RichTextEditor value={form.data.body} onChange={(html) => form.setData('body', html)} minHeight={280} />
                            {form.errors.body && <p className="form-error">{form.errors.body}</p>}
                        </div>
                        <div className="space-y-4">
                            <CoverField current={editing?.cover_url ?? null} file={form.data.cover_image} onFile={(f) => form.setData('cover_image', f)} error={form.errors.cover_image} />
                            <Input label="Menu order" type="number" min={0} value={form.data.sort} onChange={(e) => form.setData('sort', e.target.value)} error={form.errors.sort} />
                            <Checkbox label="Show in website menu" checked={form.data.show_in_menu} onChange={(e) => form.setData('show_in_menu', e.target.checked)} />
                            <Checkbox label="Published" checked={form.data.is_published} onChange={(e) => form.setData('is_published', e.target.checked)} />
                        </div>
                    </div>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            <Save className="h-4 w-4" /> {editing ? 'Save page' : 'Create page'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
