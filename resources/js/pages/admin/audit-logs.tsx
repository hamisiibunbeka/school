import { Activity, CalendarDays, Download, Eye, FileDown, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { cleanQuery, cn, dateTime, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Log = {
    id: number;
    user: string | null;
    user_email: string | null;
    action: string;
    module: string | null;
    subject: string | null;
    description: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string | null;
};
type Props = {
    logs: Paginated<Log>;
    filters: { search: string; user: string; action: string; module: string; from: string; to: string };
    users: Option[];
    actions: string[];
    modules: string[];
    stats: { today: number; week: number; security: number; exports: number };
};

const actionTone = (a: string) =>
    /delete|disabled|failed|cancel|suspend|reverse|void/.test(a) ? 'badge-soft-danger' : /created|enabled|paid|publish|approved|activate/.test(a) ? 'badge-soft-success' : /role|password|switched|export/.test(a) ? 'badge-soft-warning' : 'badge-soft-info';

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function AuditLogs({ logs, filters: initial, users, actions, modules, stats }: Props) {
    const { filters, setFilter, reset } = useFilters(initial);
    const [viewing, setViewing] = useState<Log | null>(null);

    const columns: Column<Log>[] = [
        { key: 'date', header: 'When', render: (l) => <span className="whitespace-nowrap">{dateTime(l.created_at)}</span> },
        {
            key: 'user',
            header: 'User',
            render: (l) => (
                <div>
                    <div className="font-semibold">{l.user ?? 'System'}</div>
                    {l.ip_address && <div className="text-xs text-white-dark">{l.ip_address}</div>}
                </div>
            ),
        },
        { key: 'action', header: 'Action', render: (l) => <span className={cn('badge', actionTone(l.action))}>{titleCase(l.action)}</span> },
        { key: 'module', header: 'Module', render: (l) => (l.module ? titleCase(l.module) : '—') },
        { key: 'description', header: 'Description', render: (l) => <div className="max-w-md truncate">{l.description ?? '—'}</div> },
        {
            key: 'view',
            header: '',
            align: 'right',
            render: (l) => <IconButton icon={Eye} title="Details" className="text-info" onClick={() => setViewing(l)} />,
        },
    ];

    const keys = viewing ? Array.from(new Set([...Object.keys(viewing.old_values ?? {}), ...Object.keys(viewing.new_values ?? {})])) : [];

    return (
        <>
            <PageHeader
                title="Audit Trail"
                subtitle="Read-only record of sign-ins, approvals, role changes, exports and data changes."
                breadcrumbs={[{ title: 'Administration' }, { title: 'Audit Trail' }]}
                actions={
                    <a href={`/admin/audit-logs/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                        <Download className="h-4 w-4" /> Export CSV
                    </a>
                }
            />
            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Events today" value={num(stats.today)} icon={Activity} tone="primary" />
                <StatCard title="Last 7 days" value={num(stats.week)} icon={CalendarDays} tone="info" />
                <StatCard title="Security events (30d)" value={num(stats.security)} icon={ShieldAlert} tone="danger" hint="Role changes, resets, failed logins" />
                <StatCard title="Data exports (30d)" value={num(stats.exports)} icon={FileDown} tone="warning" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search description or IP…" />
                    <FilterSelect value={filters.user} onChange={(v) => setFilter('user', v)} options={users} placeholder="All users" />
                    <FilterSelect value={filters.action} onChange={(v) => setFilter('action', v)} options={actions.map((a) => ({ value: a, label: titleCase(a) }))} placeholder="All actions" />
                    <FilterSelect value={filters.module} onChange={(v) => setFilter('module', v)} options={modules.map((m) => ({ value: m, label: titleCase(m) }))} placeholder="All modules" />
                    <input type="date" className="form-input w-full sm:w-auto" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} title="From" />
                    <input type="date" className="form-input w-full sm:w-auto" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} title="To" />
                </FilterBar>
                <DataTable columns={columns} paginated={logs} empty="No audit events match your filters" compact />
            </div>

            <Modal open={!!viewing} onClose={() => setViewing(null)} title="Audit event" size="lg">
                {viewing && (
                    <div className="space-y-5">
                        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                            {[
                                ['When', dateTime(viewing.created_at)],
                                ['User', `${viewing.user ?? 'System'}${viewing.user_email ? ` (${viewing.user_email})` : ''}`],
                                ['Action', titleCase(viewing.action)],
                                ['Module', viewing.module ? titleCase(viewing.module) : '—'],
                                ['Record', viewing.subject ?? '—'],
                                ['IP address', viewing.ip_address ?? '—'],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-xs font-bold text-white-dark uppercase">{k}</dt>
                                    <dd className="font-semibold break-words">{v}</dd>
                                </div>
                            ))}
                            <div className="sm:col-span-2">
                                <dt className="text-xs font-bold text-white-dark uppercase">Description</dt>
                                <dd>{viewing.description ?? '—'}</dd>
                            </div>
                        </dl>
                        {keys.length > 0 && (
                            <div className="table-responsive">
                                <table className="table table-compact">
                                    <thead>
                                        <tr>
                                            <th>Field</th>
                                            <th>Old value</th>
                                            <th>New value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {keys.map((k) => {
                                            const o = show(viewing.old_values?.[k]);
                                            const n = show(viewing.new_values?.[k]);
                                            return (
                                                <tr key={k}>
                                                    <td className="font-semibold">{titleCase(k)}</td>
                                                    <td className={cn('font-mono text-xs break-all', o !== n && 'text-danger line-through decoration-danger/40')}>{o}</td>
                                                    <td className={cn('font-mono text-xs break-all', o !== n && 'font-bold text-success')}>{n}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {viewing.user_agent && <p className="text-[11px] break-all text-white-dark">{viewing.user_agent}</p>}
                    </div>
                )}
            </Modal>
        </>
    );
}
