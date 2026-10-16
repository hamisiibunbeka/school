import { Link } from '@inertiajs/react';
import { CalendarClock, Coins, FileText, Mail, Megaphone, Plus, Send, Smartphone } from 'lucide-react';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { dateTime, num } from '@/lib/utils';
import type { Paginated } from '@/types';

export type BroadcastRow = {
    id: number;
    title: string;
    channel: 'sms' | 'email' | 'both';
    status: string;
    audiences: string[];
    recipients: number;
    sent: number;
    failed: number;
    credits: number;
    scheduled_at: string | null;
    completed_at: string | null;
    created_at: string | null;
    created_by: string | null;
};

type Props = {
    broadcasts: Paginated<BroadcastRow>;
    filters: { search: string; status: string; channel: string };
    balance: { plan: number; purchased: number; total: number; plan_limit: number };
    stats: { month_broadcasts: number; month_messages: number; month_credits: number; scheduled: number; drafts: number };
};

export function ChannelBadge({ channel }: { channel: BroadcastRow['channel'] }) {
    return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold">
            {channel !== 'email' && <Smartphone className="h-3.5 w-3.5 text-primary" />}
            {channel !== 'sms' && <Mail className="h-3.5 w-3.5 text-info" />}
            {channel === 'both' ? 'SMS + Email' : channel.toUpperCase()}
        </span>
    );
}

export default function BroadcastIndex({ broadcasts, filters: initial, balance, stats }: Props) {
    const can = useCan();
    const manage = can('communication.manage');
    const { filters, setFilter, reset } = useFilters(initial);

    const columns: Column<BroadcastRow>[] = [
        {
            key: 'title',
            header: 'Broadcast',
            render: (b) => (
                <Link href={`/communication/broadcasts/${b.id}`} className="block max-w-sm">
                    <div className="font-bold text-black hover:text-primary dark:text-white-light">{b.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                        {b.audiences.map((a, i) => (
                            <span key={i} className="badge badge-outline-secondary text-[11px]">
                                {a}
                            </span>
                        ))}
                    </div>
                </Link>
            ),
        },
        { key: 'channel', header: 'Channel', render: (b) => <ChannelBadge channel={b.channel} /> },
        {
            key: 'delivery',
            header: 'Delivery',
            render: (b) =>
                b.status === 'draft' || b.status === 'scheduled' || b.status === 'cancelled' ? (
                    <span className="text-white-dark">—</span>
                ) : (
                    <div className="text-sm">
                        <span className="font-bold text-success">{num(b.sent)}</span> sent
                        {b.failed > 0 && (
                            <>
                                {' · '}
                                <span className="font-bold text-danger">{num(b.failed)}</span> failed
                            </>
                        )}
                        <div className="text-xs text-white-dark">of {num(b.recipients)} recipients</div>
                    </div>
                ),
        },
        { key: 'credits', header: 'SMS credits', align: 'center', render: (b) => (b.channel === 'email' ? '—' : num(b.credits)) },
        {
            key: 'when',
            header: 'When',
            render: (b) => (
                <div className="text-sm whitespace-nowrap">
                    {b.status === 'scheduled' ? <span className="text-info">Scheduled {dateTime(b.scheduled_at)}</span> : dateTime(b.completed_at ?? b.created_at)}
                    <div className="text-xs text-white-dark">by {b.created_by ?? '—'}</div>
                </div>
            ),
        },
        { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
    ];

    return (
        <>
            <PageHeader
                title="Broadcast Centre"
                subtitle="Create, send, schedule and track bulk SMS and email to parents, students, staff, applicants and other stakeholders."
                breadcrumbs={[{ title: 'Communication' }, { title: 'Broadcast Centre' }]}
                actions={
                    manage && (
                        <Link href="/communication/broadcasts/create" className="btn btn-primary">
                            <Plus className="h-4 w-4" /> New broadcast
                        </Link>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard
                    title="SMS balance"
                    value={num(balance.total)}
                    icon={Coins}
                    tone={balance.total > 0 ? 'primary' : 'danger'}
                    hint={
                        <Link href="/communication/sms-credits" className="text-primary hover:underline">
                            Buy SMS bundles →
                        </Link>
                    }
                />
                <StatCard title="Broadcasts this month" value={num(stats.month_broadcasts)} icon={Megaphone} tone="success" hint={`${num(stats.month_messages)} messages sent`} />
                <StatCard title="SMS credits used (month)" value={num(stats.month_credits)} icon={Send} tone="warning" />
                <StatCard title="Scheduled / drafts" value={`${num(stats.scheduled)} / ${num(stats.drafts)}`} icon={CalendarClock} tone="info" />
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
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={['draft', 'scheduled', 'queued', 'sending', 'completed', 'cancelled'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
                        placeholder="Any status"
                    />
                    <FilterSelect
                        value={filters.channel}
                        onChange={(v) => setFilter('channel', v)}
                        options={[
                            { value: 'sms', label: 'SMS' },
                            { value: 'email', label: 'Email' },
                            { value: 'both', label: 'SMS + Email' },
                        ]}
                        placeholder="All channels"
                    />
                </FilterBar>
                <DataTable
                    columns={columns}
                    paginated={broadcasts}
                    empty="No broadcasts yet"
                    emptyDescription="Create your first broadcast to reach parents, students, staff and other groups at once."
                />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
                {[
                    { icon: FileText, title: 'Templates', text: 'Reusable messages with {name}, {student_name}, {balance} placeholders.', href: '/communication/templates' },
                    { icon: Megaphone, title: 'Contact groups', text: 'Board members, PTA, alumni and partners you message often.', href: '/communication/groups' },
                    { icon: Send, title: 'Delivery log', text: 'Every individual SMS and email with its delivery status.', href: '/communication/messages' },
                ].map((c) => (
                    <Link key={c.title} href={c.href} className="panel flex items-start gap-3 hover:shadow-lg">
                        <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div>
                            <div className="font-bold text-black dark:text-white-light">{c.title}</div>
                            <div className="text-xs text-white-dark">{c.text}</div>
                        </div>
                    </Link>
                ))}
            </div>
        </>
    );
}
