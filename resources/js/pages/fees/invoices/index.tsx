import { Link, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Download, FilePlus2, FileStack, LoaderCircle, Receipt, Wallet, Clock } from 'lucide-react';
import { useState } from 'react';
import { IconLink, RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { GradientStatCard } from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cleanQuery, cn, date, money, num, today } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { PaidBar } from '../_components/shared';

type Row = {
    id: number;
    invoice_no: string;
    student_id: number;
    student: string | null;
    photo_url: string | null;
    admission_no: string | null;
    class: string;
    term: string | null;
    issue_date: string;
    due_date: string | null;
    total: string;
    paid: string;
    balance: string;
    status: string;
    overdue: boolean;
};

type Preview = {
    students: number;
    to_invoice: number;
    skipped: number;
    subtotal: string;
    discount: string;
    total: string;
    by_class: { class: string; students: number; skipped: number; invoices: number; total: string; has_structure: boolean }[];
    missing: string[];
};

type Props = {
    invoices: Paginated<Row>;
    filters: { search: string; status: string; class: string; term: string; overdue: string };
    stats: { count: number; billed: string; paid: string; outstanding: string; discount: string; overdue: number; rate: number | null };
    classes: Option[];
    terms: (Option & { is_current: boolean })[];
    currentTermId: number | null;
    statuses: Option[];
};

