import { router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, BookDown, BookOpen, BookX, CalendarClock, Coins, Plus, RefreshCw, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, money, num, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import SearchSelect from '../boarding/_components/search-select';

type Loan = {
    id: number;
    book_id: number;
    book: string;
    author: string | null;
    borrower: string;
    borrower_ref: string;
    borrower_type: 'student' | 'staff';
    issued_on: string;
    due_on: string;
    returned_on: string | null;
    fine: string;
    status: string;
    is_overdue: boolean;
    days_overdue: number;
    suggested_fine: string;
    issued_by: string | null;
};
type BookOption = Option & { available: number };
type Props = {
    loans: Paginated<Loan>;
    filters: { search: string; status: string; borrower: string };
    books: BookOption[];
    students: Option[];
    employees: Option[];
    defaults: { loan_days: number; fine_per_day: string; max_open: number };
    stats: { issued: number; overdue: number; due_today: number; returned_month: number; fines_month: string; lost: number };
};

const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);

export default function Loans({ loans, filters: initial, books, students, employees, defaults, stats }: Props) {
    const can = useCan();
    const manage = can('library.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [returning, setReturning] = useState<Loan | null>(null);
    const [losing, setLosing] = useState<Loan | null>(null);
    const issue = useForm({ book_id: '', borrower_type: 'student', student_id: '', employee_id: '', issued_on: today(), due_on: addDays(today(), defaults.loan_days) });
    const ret = useForm({ returned_on: today(), fine: '0' });
    const lost = useForm({ fine: '', reason: '' });

    const fineFor = (loan: Loan, returnedOn: string) => Math.max(0, daysBetween(loan.due_on, returnedOn)) * Number(defaults.fine_per_day);

    const openReturn = (l: Loan) => {
        ret.clearErrors();
        ret.setData({ returned_on: today(), fine: String(fineFor(l, today())) });
        setReturning(l);
    };

    const renew = async (l: Loan) => {
        const { confirmed } = await confirm({ title: `Renew "${l.book}"?`, text: `Extends the due date by ${defaults.loan_days} days.`, confirmText: 'Renew' });
        if (confirmed) router.post(`/library/loans/${l.id}/renew`, {}, { preserveScroll: true });
    };

    const columns: Column<Loan>[] = [
        {
            key: 'book',
            header: 'Book',
            render: (l) => (
                <div>
                    <div className="font-bold text-black dark:text-white-light">{l.book}</div>
                    <div className="text-xs text-white-dark">{l.author}</div>
                </div>
            ),
        },
        {
            key: 'borrower',
            header: 'Borrower',
            render: (l) => (
                <div>
                    <div className="font-semibold">
                        {l.borrower} {l.borrower_type === 'staff' && <span className="badge badge-soft-secondary ms-1">Staff</span>}
                    </div>
                    <div className="text-xs text-white-dark">{l.borrower_ref}</div>
                </div>
            ),
        },
        { key: 'issued_on', header: 'Issued', render: (l) => date(l.issued_on) },
        {
            key: 'due_on',
            header: 'Due',
            render: (l) => (
                <div className={cn(l.is_overdue && 'font-bold text-danger')}>
                    {date(l.due_on)}
                    {l.is_overdue && <div className="text-xs">{l.days_overdue} day(s) late</div>}
                </div>
            ),
        },
        { key: 'returned_on', header: 'Returned', render: (l) => date(l.returned_on) },
        {
            key: 'fine',
            header: 'Fine',
            align: 'right',
            render: (l) =>
                l.status === 'issued' ? (
                    Number(l.suggested_fine) > 0 ? <span className="text-danger">{money(l.suggested_fine, cur)}*</span> : '—'
                ) : Number(l.fine) > 0 ? (
                    money(l.fine, cur)
                ) : (
                    '—'
                ),
        },
        { key: 'status', header: 'Status', render: (l) => (l.is_overdue ? <StatusBadge status="overdue" /> : <StatusBadge status={l.status} />) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (l) =>
                manage && l.status === 'issued' ? (
                    <div className="flex justify-end gap-1">
                        <IconButton icon={Undo2} title="Return" className="text-success" onClick={() => openReturn(l)} />
                        {!l.is_overdue && <IconButton icon={RefreshCw} title="Renew" className="text-primary" onClick={() => renew(l)} />}
                        <IconButton
                            icon={BookX}
                            title="Mark lost"
                            className="text-danger"
                            onClick={() => {
                                lost.clearErrors();
                                lost.setData({ fine: '', reason: '' });
                                setLosing(l);
                            }}
                        />
                    </div>
                ) : null,
        },
    ];

    const selectedBook = books.find((b) => String(b.value) === issue.data.book_id);

    return (
        <>
            <PageHeader
                title="Loans Desk"
                subtitle={`Issue and return books · ${defaults.loan_days}-day loans · max ${defaults.max_open} books per borrower · fine ${money(defaults.fine_per_day, cur)}/day overdue.`}
                breadcrumbs={[{ title: 'Library', href: '/library/books' }, { title: 'Loans' }]}
                actions={
                    manage && (
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                issue.clearErrors();
                                issue.setData({ book_id: '', borrower_type: 'student', student_id: '', employee_id: '', issued_on: today(), due_on: addDays(today(), defaults.loan_days) });
                                setOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" /> Issue book
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Books out" value={num(stats.issued)} icon={BookOpen} tone="primary" hint={`${stats.due_today} due today`} />
                <StatCard title="Overdue" value={num(stats.overdue)} icon={AlertTriangle} tone={stats.overdue ? 'danger' : 'success'} />
                <StatCard title="Returned this month" value={num(stats.returned_month)} icon={BookDown} tone="success" hint={`${stats.lost} lost overall`} />
                <StatCard title="Fines this month" value={money(stats.fines_month, cur)} icon={Coins} tone="warning" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search book, ISBN or borrower…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'issued', label: 'On loan' },
                            { value: 'overdue', label: 'Overdue' },
                            { value: 'returned', label: 'Returned' },
                            { value: 'lost', label: 'Lost' },
                        ]}
                        placeholder="All loans"
                    />
                    <FilterSelect
                        value={filters.borrower}
                        onChange={(v) => setFilter('borrower', v)}
                        options={[
                            { value: 'student', label: 'Students' },
                            { value: 'staff', label: 'Staff' },
                        ]}
                        placeholder="All borrowers"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={loans} empty="No loans found" />
                <p className="mt-2 text-xs text-white-dark">* Fine accrued so far at {money(defaults.fine_per_day, cur)} per day; confirmed on return.</p>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Issue book" size="lg">
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        issue.post('/library/loans', { preserveScroll: true, onSuccess: () => setOpen(false) });
                    }}
                    className="space-y-4"
                >
                    <SearchSelect
                        label="Book"
                        required
                        options={books}
                        value={issue.data.book_id}
                        onChange={(v) => issue.setData('book_id', v)}
                        error={issue.errors.book_id}
                        renderOption={(b) => <span className={cn(b.available === 0 && 'text-danger line-through')}>{b.label}</span>}
                    />
                    {selectedBook && selectedBook.available === 0 && <p className="text-sm text-danger">No copies available — this book cannot be issued.</p>}
                    <div className="flex gap-2">
                        {(['student', 'staff'] as const).map((t) => (
                            <button key={t} type="button" className={cn('btn btn-sm', issue.data.borrower_type === t ? 'btn-primary' : 'btn-outline-primary')} onClick={() => issue.setData('borrower_type', t)}>
                                {t === 'student' ? 'Student' : 'Staff member'}
                            </button>
                        ))}
                    </div>
                    {issue.data.borrower_type === 'student' ? (
                        <SearchSelect label="Student" required options={students} value={issue.data.student_id} onChange={(v) => issue.setData('student_id', v)} error={issue.errors.student_id} />
                    ) : (
                        <SearchSelect label="Staff member" required options={employees} value={issue.data.employee_id} onChange={(v) => issue.setData('employee_id', v)} error={issue.errors.employee_id} />
                    )}
                    <FormGrid>
                        <Input
                            label="Issue date"
                            type="date"
                            required
                            value={issue.data.issued_on}
                            onChange={(e) => issue.setData((d) => ({ ...d, issued_on: e.target.value, due_on: e.target.value ? addDays(e.target.value, defaults.loan_days) : d.due_on }))}
                            error={issue.errors.issued_on}
                        />
                        <Input label="Due date" type="date" required value={issue.data.due_on} onChange={(e) => issue.setData('due_on', e.target.value)} error={issue.errors.due_on} />
                    </FormGrid>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={issue.processing || selectedBook?.available === 0}>
                            Issue book
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!returning} onClose={() => setReturning(null)} title={`Return "${returning?.book ?? ''}"`}>
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        ret.post(`/library/loans/${returning?.id}/return`, { preserveScroll: true, onSuccess: () => setReturning(null) });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm text-white-dark">
                        Borrowed by <strong className="text-black dark:text-white-light">{returning?.borrower}</strong>, due {date(returning?.due_on)}.
                    </p>
                    <FormGrid>
                        <Input
                            label="Return date"
                            type="date"
                            required
                            value={ret.data.returned_on}
                            onChange={(e) => ret.setData((d) => ({ ...d, returned_on: e.target.value, fine: returning && e.target.value ? String(fineFor(returning, e.target.value)) : d.fine }))}
                            error={ret.errors.returned_on}
                        />
                        <Input
                            label={`Fine (${cur})`}
                            type="number"
                            min={0}
                            step="100"
                            required
                            value={ret.data.fine}
                            onChange={(e) => ret.setData('fine', e.target.value)}
                            error={ret.errors.fine}
                            help={returning ? `Calculated: ${Math.max(0, daysBetween(returning.due_on, ret.data.returned_on || today()))} day(s) × ${money(defaults.fine_per_day, cur)} — editable` : undefined}
                        />
                    </FormGrid>
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setReturning(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-success" disabled={ret.processing}>
                            <CalendarClock className="h-4 w-4" /> Record return
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!losing} onClose={() => setLosing(null)} title={`Mark "${losing?.book ?? ''}" as lost`}>
                <form
                    onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        lost.post(`/library/loans/${losing?.id}/lost`, { preserveScroll: true, onSuccess: () => setLosing(null) });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm text-danger">The copy is removed from the collection and {losing?.borrower} is charged the replacement amount.</p>
                    <Input label={`Replacement charge (${cur})`} type="number" min={0} required value={lost.data.fine} onChange={(e) => lost.setData('fine', e.target.value)} error={lost.errors.fine} />
                    <Input label="Notes" value={lost.data.reason} onChange={(e) => lost.setData('reason', e.target.value)} error={lost.errors.reason} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setLosing(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-danger" disabled={lost.processing}>
                            Mark lost
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
