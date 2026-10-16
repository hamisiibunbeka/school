import { Link, router } from '@inertiajs/react';
import { Ban, Copy, Mail, Pencil, RefreshCw, RotateCcw, Smartphone, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { dateTime, num, titleCase } from '@/lib/utils';
import type { Paginated } from '@/types';
import { ChannelBadge, type BroadcastRow } from './index';

type Log = {
    id: number;
    channel: string;
    recipient: string;
    recipient_name: string | null;
    subject: string | null;
    message: string;
    status: string;
    error: string | null;
    credits: number;
    created_at: string | null;
};

type Props = {
    broadcast: BroadcastRow & { body: string; subject: string | null; error: string | null };
    logs: Paginated<Log>;
    filters: { search: string; status: string; channel: string };
    by_status: Record<string, number>;
};

export default function BroadcastShow({ broadcast: b, logs, filters: initial, by_status }: Props) {
    const can = useCan();
    const manage = can('communication.manage');
    const { filters, setFilter } = useFilters(initial);
    const inProgress = b.status === 'queued' || b.status === 'sending';
    const done = b.sent + b.failed;
    const pct = b.recipients ? Math.min(100, Math.round((done / b.recipients) * 100)) : 0;

    // Background broadcasts: refresh progress every 5 seconds until finished.
    useEffect(() => {
        if (!inProgress) return;
        const t = setInterval(() => router.reload({ only: ['broadcast', 'logs', 'by_status'] }), 5000);
        return () => clearInterval(t);
    }, [inProgress]);

    const act = async (path: string, title: string, text: string, danger = false) => {
        const { confirmed } = await confirm({ title, text, confirmText: 'Yes, continue', danger });
        if (!confirmed) return;
        if (path.endsWith('/delete')) router.delete(`/communication/broadcasts/${b.id}`);
        else router.post(`/communication/broadcasts/${b.id}/${path}`, {}, { preserveScroll: true });
    };

    const columns: Column<Log>[] = [
        {
            key: 'recipient',
            header: 'Recipient',
            render: (m) => (
                <div>
                    <div className="flex items-center gap-1.5 font-semibold">
                        {m.channel === 'email' ? <Mail className="h-3.5 w-3.5 text-info" /> : <Smartphone className="h-3.5 w-3.5 text-primary" />}
                        {m.recipient}
                    </div>
                    {m.recipient_name && <div className="text-xs text-white-dark">{m.recipient_name}</div>}
                </div>
            ),
        },
        { key: 'message', header: 'Message', render: (m) => <div className="line-clamp-2 max-w-md text-sm">{m.message}</div> },
        { key: 'credits', header: 'Credits', align: 'center', render: (m) => (m.channel === 'sms' ? m.credits : '—') },
        {
            key: 'status',
            header: 'Status',
            render: (m) => (
                <div>
                    <StatusBadge status={m.status} />
                    {m.error && <div className="mt-1 max-w-xs text-xs text-danger">{m.error}</div>}
                </div>
            ),
        },
        { key: 'time', header: 'Time', render: (m) => <span className="whitespace-nowrap">{dateTime(m.created_at)}</span> },
    ];

    return (
        <>
            <PageHeader
                title={b.title}
                subtitle={`Created by ${b.created_by ?? '—'} · ${dateTime(b.created_at)}`}
                breadcrumbs={[{ title: 'Communication' }, { title: 'Broadcast Centre', href: '/communication/broadcasts' }, { title: b.title }]}
                actions={
                    manage && (
                        <>
                            {(b.status === 'draft' || b.status === 'scheduled') && (
                                <Link href={`/communication/broadcasts/${b.id}/edit`} className="btn btn-primary">
                                    <Pencil className="h-4 w-4" /> {b.status === 'draft' ? 'Edit & send' : 'Edit'}
                                </Link>
                            )}
                            {b.status === 'scheduled' && (
                                <button className="btn btn-outline-warning" onClick={() => act('cancel', 'Cancel this scheduled broadcast?', 'It will not be sent.')}>
                                    <Ban className="h-4 w-4" /> Cancel
                                </button>
                            )}
                            {b.status === 'completed' && b.failed > 0 && (
                                <button
                                    className="btn btn-outline-warning"
                                    onClick={() => act('retry', `Retry ${b.failed} failed message(s)?`, 'Failed SMS use credits again when they succeed.')}
                                >
                                    <RotateCcw className="h-4 w-4" /> Retry failed
                                </button>
                            )}
                            <Link href={`/communication/broadcasts/create?from=${b.id}`} className="btn btn-outline-primary">
                                <Copy className="h-4 w-4" /> Duplicate
                            </Link>
                            {(b.status === 'draft' || b.status === 'cancelled') && (
                                <button className="btn btn-outline-danger" onClick={() => act('delete', 'Delete this broadcast?', 'This cannot be undone.', true)}>
                                    <Trash2 className="h-4 w-4" /> Delete
                                </button>
                            )}
                        </>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={b.status} />
                        <ChannelBadge channel={b.channel} />
                    </div>
                    {b.status === 'scheduled' && <p className="text-sm text-info">Will be sent on {dateTime(b.scheduled_at)}.</p>}
                    {b.error && <p className="rounded-md bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">{b.error}</p>}
                    <div>
                        <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">Audience</div>
                        <ul className="space-y-1 text-sm">
                            {b.audiences.map((a, i) => (
                                <li key={i}>• {a}</li>
                            ))}
                        </ul>
                    </div>
                    {!['draft', 'scheduled', 'cancelled'].includes(b.status) && (
                        <div>
                            <div className="mb-1 flex justify-between text-sm font-bold">
                                <span className="flex items-center gap-1.5">
                                    {inProgress && <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />}
                                    {num(done)} / {num(b.recipients)} processed
                                </span>
                                <span>{pct}%</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <div className="text-lg font-extrabold text-success">{num(b.sent)}</div>
                                    <div className="text-[11px] font-bold text-white-dark uppercase">Sent</div>
                                </div>
                                <div>
                                    <div className="text-lg font-extrabold text-danger">{num(b.failed)}</div>
                                    <div className="text-[11px] font-bold text-white-dark uppercase">Failed</div>
                                </div>
                                <div>
                                    <div className="text-lg font-extrabold text-warning">{b.channel === 'email' ? '—' : num(b.credits)}</div>
                                    <div className="text-[11px] font-bold text-white-dark uppercase">Credits</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="panel xl:col-span-2">
                    <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">Message</div>
                    {b.subject && <div className="mb-2 font-bold">{b.subject}</div>}
                    <div className="rounded-md bg-[#f6f8fa] p-4 text-sm whitespace-pre-line dark:bg-[#1a2941]">{b.body}</div>
                </div>
            </div>

            {!['draft', 'scheduled', 'cancelled'].includes(b.status) && (
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Recipients</h5>
                    <FilterBar>
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search recipient…" />
                        <FilterSelect
                            value={filters.status}
                            onChange={(v) => setFilter('status', v)}
                            options={['queued', 'sent', 'delivered', 'failed'].map((s) => ({ value: s, label: `${titleCase(s)} (${num(by_status[s] ?? 0)})` }))}
                            placeholder="Any status"
                        />
                        {b.channel === 'both' && (
                            <FilterSelect
                                value={filters.channel}
                                onChange={(v) => setFilter('channel', v)}
                                options={[
                                    { value: 'sms', label: 'SMS' },
                                    { value: 'email', label: 'Email' },
                                ]}
                                placeholder="All channels"
                            />
                        )}
                    </FilterBar>
                    <DataTable columns={columns} paginated={logs} empty={inProgress ? 'Sending…' : 'No messages'} />
                </div>
            )}
        </>
    );
}