export default function InvoicesIndex({ invoices, filters: initial, stats, classes, terms, currentTermId, statuses }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter, reset } = useFilters(initial);
    const [batchOpen, setBatchOpen] = useState(false);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(false);
    const batch = useForm({ term_id: String(currentTermId ?? ''), class_ids: [] as number[], issue_date: today(), due_date: '', notes: '' });

    const resetPreview = () => setPreview(null);

    const runPreview = async () => {
        if (!batch.data.term_id || batch.data.class_ids.length === 0) {
            batch.setError('class_ids', 'Choose a term and at least one class.');
            return;
        }
        batch.clearErrors();
        setLoading(true);
        try {
            const params = new URLSearchParams({ term_id: batch.data.term_id });
            batch.data.class_ids.forEach((id) => params.append('class_ids[]', String(id)));
            const res = await fetch(`/fees/invoices/preview?${params}`, { headers: { Accept: 'application/json' } });
            if (!res.ok) {
                batch.setError('class_ids', 'Could not build the preview. Check the term and classes.');
                return;
            }
            setPreview((await res.json()) as Preview);
        } finally {
            setLoading(false);
        }
    };

    const confirmGenerate = async () => {
        if (!preview) return;
        const { confirmed } = await confirm({
            title: `Issue ${num(preview.to_invoice)} invoices?`,
            text: `Total ${money(preview.total, cur)} will be billed and posted to the ledger (Dr 1300 Fees Receivable / Cr fee income).`,
            confirmText: 'Generate & post',
        });
        if (!confirmed) return;
        batch.post('/fees/invoices/generate', {
            preserveScroll: true,
            onSuccess: () => {
                setBatchOpen(false);
                setPreview(null);
            },
        });
    };

    const columns: Column<Row>[] = [
        {
            key: 'invoice',
            header: 'Invoice',
            render: (i) => (
                <div>
                    <Link href={`/fees/invoices/${i.id}`} className="font-bold text-primary hover:underline">
                        {i.invoice_no}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {date(i.issue_date)}
                        {i.term && ` · ${i.term}`}
                    </div>
                </div>
            ),
        },
        {
            key: 'student',
            header: 'Student',
            render: (i) => (
                <div className="flex items-center gap-3">
                    <Avatar name={i.student} src={i.photo_url} />
                    <div>
                        <Link href={`/fees/statements/${i.student_id}`} className="font-semibold text-black hover:text-primary dark:text-white-light">
                            {i.student}
                        </Link>
                        <div className="text-xs text-white-dark">
                            {i.admission_no} · {i.class || '—'}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'due',
            header: 'Due',
            render: (i) => (
                <span className={cn(i.overdue && 'font-semibold text-danger')}>
                    {date(i.due_date)}
                    {i.overdue && <span className="badge badge-soft-danger ms-1">Overdue</span>}
                </span>
            ),
        },
        { key: 'total', header: 'Total', align: 'right', render: (i) => money(i.total, cur) },
        { key: 'progress', header: 'Paid', className: 'min-w-[130px]', render: (i) => (i.status === 'cancelled' ? '—' : <PaidBar paid={i.paid} total={i.total} />) },
        { key: 'balance', header: 'Balance', align: 'right', render: (i) => <span className={cn('font-bold', Number(i.balance) > 0 ? 'text-danger' : 'text-success')}>{money(i.balance, cur)}</span> },
        { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) => (
                <RowActions view={`/fees/invoices/${i.id}`}>
                    {can('fees.manage') && Number(i.balance) > 0 && <IconLink href={`/fees/payments/create?student=${i.student_id}`} icon={Wallet} title="Collect payment" className="text-success" />}
                </RowActions>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Fee Invoices"
                subtitle="Bills issued to students. Every invoice is posted to Student Fees Receivable."
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Invoices' }]}
                actions={
                    <>
                        <a href={`/fees/invoices/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        {can('fees.manage') && (
                            <>
                                <Link href="/fees/invoices/create" className="btn btn-outline-secondary">
                                    <FilePlus2 className="h-4 w-4" /> Manual invoice
                                </Link>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setPreview(null);
                                        setBatchOpen(true);
                                    }}
                                >
                                    <FileStack className="h-4 w-4" /> Generate for term
                                </button>
                            </>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                <GradientStatCard title="Total Billed" value={money(stats.billed, cur)} icon={Receipt} color="primary" footer={`${num(stats.count)} invoices · ${money(stats.discount, cur)} discounts`} />
                <GradientStatCard title="Collected" value={money(stats.paid, cur)} icon={CheckCircle2} color="success" footer={`${stats.rate ?? 0}% collection rate`} />
                <GradientStatCard title="Outstanding" value={money(stats.outstanding, cur)} icon={Wallet} color="fuchsia" footer="Balance still receivable" />
                <GradientStatCard title="Overdue Invoices" value={num(stats.overdue)} icon={Clock} color="warning" footer="Past due date with a balance" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Invoice no, student or adm. no…" />
                    <FilterSelect value={filters.term} onChange={(v) => setFilter('term', v)} options={terms} placeholder="All terms" />
                    <FilterSelect value={filters.class} onChange={(v) => setFilter('class', v)} options={classes} placeholder="All classes" />
                    <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={[{ value: 'open', label: 'Open (unpaid + partial)' }, ...statuses]} placeholder="Any status" />
                    <FilterSelect value={filters.overdue} onChange={(v) => setFilter('overdue', v)} options={[{ value: '1', label: 'Overdue only' }]} placeholder="Due & overdue" />
                </FilterBar>
                <DataTable columns={columns} paginated={invoices} empty="No invoices found" emptyDescription="Generate invoices for a term from the fee structures, or raise a manual invoice." />
            </div>

            <Modal open={batchOpen} onClose={() => setBatchOpen(false)} title="Generate invoices from fee structures" size="xl">
                <div className="space-y-5">
                    <FormGrid cols={3}>
                        <Select
                            label="Term"
                            required
                            value={batch.data.term_id}
                            onChange={(e) => {
                                batch.setData('term_id', e.target.value);
                                resetPreview();
                            }}
                            options={terms.map((t) => ({ value: t.value, label: `${t.label}${t.is_current ? ' (current)' : ''}` }))}
                            placeholder="Select term"
                            error={batch.errors.term_id}
                        />
                        <Input label="Issue date" type="date" required value={batch.data.issue_date} onChange={(e) => batch.setData('issue_date', e.target.value)} error={batch.errors.issue_date} />
                        <Input
                            label="Due date"
                            type="date"
                            value={batch.data.due_date}
                            onChange={(e) => batch.setData('due_date', e.target.value)}
                            error={batch.errors.due_date}
                            help="Leave blank to use the structure due dates."
                        />
                    </FormGrid>
                    <Field label="Classes" required error={batch.errors.class_ids}>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => {
                                    batch.setData('class_ids', batch.data.class_ids.length === classes.length ? [] : classes.map((c) => Number(c.value)));
                                    resetPreview();
                                }}
                            >
                                {batch.data.class_ids.length === classes.length ? 'Clear' : 'All classes'}
                            </button>
                            {classes.map((c) => {
                                const on = batch.data.class_ids.includes(Number(c.value));
                                return (
                                    <button
                                        key={c.value}
                                        type="button"
                                        className={cn('btn btn-sm', on ? 'btn-primary' : 'btn-outline-dark')}
                                        onClick={() => {
                                            batch.setData('class_ids', on ? batch.data.class_ids.filter((x) => x !== Number(c.value)) : [...batch.data.class_ids, Number(c.value)]);
                                            resetPreview();
                                        }}
                                    >
                                        {c.label}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>
                    <Input label="Note on invoices" value={batch.data.notes} onChange={(e) => batch.setData('notes', e.target.value)} placeholder="e.g. Term II fees — pay by the due date" />

                    {preview && (
                        <div className="rounded-md border border-white-light p-4 dark:border-[#1b2e4b]">
                            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Active students</div>
                                    <div className="text-xl font-extrabold">{num(preview.students)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Invoices to issue</div>
                                    <div className="text-xl font-extrabold text-primary">{num(preview.to_invoice)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Already invoiced (skipped)</div>
                                    <div className="text-xl font-extrabold text-warning">{num(preview.skipped)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white-dark uppercase">Total to bill</div>
                                    <div className="text-xl font-extrabold text-success">{money(preview.total, cur)}</div>
                                    {Number(preview.discount) > 0 && <div className="text-xs text-white-dark">after {money(preview.discount, cur)} discounts</div>}
                                </div>
                            </div>
                            {preview.missing.length > 0 && (
                                <div className="mb-3 flex items-center gap-2 rounded bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                                    <AlertTriangle className="h-4 w-4 shrink-0" /> No fee structure for: {preview.missing.join(', ')}. Those classes will not be billed.
                                </div>
                            )}
                            <div className="table-responsive">
                                <table className="table-compact table">
                                    <thead>
                                        <tr>
                                            <th>Class</th>
                                            <th className="text-end!">Students</th>
                                            <th className="text-end!">Skipped</th>
                                            <th className="text-end!">To invoice</th>
                                            <th className="text-end!">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.by_class.map((c) => (
                                            <tr key={c.class}>
                                                <td className="font-semibold">{c.class}</td>
                                                <td className="text-end!">{num(c.students)}</td>
                                                <td className="text-end!">{num(c.skipped)}</td>
                                                <td className="text-end!">{num(c.invoices)}</td>
                                                <td className="text-end! font-bold">{money(c.total, cur)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setBatchOpen(false)}>
                            Cancel
                        </button>
                        <button type="button" className="btn btn-outline-primary" onClick={runPreview} disabled={loading}>
                            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />} Preview
                        </button>
                        <button type="button" className="btn btn-primary" disabled={!preview || preview.to_invoice === 0 || batch.processing} onClick={confirmGenerate}>
                            {batch.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                            <FileStack className="h-4 w-4" /> Generate {preview ? num(preview.to_invoice) : ''} invoices
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
