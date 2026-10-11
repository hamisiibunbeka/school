import { Link } from '@inertiajs/react';
import { CheckCheck, FilePen, FileText, Hourglass, Plus, Undo2 } from 'lucide-react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { cn, compact, date, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { Amt } from '../_components/report';

type Row = {
    id: number;
    journal_no: string;
    date: string;
    type: string;
    reference: string | null;
    narration: string;
    total: string;
    status: string;
    lines_count: number;
    source: string | null;
    creator: string | null;
    approver: string | null;
    created_by: number | null;
};

type Props = {
    journals: Paginated<Row>;
    filters: { search: string; status: string; type: string; from: string; to: string; mine: string };
    types: Option[];
    statuses: Option[];
    stats: { draft: number; submitted: number; awaiting_me: number; posted_month: number; posted_month_total: string; reversed: number };
};

export default function JournalsIndex({ journals, filters: initial, types, statuses, stats }: Props) {
    const can = useCan();
    const { filters, setFilter, reset } = useFilters(initial);

    const columns: Column<Row>[] = [
        {
            key: 'journal_no',
            header: 'Journal',
            render: (j) => (
                <div>
                    <Link href={`/accounting/journals/${j.id}`} className="font-mono font-bold text-primary hover:underline">
                        {j.journal_no}
                    </Link>
                    <div className="text-xs text-white-dark">{date(j.date)}</div>
                </div>
            ),
        },
        {
            key: 'type',
            header: 'Type',
            render: (j) => (
                <div className="flex flex-col items-start gap-1">
                    <span className="badge badge-soft-info">{titleCase(j.type)}</span>
                    {j.source && <span className="text-[11px] text-white-dark">via {j.source}</span>}
                </div>
            ),
        },
        {
            key: 'narration',
            header: 'Narration',
            render: (j) => (
                <div className="max-w-md">
                    <div className="line-clamp-2">{j.narration}</div>
                    {j.reference && <div className="text-xs text-white-dark">Ref: {j.reference}</div>}
                </div>
            ),
        },
        { key: 'lines', header: 'Lines', align: 'center', render: (j) => j.lines_count },
        { key: 'total', header: 'Amount', align: 'right', render: (j) => <Amt value={j.total} bold /> },
        {
            key: 'people',
            header: 'Maker / Checker',
            render: (j) => (
                <div className="text-xs">
                    <div>{j.creator ?? 'System'}</div>
                    <div className="text-white-dark">{j.approver ? `✓ ${j.approver}` : '—'}</div>
                </div>
            ),
        },
        { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (j) => (
                <RowActions view={`/accounting/journals/${j.id}`} edit={can('accounting.manage') && ['draft', 'rejected'].includes(j.status) && !j.source ? `/accounting/journals/${j.id}/edit` : undefined} />
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="General Journal"
                subtitle="Manual and sub-ledger journals with maker-checker approval. Posted journals are immutable — correct them by reversal."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Journals' }]}
                actions={
                    can('accounting.manage') && (
                        <Link href="/accounting/journals/create" className="btn btn-primary">
                            <Plus className="h-4 w-4" /> New journal entry
                        </Link>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <button type="button" className="text-start" onClick={() => setFilter('status', 'draft')}>
                    <StatCard title="Drafts" value={num(stats.draft)} icon={FilePen} tone="secondary" />
                </button>
                <button type="button" className="text-start" onClick={() => setFilter('mine', filters.mine === 'approval' ? '' : 'approval')}>
                    <StatCard title="Awaiting approval" value={num(stats.submitted)} icon={Hourglass} tone="warning" hint={`${num(stats.awaiting_me)} you can approve`} />
                </button>
                <StatCard title="Posted this month" value={num(stats.posted_month)} icon={CheckCheck} tone="success" hint={`TZS ${compact(stats.posted_month_total)}`} />
                <button type="button" className="text-start" onClick={() => setFilter('status', 'reversed')}>
                    <StatCard title="Reversed" value={num(stats.reversed)} icon={Undo2} tone="danger" />
                </button>
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Journal no, narration, reference…" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="All statuses" />
                    <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={types} placeholder="All types" />
                    <input type="date" className="form-input w-full sm:w-40" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} title="From date" />
                    <input type="date" className="form-input w-full sm:w-40" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} title="To date" />
                    {filters.mine === 'approval' && (
                        <span className={cn('badge badge-soft-warning')}>
                            <FileText className="me-1 inline h-3 w-3" /> Awaiting my approval
                        </span>
                    )}
                </FilterBar>
                <DataTable columns={columns} paginated={journals} empty="No journals found" emptyDescription="Adjust the filters or record a new journal entry." />
            </div>
        </>
    );
}
