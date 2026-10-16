import { Link, router } from '@inertiajs/react';
import { CheckCircle2, Coins, Download, Eye, Mail, MessageSquareText, RotateCcw, Send, Smartphone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cleanQuery, dateTime, num, titleCase } from '@/lib/utils';
import type { Paginated } from '@/types';
import { DateRangePicker } from '@/components/ui/date-picker';

type Log = {
    id: number;
    channel: string;
    recipient: string;
    recipient_name: string | null;
    subject: string | null;
    message: string;
    status: string;
    provider_reference: string | null;
    error: string | null;
    credits: number;
    broadcast_id: number | null;
    sender: string | null;
    created_at: string | null;
};

type Props = {
    logs: Paginated<Log>;
    filters: { search: string; status: string; channel: string; from: string; to: string };
    gateway: string;
    balance: { plan: number; purchased: number; total: number; plan_limit: number };
    stats: { sent_month: number; credits_month: number; failed_month: number; total: number; by_status: Record<string, number> };
    chart: { label: string; credits: number; total: number; failed: number }[];
};

export default function Messages({ logs, filters: initial, gateway, balance, stats, chart }: Props) {
    const can = useCan();
    const manage = can('communication.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [viewing, setViewing] = useState<Log | null>(null);

    const columns: Column<Log>[] = [
        { key: 'date', header: 'Date', render: (m) => <span className="whitespace-nowrap">{dateTime(m.created_at)}</span> },
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
                    {m.broadcast_id && (
                        <Link href={`/communication/broadcasts/${m.broadcast_id}`} className="text-xs text-primary hover:underline">
                            Broadcast #{m.broadcast_id}
                        </Link>
                    )}
                </div>
            ),
        },
        {
            key: 'message',
            header: 'Message',
            render: (m) => (
                <button type="button" className="max-w-xs truncate text-start hover:text-primary sm:max-w-md" onClick={() => setViewing(m)}>
                    {m.subject ? <strong>{m.subject}: </strong> : null}
                    {m.message}
                </button>
            ),
        },
        { key: 'credits', header: 'Credits', align: 'center', render: (m) => (m.channel === 'sms' ? m.credits : '—') },
        { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (m) => (
                <div className="flex justify-end gap-1">
                    <IconButton icon={Eye} title="View" className="text-info" onClick={() => setViewing(m)} />
                    {manage && m.status === 'failed' && (
                        <IconButton
                            icon={RotateCcw}
                            title="Retry"
                            className="text-warning"
                            onClick={async () => {
                                const { confirmed } = await confirm({ title: 'Retry this message?', confirmText: 'Retry' });
                                if (confirmed) router.post(`/communication/messages/${m.id}/retry`, {}, { preserveScroll: true });
                            }}
                        />
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Delivery Log"
                subtitle={`Every SMS and email sent by the school, with its delivery status. SMS provider: ${gateway === 'log' ? 'Log driver (test mode)' : gateway}`}
                breadcrumbs={[{ title: 'Communication' }, { title: 'Delivery Log' }]}
                actions={
                    <>
                        {manage && (
                            <Link href="/communication/broadcasts/create" className="btn btn-primary">
                                <Send className="h-4 w-4" /> New broadcast
                            </Link>
                        )}
                        <a href={`/communication/messages/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export log
                        </a>
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Sent this month" value={num(stats.sent_month)} icon={CheckCircle2} tone="success" />
                <StatCard
                    title="Credits used (month)"
                    value={num(stats.credits_month)}
                    icon={Coins}
                    tone="primary"
                    hint={
                        <Link href="/communication/sms-credits" className="text-primary hover:underline">
                            {num(balance.total)} SMS left · buy more
                        </Link>
                    }
                />
                <StatCard title="Failed this month" value={num(stats.failed_month)} icon={XCircle} tone="danger" />
                <StatCard title="All-time messages" value={num(stats.total)} icon={MessageSquareText} tone="info" />
            </div>

            <div className="panel mb-6">
                <h5 className="mb-2 text-lg font-bold">SMS credits used — last 6 months</h5>
                <Chart
                    type="bar"
                    height={220}
                    series={[
                        { name: 'Credits', data: chart.map((c) => c.credits) },
                        { name: 'Failed msgs', data: chart.map((c) => c.failed) },
                    ]}
                    options={{ xaxis: { categories: chart.map((c) => c.label) }, plotOptions: { bar: { borderRadius: 4, columnWidth: '40%' } }, colors: ['#4361ee', '#e7515a'] }}
                />
            </div>

            <div className="panel">
                <h5 className="mb-4 text-lg font-bold">Delivery log</h5>
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search recipient or text…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={['queued', 'sent', 'delivered', 'failed'].map((s) => ({ value: s, label: `${titleCase(s)} (${num(stats.by_status[s] ?? 0)})` }))}
                        placeholder="Any status"
                    />
                    <FilterSelect
                        value={filters.channel}
                        onChange={(v) => setFilter('channel', v)}
                        options={[
                            { value: 'sms', label: 'SMS' },
                            { value: 'email', label: 'Email' },
                        ]}
                        placeholder="All channels"
                    />
                    <DateRangePicker
                        from={filters.from}
                        to={filters.to}
                        onChange={(f, t) => {
                            setFilter('from', f);
                            setFilter('to', t);
                        }}
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={logs} empty="No messages found" emptyDescription="Sent messages and their delivery status appear here." />
            </div>

            <Modal open={!!viewing} onClose={() => setViewing(null)} title="Message details">
                {viewing && (
                    <dl className="space-y-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge status={viewing.status} />
                            <span className="badge badge-outline-dark">{viewing.channel.toUpperCase()}</span>
                        </div>
                        <div>
                            <dt className="text-xs font-bold text-white-dark uppercase">Recipient</dt>
                            <dd>
                                {viewing.recipient_name ? `${viewing.recipient_name} · ` : ''}
                                {viewing.recipient}
                            </dd>
                        </div>
                        {viewing.subject && (
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Subject</dt>
                                <dd>{viewing.subject}</dd>
                            </div>
                        )}
                        <div>
                            <dt className="text-xs font-bold text-white-dark uppercase">Message</dt>
                            <dd className="rounded-md bg-[#f6f8fa] p-3 whitespace-pre-line dark:bg-[#1a2941]">{viewing.message}</dd>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Provider ref.</dt>
                                <dd className="font-mono text-xs">{viewing.provider_reference ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Credits</dt>
                                <dd>{viewing.credits}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Sent</dt>
                                <dd>{dateTime(viewing.created_at)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Sent by</dt>
                                <dd>{viewing.sender ?? 'System'}</dd>
                            </div>
                        </div>
                        {viewing.error && (
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Error</dt>
                                <dd className="text-danger">{viewing.error}</dd>
                            </div>
                        )}
                    </dl>
                )}
            </Modal>
        </>
    );
}
