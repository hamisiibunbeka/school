import { router } from '@inertiajs/react';
import { CheckCheck, Inbox, Mail, MailOpen, Phone, Reply, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { confirm } from '@/lib/swal';
import { dateTime, num } from '@/lib/utils';
import type { Paginated } from '@/types';

type Inquiry = { id: number; name: string; email: string | null; phone: string | null; subject: string | null; message: string; status: 'new' | 'replied' | 'closed'; created_at: string };
type Props = { inquiries: Paginated<Inquiry>; filters: { search: string; status: string }; counts: Partial<Record<Inquiry['status'], number>>; canManage: boolean };

const tone = { new: 'warning', replied: 'success', closed: 'dark' } as const;

export default function WebsiteInquiries({ inquiries, filters: initial, counts, canManage }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [viewing, setViewing] = useState<Inquiry | null>(null);

    const setStatus = (i: Inquiry, status: Inquiry['status']) => {
        router.put(`/website/inquiries/${i.id}`, { status }, { preserveScroll: true, onSuccess: () => setViewing((v) => (v && v.id === i.id ? { ...v, status } : v)) });
    };
    const remove = async (i: Inquiry) => {
        const { confirmed } = await confirm({ title: `Delete the message from ${i.name}?`, confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/website/inquiries/${i.id}`, { preserveScroll: true, onSuccess: () => setViewing(null) });
    };

    const columns: Column<Inquiry>[] = [
        {
            key: 'from',
            header: 'From',
            render: (i) => (
                <div>
                    <div className="flex items-center gap-1.5 font-semibold text-black dark:text-white-light">
                        {i.status === 'new' ? <Mail className="h-3.5 w-3.5 text-warning" /> : <MailOpen className="h-3.5 w-3.5 text-white-dark" />}
                        {i.name}
                    </div>
                    <div className="text-xs text-white-dark">{[i.email, i.phone].filter(Boolean).join(' · ')}</div>
                </div>
            ),
        },
        {
            key: 'message',
            header: 'Message',
            render: (i) => (
                <div className="max-w-md">
                    {i.subject && <div className="font-semibold">{i.subject}</div>}
                    <div className="line-clamp-2 text-xs text-white-dark">{i.message}</div>
                </div>
            ),
        },
        { key: 'created_at', header: 'Received', render: (i) => <span className="text-xs whitespace-nowrap">{dateTime(i.created_at)}</span> },
        { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} tone={tone[i.status]} /> },
    ];

    return (
        <>
            <PageHeader title="Website Enquiries" subtitle="Messages sent by parents and visitors through the website contact form." breadcrumbs={[{ title: 'School Website', href: '/website' }, { title: 'Enquiries' }]} />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title="New" value={num(counts.new ?? 0)} icon={Inbox} tone="warning" />
                <StatCard title="Replied" value={num(counts.replied ?? 0)} icon={CheckCheck} tone="success" />
                <StatCard title="Closed" value={num(counts.closed ?? 0)} icon={XCircle} tone="secondary" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name, email, phone or message…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'new', label: 'New' },
                            { value: 'replied', label: 'Replied' },
                            { value: 'closed', label: 'Closed' },
                        ]}
                        placeholder="Any status"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={inquiries} onRowClick={setViewing} empty="No enquiries yet" emptyDescription="Messages from your website's contact page will appear here." />
            </div>

            <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.subject || `Message from ${viewing?.name ?? ''}`} size="lg">
                {viewing && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                            <strong>{viewing.name}</strong>
                            {viewing.email && (
                                <a href={`mailto:${viewing.email}?subject=${encodeURIComponent('Re: ' + (viewing.subject || 'Your enquiry'))}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                                    <Mail className="h-3.5 w-3.5" /> {viewing.email}
                                </a>
                            )}
                            {viewing.phone && (
                                <a href={`tel:${viewing.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                                    <Phone className="h-3.5 w-3.5" /> {viewing.phone}
                                </a>
                            )}
                            <StatusBadge status={viewing.status} tone={tone[viewing.status]} />
                        </div>
                        <p className="rounded-lg bg-[#f6f8fa] p-4 text-sm whitespace-pre-line dark:bg-[#1b2e4b]">{viewing.message}</p>
                        <p className="text-xs text-white-dark">Received {dateTime(viewing.created_at)}</p>
                        {canManage && (
                            <div className="flex flex-wrap justify-center gap-2">
                                {viewing.status !== 'replied' && (
                                    <button className="btn btn-success" onClick={() => setStatus(viewing, 'replied')}>
                                        <Reply className="h-4 w-4" /> Mark replied
                                    </button>
                                )}
                                {viewing.status !== 'closed' && (
                                    <button className="btn btn-outline-dark" onClick={() => setStatus(viewing, 'closed')}>
                                        <XCircle className="h-4 w-4" /> Close
                                    </button>
                                )}
                                {viewing.status !== 'new' && (
                                    <button className="btn btn-outline-warning" onClick={() => setStatus(viewing, 'new')}>
                                        <Mail className="h-4 w-4" /> Mark unread
                                    </button>
                                )}
                                <button className="btn btn-outline-danger" onClick={() => remove(viewing)}>
                                    <Trash2 className="h-4 w-4" /> Delete
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
