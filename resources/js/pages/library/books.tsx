import { Link, useForm } from '@inertiajs/react';
import { AlertTriangle, BookCopy, BookOpen, Library, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { cn, exportCsv, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import ImportButton from '@/components/ui/import-button';

type Book = {
    id: number;
    title: string;
    author: string | null;
    isbn: string | null;
    publisher: string | null;
    category: string | null;
    shelf: string | null;
    copies_total: number;
    copies_available: number;
    on_loan: number;
    times_borrowed: number;
};
type Props = {
    books: Paginated<Book>;
    filters: { search: string; category: string; availability: string };
    categories: Option[];
    stats: { titles: number; copies: number; available: number; on_loan: number; overdue: number };
};

const blank = { title: '', author: '', isbn: '', publisher: '', category: '', shelf: '', copies_total: '1' as string | number };

const spineColors = ['bg-primary', 'bg-secondary', 'bg-success', 'bg-info', 'bg-warning', 'bg-danger'];

export default function Books({ books, filters: initial, categories, stats }: Props) {
    const can = useCan();
    const manage = can('library.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Book | null>(null);
    const form = useForm(blank);

    const openForm = (b: Book | null) => {
        setEditing(b);
        form.clearErrors();
        form.setData(
            b
                ? { title: b.title, author: b.author ?? '', isbn: b.isbn ?? '', publisher: b.publisher ?? '', category: b.category ?? '', shelf: b.shelf ?? '', copies_total: b.copies_total }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/library/books/${editing.id}`, opts);
        else form.post('/library/books', opts);
    };

    const columns: Column<Book>[] = [
        {
            key: 'title',
            header: 'Title',
            render: (b) => (
                <div className="flex items-center gap-3">
                    <span className={cn('h-10 w-2 shrink-0 rounded-sm', spineColors[b.id % spineColors.length])} />
                    <div>
                        <div className="font-bold text-black dark:text-white-light">{b.title}</div>
                        <div className="text-xs text-white-dark">
                            {b.author ?? 'Unknown author'}
                            {b.publisher ? ` · ${b.publisher}` : ''}
                        </div>
                    </div>
                </div>
            ),
        },
        { key: 'isbn', header: 'ISBN', render: (b) => <span className="font-mono text-xs">{b.isbn ?? '—'}</span> },
        { key: 'category', header: 'Category', render: (b) => (b.category ? <span className="badge badge-soft-primary">{b.category}</span> : '—') },
        { key: 'shelf', header: 'Shelf', render: (b) => b.shelf ?? '—' },
        {
            key: 'copies',
            header: 'Available',
            align: 'center',
            render: (b) => (
                <span className={cn('badge', b.copies_available === 0 ? 'badge-soft-danger' : b.copies_available <= 1 ? 'badge-soft-warning' : 'badge-soft-success')}>
                    {b.copies_available} / {b.copies_total}
                </span>
            ),
        },
        { key: 'borrowed', header: 'Loans', align: 'right', render: (b) => num(b.times_borrowed) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (b) => (manage ? <RowActions onEdit={() => openForm(b)} destroy={`/library/books/${b.id}`} label="book" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Library Catalogue"
                subtitle="Textbooks, literature and reference titles with copies and shelf locations."
                breadcrumbs={[{ title: 'Library' }, { title: 'Books' }]}
                actions={
                    <>
                        {can('library.manage') && <ImportButton type="books" label="Import books" />}
                        {<>
                        <button
                            className="btn btn-outline-primary"
                            onClick={() =>
                                exportCsv('library-catalogue', [
                                    ['Title', 'Author', 'ISBN', 'Publisher', 'Category', 'Shelf', 'Copies', 'Available'],
                                    ...books.data.map((b) => [b.title, b.author, b.isbn, b.publisher, b.category, b.shelf, b.copies_total, b.copies_available]),
                                ])
                            }
                        >
                            Export page
                        </button>
                        <Link href="/library/loans" className="btn btn-outline-primary">
                            <BookOpen className="h-4 w-4" /> Loans desk
                        </Link>
                        {manage && (
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> Add book
                            </button>
                        )}
                    </>}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Titles" value={num(stats.titles)} icon={Library} tone="primary" />
                <StatCard title="Copies" value={num(stats.copies)} icon={BookCopy} tone="info" hint={`${num(stats.available)} on the shelf`} />
                <StatCard title="On loan" value={num(stats.on_loan)} icon={BookOpen} tone="success" />
                <StatCard title="Overdue" value={num(stats.overdue)} icon={AlertTriangle} tone={stats.overdue ? 'danger' : 'success'} hint={stats.overdue ? <Link href="/library/loans?status=overdue" className="text-danger hover:underline">View overdue loans</Link> : 'All on time'} />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search title, author, ISBN, shelf…" className="sm:w-80" />
                    <FilterSelect value={filters.category} onChange={(v) => setFilter('category', v)} options={categories} placeholder="All categories" />
                    <FilterSelect
                        value={filters.availability}
                        onChange={(v) => setFilter('availability', v)}
                        options={[
                            { value: 'available', label: 'Available' },
                            { value: 'out', label: 'All copies out' },
                        ]}
                        placeholder="Any availability"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={books} empty="No books found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit book' : 'Add book'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <Input label="Title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={form.errors.title} />
                    <FormGrid>
                        <Input label="Author" value={form.data.author} onChange={(e) => form.setData('author', e.target.value)} error={form.errors.author} />
                        <Input label="ISBN" value={form.data.isbn} onChange={(e) => form.setData('isbn', e.target.value)} error={form.errors.isbn} />
                        <Input label="Publisher" value={form.data.publisher} onChange={(e) => form.setData('publisher', e.target.value)} error={form.errors.publisher} />
                        <Select label="Category" placeholder="— Select —" options={categories} value={form.data.category} onChange={(e) => form.setData('category', e.target.value)} error={form.errors.category} />
                        <Input label="Shelf location" value={form.data.shelf} onChange={(e) => form.setData('shelf', e.target.value)} error={form.errors.shelf} placeholder="e.g. A3" />
                        <Input
                            label="Total copies"
                            type="number"
                            min={1}
                            required
                            value={form.data.copies_total}
                            onChange={(e) => form.setData('copies_total', e.target.value)}
                            error={form.errors.copies_total}
                            help={editing ? `${editing.on_loan} currently on loan` : undefined}
                        />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save book
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
