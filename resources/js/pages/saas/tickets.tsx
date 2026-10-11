import { Link, useForm } from '@inertiajs/react';
import { AlertOctagon, CheckCircle2, Inbox, LoaderCircle, Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { dateTime, num, titleCase } from '@/lib/utils';
import type { Paginated } from '@/types';

type Ticket = {
    id: number;
    tenant_id: number;
    tenant: string | null;
    tenant_status: string | null;
    creator: string | null;
    creator_email: string | null;
    subject: string;
    description: string;
    priority: string;
    status: string;
    resolution: string | null;
    created_at: string | null;
    updated_at: string | null;
};
type Props = {
    tickets: Paginated<Ticket>;
    filters: { search: string; status: string; priority: string };
    statuses: string[];
    priorities: string[];
    stats: { open: number; in_progress: number; resolved: number; urgent: number };
};

const priorityTone = (p: string) => (p === 'urgent' ? 'danger' : p === 'high' ? 'warning' : p === 'low' ? 'dark' : 'info');

export default function Tickets({ tickets, filters: initial, statuses, priorities, stats }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [editing, setEditing] = useState<Ticket | null>(null);
    const form = useForm({ status: '', priority: '', resolution: '' });

    const open = (t: Ticket) => {
        form.clearErrors();
        form.setData({ status: t.status, priority: t.priority, resolution: t.resolution ?? '' });
        setEditing(t);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put(`/saas/tickets/${editing?.id}`, { preserveScroll: true, onSuccess: () => setEditing(null) });
    };

    const columns: Column<Ticket>[] = [
        { key: 'id', header: '#', render: (t) => <span className="font-mono text-xs">#{t.id}</span> },
        {
            key: 'subject',
            header: 'Subject',
            render: (t) => (
                <button type="button" className="text-start" onClick={() => open(t)}>
                    <div className="font-bold hover:text-primary">{t.subject}</div>
                    <div className="max-w-md truncate text-xs text-white-dark">{t.description}</div>
                </button>
            ),
        },
        {
            key: 'tenant',
            header: 'Tenant',
            render: (t) => (
                <div>
                    <Link href={`/saas/tenants/${t.tenant_id}`} className="font-semibold text-primary hover:underline">
                        {t.tenant}
                    </Link>
                    <div className="text-xs text-white-dark">{t.creator ?? '—'}</div>
                </div>
            ),
        },
        { key: 'priority', header: 'Priority', render: (t) => <StatusBadge status={t.priority} tone={priorityTone(t.priority)} /> },
        { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
        { key: 'created', header: 'Opened', render: (t) => <span className="whitespace-nowrap">{dateTime(t.created_at)}</span> },
        { key: 'actions', header: '', align: 'right', render: (t) => <IconButton icon={Pencil} title="Update" className="text-primary" onClick={() => open(t)} /> },
    ];

    return (
        <>
            <PageHeader title="Support Tickets" subtitle="Requests from tenant administrators across the platform." breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Support Tickets' }]} />
            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Open" value={num(stats.open)} icon={Inbox} tone="info" />
                <StatCard title="In progress" value={num(stats.in_progress)} icon={LoaderCircle} tone="primary" />
                <StatCard title="Urgent (open)" value={num(stats.urgent)} icon={AlertOctagon} tone="danger" />
                <StatCard title="Resolved / closed" value={num(stats.resolved)} icon={CheckCircle2} tone="success" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search subject or tenant…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses.map((s) => ({ value: s, label: titleCase(s) }))} placeholder="Any status" />
                    <FilterSelect value={filters.priority} onChange={(v) => setFilter('priority', v)} options={priorities.map((s) => ({ value: s, label: titleCase(s) }))} placeholder="Any priority" />
                </FilterBar>
                <DataTable columns={columns} paginated={tickets} empty="No tickets found" />
            </div>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={`Ticket #${editing?.id ?? ''}`} size="lg">
                {editing && (
                    <form onSubmit={submit} className="space-y-4">
                        <div>
                            <h6 className="text-base font-bold">{editing.subject}</h6>
                            <p className="text-xs text-white-dark">
                                {editing.tenant} · {editing.creator ?? 'Unknown'} {editing.creator_email && `(${editing.creator_email})`} · {dateTime(editing.created_at)}
                            </p>
                        </div>
                        <div className="rounded-md bg-[#f6f8fa] p-3 text-sm whitespace-pre-line dark:bg-[#1a2941]">{editing.description}</div>
                        <FormGrid>
                            <Select label="Status" value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} options={statuses.map((s) => ({ value: s, label: titleCase(s) }))} error={form.errors.status} />
                            <Select label="Priority" value={form.data.priority} onChange={(e) => form.setData('priority', e.target.value)} options={priorities.map((s) => ({ value: s, label: titleCase(s) }))} error={form.errors.priority} />
                        </FormGrid>
                        <Textarea
                            label="Resolution / response"
                            rows={4}
                            required={['resolved', 'closed'].includes(form.data.status)}
                            value={form.data.resolution}
                            onChange={(e) => form.setData('resolution', e.target.value)}
                            error={form.errors.resolution}
                            help="The ticket creator is notified in-app when the status changes."
                        />
                        <div className="flex justify-end gap-3">
                            <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" disabled={form.processing}>
                                Update ticket
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
}
