import { router, useForm } from '@inertiajs/react';
import { Bell, CalendarDays, ExternalLink, MapPin, Megaphone, Newspaper, Pencil, Plus, Save, Star, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import RichTextEditor from '@/components/ui/rich-text-editor';
import StatusBadge from '@/components/ui/status-badge';
import { confirm } from '@/lib/swal';
import { cn, date, dateTime, titleCase } from '@/lib/utils';
import type { Paginated } from '@/types';
import CoverField from './_components/cover-field';

type Post = {
    id: number;
    type: 'news' | 'event' | 'notice';
    title: string;
    slug: string;
    excerpt: string | null;
    body: string | null;
    status: 'draft' | 'published';
    is_featured: boolean;
    event_location: string | null;
    cover_url: string | null;
    published_at: string | null;
    event_starts_at: string | null;
    event_ends_at: string | null;
    author: string | null;
};

type Props = { posts: Paginated<Post>; filters: { search: string; type: string; status: string }; siteUrl: string; canManage: boolean };

const TYPES = [
    { value: 'news', label: 'News story' },
    { value: 'event', label: 'Event' },
    { value: 'notice', label: 'Notice' },
];
const typeStyle = {
    news: { icon: Newspaper, cls: 'bg-primary-light text-primary dark:bg-primary-dark-light' },
    event: { icon: CalendarDays, cls: 'bg-success-light text-success dark:bg-success-dark-light' },
    notice: { icon: Bell, cls: 'bg-warning-light text-warning dark:bg-warning-dark-light' },
};

const blank = {
    _method: 'post',
    type: 'news',
    title: '',
    slug: '',
    excerpt: '',
    body: '',
    status: 'published',
    is_featured: false,
    event_starts_at: '',
    event_ends_at: '',
    event_location: '',
    cover_image: null as File | null,
};

export default function WebsitePosts({ posts, filters: initial, siteUrl, canManage }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Post | null>(null);
    const form = useForm(blank);

    const openForm = (p: Post | null, type = 'news') => {
        setEditing(p);
        form.clearErrors();
        form.setData(
            p
                ? {
                      _method: 'put',
                      type: p.type,
                      title: p.title,
                      slug: p.slug,
                      excerpt: p.excerpt ?? '',
                      body: p.body ?? '',
                      status: p.status,
                      is_featured: p.is_featured,
                      event_starts_at: p.event_starts_at ?? '',
                      event_ends_at: p.event_ends_at ?? '',
                      event_location: p.event_location ?? '',
                      cover_image: null,
                  }
                : { ...blank, type },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(editing ? `/website/posts/${editing.id}` : '/website/posts', { forceFormData: true, preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const remove = async (p: Post) => {
        const { confirmed } = await confirm({ title: `Delete “${p.title}”?`, text: 'It will be removed from the website.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/website/posts/${p.id}`, { preserveScroll: true });
    };

    const columns: Column<Post>[] = [
        {
            key: 'title',
            header: 'Post',
            render: (p) => {
                const { icon: Icon, cls } = typeStyle[p.type];
                return (
                    <div className="flex items-center gap-3">
                        {p.cover_url ? (
                            <img src={p.cover_url} alt="" className="h-11 w-16 shrink-0 rounded-md object-cover" />
                        ) : (
                            <span className={cn('grid h-11 w-16 shrink-0 place-content-center rounded-md', cls)}>
                                <Icon className="h-5 w-5" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-semibold text-black dark:text-white-light">
                                {p.is_featured && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />}
                                <span className="truncate">{p.title}</span>
                            </div>
                            <div className="truncate text-xs text-white-dark">{p.excerpt || '—'}</div>
                        </div>
                    </div>
                );
            },
        },
        { key: 'type', header: 'Type', render: (p) => <span className={cn('badge', typeStyle[p.type].cls)}>{titleCase(p.type)}</span> },
        {
            key: 'when',
            header: 'Date',
            render: (p) =>
                p.type === 'event' ? (
                    <div className="text-xs">
                        <div className="font-semibold">{dateTime(p.event_starts_at)}</div>
                        {p.event_location && (
                            <div className="text-white-dark">
                                <MapPin className="me-0.5 inline h-3 w-3" />
                                {p.event_location}
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-xs">{date(p.published_at)}</span>
                ),
        },
        { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} tone={p.status === 'published' ? 'success' : 'dark'} /> },
        { key: 'author', header: 'Author', render: (p) => <span className="text-xs">{p.author ?? '—'}</span> },
        {
            key: 'actions',
            header: 'Actions',
            align: 'center',
            render: (p) => (
                <div className="flex justify-center gap-1">
                    {p.status === 'published' && (
                        <a href={`${siteUrl}/news/${p.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-dark px-2" title="View on website">
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    )}
                    {canManage && (
                        <>
                            <button className="btn btn-sm btn-outline-primary px-2" onClick={() => openForm(p)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button className="btn btn-sm btn-outline-danger px-2" onClick={() => remove(p)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </>
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="News & Events"
                subtitle="Stories, upcoming events and notices published to your school website."
                breadcrumbs={[{ title: 'School Website', href: '/website' }, { title: 'News & Events' }]}
                actions={
                    canManage && (
                        <>
                            <button className="btn btn-outline-success" onClick={() => openForm(null, 'event')}>
                                <CalendarDays className="h-4 w-4" /> New event
                            </button>
                            <button className="btn btn-primary" onClick={() => openForm(null, 'news')}>
                                <Plus className="h-4 w-4" /> New story
                            </button>
                        </>
                    )
                }
            />

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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search titles…" />
                    <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={TYPES} placeholder="All types" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'published', label: 'Published' },
                            { value: 'draft', label: 'Draft' },
                        ]}
                        placeholder="Any status"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={posts} empty="No posts yet" emptyDescription="Share school news, upcoming events and notices with parents and the community." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit post' : form.data.type === 'event' ? 'New event' : 'New post'} size="xl">
                <form onSubmit={submit} className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {TYPES.map((t) => {
                            const { icon: Icon } = typeStyle[t.value as Post['type']];
                            return (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => form.setData('type', t.value)}
                                    className={cn('inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition', form.data.type === t.value ? 'border-primary bg-primary text-white' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]')}
                                >
                                    <Icon className="h-4 w-4" /> {t.label}
                                </button>
                            );
                        })}
                    </div>
                    <FormGrid>
                        <Input label="Title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={form.errors.title} placeholder={form.data.type === 'event' ? 'e.g. Annual Sports Day' : 'e.g. Form Four results: 98% Division I & II'} />
                        <Input label="Web address" value={form.data.slug} onChange={(e) => form.setData('slug', e.target.value)} error={form.errors.slug} placeholder="auto from title" />
                        <Textarea wrapperClassName="sm:col-span-2" label="Excerpt" rows={2} value={form.data.excerpt} onChange={(e) => form.setData('excerpt', e.target.value)} error={form.errors.excerpt} help="One or two sentences shown on cards and listings." />
                    </FormGrid>
                    {form.data.type === 'event' && (
                        <FormGrid cols={3}>
                            <Input label="Starts" required type="datetime-local" value={form.data.event_starts_at} onChange={(e) => form.setData('event_starts_at', e.target.value)} error={form.errors.event_starts_at} />
                            <Input label="Ends" type="datetime-local" value={form.data.event_ends_at} onChange={(e) => form.setData('event_ends_at', e.target.value)} error={form.errors.event_ends_at} />
                            <Input label="Location" value={form.data.event_location} onChange={(e) => form.setData('event_location', e.target.value)} error={form.errors.event_location} placeholder="e.g. School grounds" />
                        </FormGrid>
                    )}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <label>Story</label>
                            <RichTextEditor value={form.data.body} onChange={(html) => form.setData('body', html)} minHeight={260} />
                            {form.errors.body && <p className="form-error">{form.errors.body}</p>}
                        </div>
                        <div className="space-y-4">
                            <CoverField current={editing?.cover_url ?? null} file={form.data.cover_image} onFile={(f) => form.setData('cover_image', f)} error={form.errors.cover_image} />
                            <Select
                                label="Status"
                                value={form.data.status}
                                onChange={(e) => form.setData('status', e.target.value)}
                                options={[
                                    { value: 'published', label: 'Published — visible on the website' },
                                    { value: 'draft', label: 'Draft — only staff can see it' },
                                ]}
                            />
                            <Checkbox label="Feature on the home page" checked={form.data.is_featured} onChange={(e) => form.setData('is_featured', e.target.checked)} />
                        </div>
                    </div>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {form.data.status === 'published' ? <Megaphone className="h-4 w-4" /> : <Save className="h-4 w-4" />} {form.data.status === 'published' ? 'Publish' : 'Save draft'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
