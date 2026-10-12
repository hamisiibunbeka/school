import { router, useForm } from '@inertiajs/react';
import { BellRing, CalendarClock, Clock, Megaphone, Pencil, Plus, Send, Trash2, Undo2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import Pagination from '@/components/ui/pagination';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, dateTime, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { toLocalInput } from './_components/helpers';

type Announcement = {
    id: number;
    title: string;
    body: string;
    audience: string;
    school_class_id: number | null;
    class: string | null;
    priority: 'normal' | 'important' | 'urgent';
    publish_at: string | null;
    expires_at: string | null;
    notified_at: string | null;
    status: 'published' | 'scheduled' | 'expired';
    author: string | null;
    created_at: string | null;
};

type Props = {
    announcements: Paginated<Announcement>;
    filters: { search: string; audience: string; status: string; priority: string };
    classes: Option[];
    stats: { live: number; scheduled: number; expired: number; urgent: number };
};

const audiences = [
    { value: 'all', label: 'Everyone' },
    { value: 'staff', label: 'Staff' },
    { value: 'parents', label: 'Parents' },
    { value: 'students', label: 'Students' },
    { value: 'class', label: 'A specific class' },
];
const priorities = [
    { value: 'normal', label: 'Normal' },
    { value: 'important', label: 'Important' },
    { value: 'urgent', label: 'Urgent' },
];
const priorityStyle = {
    normal: { border: 'border-s-primary', badge: 'badge-soft-primary' },
    important: { border: 'border-s-warning', badge: 'badge-soft-warning' },
    urgent: { border: 'border-s-danger', badge: 'badge-soft-danger' },
};
const statusTone = { published: 'success', scheduled: 'info', expired: 'dark' } as const;

const blank = { title: '', body: '', audience: 'all', school_class_id: '', priority: 'normal', publish_at: '', expires_at: '' };

export default function Announcements({ announcements, filters: initial, classes, stats }: Props) {
    const can = useCan();
    const manage = can('communication.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [viewing, setViewing] = useState<Announcement | null>(null);
    const form = useForm(blank);

    const openForm = (a: Announcement | null) => {
        setEditing(a);
        form.clearErrors();
        form.setData(
            a
                ? {
                      title: a.title,
                      body: a.body,
                      audience: a.audience,
                      school_class_id: a.school_class_id ? String(a.school_class_id) : '',
                      priority: a.priority,
                      publish_at: toLocalInput(a.publish_at),
                      expires_at: toLocalInput(a.expires_at),
                  }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/communication/announcements/${editing.id}`, opts);
        else form.post('/communication/announcements', opts);
    };

    const action = async (a: Announcement, kind: 'publish' | 'expire' | 'delete') => {
        const copy = {
            publish: { title: `Publish "${a.title}" now?`, text: 'Targeted users will receive an in-app notification.', confirmText: 'Publish now', danger: false },
            expire: { title: `Unpublish "${a.title}"?`, text: 'It will no longer be visible on portals and dashboards.', confirmText: 'Unpublish', danger: true },
            delete: { title: `Delete "${a.title}"?`, text: 'This cannot be undone.', confirmText: 'Delete', danger: true },
        }[kind];
        const { confirmed } = await confirm(copy);
        if (!confirmed) return;
        if (kind === 'delete') router.delete(`/communication/announcements/${a.id}`, { preserveScroll: true });
        else router.post(`/communication/announcements/${a.id}/${kind}`, {}, { preserveScroll: true });
    };

    const audienceLabel = (a: Announcement) => (a.audience === 'class' ? `Class: ${a.class ?? '—'}` : (audiences.find((x) => x.value === a.audience)?.label ?? titleCase(a.audience)));

    return (
        <>
            <PageHeader
                title="Announcements"
                subtitle="Targeted notices for staff, parents and students with a publish window."
                breadcrumbs={[{ title: 'Communication' }, { title: 'Announcements' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> New announcement
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Live now" value={num(stats.live)} icon={Megaphone} tone="success" />
                <StatCard title="Scheduled" value={num(stats.scheduled)} icon={CalendarClock} tone="info" />
                <StatCard title="Urgent (live)" value={num(stats.urgent)} icon={BellRing} tone="danger" />
                <StatCard title="Expired" value={num(stats.expired)} icon={Clock} tone="secondary" />
            </div>

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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search title or message…" />
                    <FilterSelect value={filters.audience} onChange={(v) => setFilter('audience', v)} options={audiences} placeholder="All audiences" />
                    <FilterSelect value={filters.priority} onChange={(v) => setFilter('priority', v)} options={priorities} placeholder="Any priority" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'published', label: 'Live' },
                            { value: 'scheduled', label: 'Scheduled' },
                            { value: 'expired', label: 'Expired' },
                        ]}
                        placeholder="Any status"
                    />
                </FilterBar>

                {announcements.data.length === 0 ? (
                    <EmptyState title="No announcements found" description="Create a notice to reach staff, parents or students." />
                ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {announcements.data.map((a) => (
                            <div
                                key={a.id}
                                className={cn('flex flex-col rounded-lg border border-s-4 border-white-light bg-white p-5 shadow-sm dark:border-[#1b2e4b] dark:bg-[#0e1726]', priorityStyle[a.priority].border, a.status === 'expired' && 'opacity-70')}
                            >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <StatusBadge status={a.status} tone={statusTone[a.status]} label={a.status === 'published' ? 'Live' : undefined} />
                                    {a.priority !== 'normal' && <span className={cn('badge', priorityStyle[a.priority].badge)}>{titleCase(a.priority)}</span>}
                                    <span className="badge badge-outline-dark">
                                        <Users className="me-1 inline h-3 w-3" />
                                        {audienceLabel(a)}
                                    </span>
                                </div>
                                <button type="button" className="text-start" onClick={() => setViewing(a)}>
                                    <h5 className="text-base font-bold text-black hover:text-primary dark:text-white-light">{a.title}</h5>
                                </button>
                                <p className="mt-2 line-clamp-4 flex-1 text-sm whitespace-pre-line text-white-dark">{a.body}</p>
                                <div className="mt-4 space-y-0.5 border-t border-white-light pt-3 text-xs text-white-dark dark:border-[#1b2e4b]">
                                    <div>
                                        <strong>Publish:</strong> {a.publish_at ? dateTime(a.publish_at) : dateTime(a.created_at)}
                                        {a.expires_at && (
                                            <>
                                                {' '}
                                                · <strong>Until:</strong> {dateTime(a.expires_at)}
                                            </>
                                        )}
                                    </div>
                                    <div>
                                        By {a.author ?? 'System'} {a.notified_at && <span className="text-success">· notified {dateTime(a.notified_at)}</span>}
                                    </div>
                                </div>
                                {manage && (
                                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                                        {a.status !== 'published' && (
                                            <button className="btn btn-sm btn-outline-success" onClick={() => action(a, 'publish')}>
                                                <Send className="h-3.5 w-3.5" /> Publish now
                                            </button>
                                        )}
                                        {a.status === 'published' && (
                                            <button className="btn btn-sm btn-outline-warning" onClick={() => action(a, 'expire')}>
                                                <Undo2 className="h-3.5 w-3.5" /> Unpublish
                                            </button>
                                        )}
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => openForm(a)}>
                                            <Pencil className="h-3.5 w-3.5" /> Edit
                                        </button>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => action(a, 'delete')} title="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <Pagination meta={announcements as Paginated<unknown>} />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit announcement' : 'New announcement'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <Input label="Title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={form.errors.title} placeholder="e.g. Term II opening date" />
                    <Textarea label="Message" required rows={6} value={form.data.body} onChange={(e) => form.setData('body', e.target.value)} error={form.errors.body} />
                    <FormGrid>
                        <Select label="Audience" value={form.data.audience} onChange={(e) => form.setData('audience', e.target.value)} options={audiences} error={form.errors.audience} />
                        {form.data.audience === 'class' ? (
                            <Select label="Class" required placeholder="Select class" value={form.data.school_class_id} onChange={(e) => form.setData('school_class_id', e.target.value)} options={classes} error={form.errors.school_class_id} />
                        ) : (
                            <Select label="Priority" value={form.data.priority} onChange={(e) => form.setData('priority', e.target.value)} options={priorities} />
                        )}
                        {form.data.audience === 'class' && <Select label="Priority" value={form.data.priority} onChange={(e) => form.setData('priority', e.target.value)} options={priorities} />}
                        <Input label="Publish at" type="datetime-local" value={form.data.publish_at} onChange={(e) => form.setData('publish_at', e.target.value)} error={form.errors.publish_at} help="Leave blank to publish immediately." />
                        <Input label="Expires at" type="datetime-local" value={form.data.expires_at} onChange={(e) => form.setData('expires_at', e.target.value)} error={form.errors.expires_at} help="Optional end of the display window." />
                    </FormGrid>
                    <p className="rounded-md bg-info-light p-3 text-xs text-info dark:bg-info-dark-light">
                        When the announcement goes live, matching staff, parent and student accounts receive an in-app notification (once per audience).
                    </p>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            <Send className="h-4 w-4" /> {editing ? 'Save changes' : form.data.publish_at ? 'Schedule' : 'Publish'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? ''} size="lg">
                {viewing && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge status={viewing.status} tone={statusTone[viewing.status]} />
                            <span className={cn('badge', priorityStyle[viewing.priority].badge)}>{titleCase(viewing.priority)}</span>
                            <span className="badge badge-outline-dark">{audienceLabel(viewing)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-line">{viewing.body}</p>
                        <p className="text-xs text-white-dark">
                            Published {dateTime(viewing.publish_at ?? viewing.created_at)} {viewing.expires_at && `· expires ${dateTime(viewing.expires_at)}`} · by {viewing.author ?? 'System'}
                        </p>
                    </div>
                )}
            </Modal>
        </>
    );
}
