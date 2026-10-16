import { Link } from '@inertiajs/react';
import { ArrowDownLeft, ArrowUpRight, Download, Hash, Receipt, RotateCcw, Scale } from 'lucide-react';
import { IconButton, IconLink } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { DateRangePicker } from '@/components/ui/date-picker';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { dateTime, exportCsv, money, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { Amount, PocketNav, reverseTxn, TypeBadge, useCurrency, type Txn } from './_components/shared';

type Row = Txn & {
    student: string;
    admission_no: string;
    photo_url: string | null;
    account_id: number;
};
type Props = {
    transactions: Paginated<Row>;
    filters: {
        from: string;
        to: string;
        type: string;
        category: string;
        recorded_by: string;
        search: string;
    };
    totals: { in: string; out: string; count: number };
    recorders: Option[];
    categories: Option[];
};

export default function PocketMoneyTransactions({ transactions, filters: initial, totals, recorders, categories }: Props) {
    const can = useCan();
    const manage = can('boarding.manage');
    const cur = useCurrency();
    const { filters, setFilter } = useFilters(initial);

    const columns: Column<Row>[] = [
        {
            key: 'when',
            header: 'Time',
            render: (t) => <span className="whitespace-nowrap">{dateTime(t.transacted_at)}</span>,
        },
        {
            key: 'reference',
            header: 'Ref',
            render: (t) => <span className="font-mono text-xs">{t.reference}</span>,
        },
        {
            key: 'student',
            header: 'Student',
            render: (t) => (
                <Link href={`/boarding/pocket-money/${t.account_id}`} className="flex items-center gap-2">
                    <Avatar name={t.student} src={t.photo_url} className="h-8 w-8" />
                    <div>
                        <div className="font-semibold text-black hover:text-primary dark:text-white-light">{t.student}</div>
                        <div className="text-xs text-white-dark">{t.admission_no}</div>
                    </div>
                </Link>
            ),
        },
        {
            key: 'details',
            header: 'Details',
            render: (t) => (
                <div>
                    <div className="flex flex-wrap items-center gap-1">
                        <TypeBadge txn={t} />
                        {t.category && t.category !== 'refund' && <span className="text-xs font-semibold">{titleCase(t.category)}</span>}
                        {t.pin_verified && <span className="badge badge-soft-info">PIN</span>}
                    </div>
                    <div className="line-clamp-1 max-w-[260px] text-xs text-white-dark">{[t.description, t.counterparty].filter(Boolean).join(' · ')}</div>
                </div>
            ),
        },
        {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (t) => <Amount value={t.amount} />,
        },
        {
            key: 'balance',
            header: 'Balance after',
            align: 'right',
            render: (t) => money(t.balance_after, cur),
        },
        {
            key: 'by',
            header: 'Recorded by',
            render: (t) => t.recorded_by ?? '—',
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (t) => (
                <div className="flex justify-end gap-1">
                    <IconLink href={`/boarding/pocket-money/transactions/${t.id}/receipt`} icon={Receipt} title="Slip" />
                    {manage && t.reversible && <IconButton icon={RotateCcw} title="Reverse" className="text-warning" onClick={() => reverseTxn(t, cur)} />}
                </div>
            ),
        },
    ];

    const download = () =>
        exportCsv(`pocket-money-${filters.from}-to-${filters.to}.csv`, [
            ['Date', 'Reference', 'Student', 'Admission No', 'Type', 'Category', 'Details', 'Amount', 'Balance after', 'Recorded by'],
            ...transactions.data.map((t) => [
                t.transacted_at,
                t.reference,
                t.student,
                t.admission_no,
                t.type,
                t.category,
                [t.description, t.counterparty].filter(Boolean).join(' / '),
                t.amount,
                t.balance_after,
                t.recorded_by,
            ]),
        ]);

    return (
        <>
            <PageHeader
                title="Pocket Money — Day Book"
                subtitle="Every pocket money movement in order. Use it to close each day: cash received minus cash given should match the change in cash on hand."
                breadcrumbs={[{ title: 'Boarding', href: '/boarding/dormitories' }, { title: 'Pocket Money', href: '/boarding/pocket-money' }, { title: 'Day book' }]}
                actions={
                    <button className="btn btn-outline-primary" onClick={download} disabled={!transactions.data.length}>
                        <Download className="h-4 w-4" /> Export page
                    </button>
                }
            />

            <PocketNav active="transactions" />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Money in" value={money(totals.in, cur)} icon={ArrowDownLeft} tone="success" />
                <StatCard title="Money out" value={money(totals.out, cur)} icon={ArrowUpRight} tone="danger" />
                <StatCard title="Net change in cash" value={money(Number(totals.in) - Number(totals.out), cur)} icon={Scale} tone="primary" />
                <StatCard title="Transactions" value={num(totals.count)} icon={Hash} tone="info" />
            </div>

            <div className="panel">
                <FilterBar>
                    <DateRangePicker
                        from={filters.from}
                        to={filters.to}
                        allowClear={false}
                        placeholder="Choose period"
                        onChange={(f, t) => {
                            setFilter('from', f);
                            setFilter('to', t);
                        }}
                    />
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Ref or student…" />
                    <FilterSelect
                        value={filters.type}
                        onChange={(v) => setFilter('type', v)}
                        options={[
                            { value: 'deposit', label: 'Deposits' },
                            { value: 'withdrawal', label: 'Withdrawals' },
                            { value: 'reversal', label: 'Reversals' },
                        ]}
                        placeholder="All types"
                    />
                    <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} options={categories} placeholder="All purposes" />
                    <FilterSelect value={filters.recorded_by} onChange={(v) => setFilter('recorded_by', v)} options={recorders} placeholder="Anyone" />
                </FilterBar>
                <DataTable columns={columns} paginated={transactions} empty="No transactions in this period" />
            </div>
        </>
    );
}
