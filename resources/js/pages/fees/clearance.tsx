import { Link, router, useForm, usePage } from '@inertiajs/react';
import { AlarmClock, BadgeCheck, CalendarClock, CalendarX, Handshake, MessageSquareText, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, money, today } from '@/lib/utils';
import type { Paginated } from '@/types';
import DeferralModal, { type DeferralTarget } from './_components/deferral-modal';

type Step = { name: string; percent: string; due_date: string; amount: string; cumulative: string; met: boolean };
type Pending = {
    id: number;
    application_no: string;
    full_name: string;
    admission_no: string | null;
    student_id: number | null;
    class: string | null;
    residence_type: string;
    guardian_name: string;
    guardian_phone: string;
    admitted_at: string | null;
    invoice: { id: number; invoice_no: string } | null;
    required: string;
    paid: string;
    outstanding: string;
    ready: boolean;
    basis: string;
    schedule: Step[];
};
type Agreement = {
    id: number;
    student_id: number;
    full_name: string | null;
    admission_no: string | null;
    class: string | null;
    application: { id: number; application_no: string } | null;
    amount: string;
    paid: string;
    outstanding: string;
    due_date: string;
    days: number;
    reason: string;
    terms: string | null;
    requested_by: string | null;
    status: string;
    authorizer: string | null;
    created_at: string | null;
    settled_at: string | null;
    closing_note: string | null;
};
type Props = {
    tab: 'pending' | 'agreements';
    filters: { search: string; status: string };
    pending: Pending[];
    agreements: Paginated<Agreement>;
    stats: { pending: number; ready: number; active: number; active_outstanding: string; overdue: number; overdue_outstanding: string };
};

const AGREEMENT_FILTERS = [
    { value: 'open', label: 'Open agreements' },
    { value: 'overdue', label: 'Overdue only' },
    { value: 'honoured', label: 'Honoured' },
    { value: 'defaulted', label: 'Defaulted' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'all', label: 'All agreements' },
];

export default function Clearance({ tab, filters: initial, pending, agreements, stats }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter } = useFilters({ ...initial, tab });
    const [deferring, setDeferring] = useState<DeferralTarget | null>(null);
    const [extending, setExtending] = useState<Agreement | null>(null);
    const extend = useForm({ due_date: '', amount: '', note: '' });
    const errors = usePage().props.errors as Record<string, string>;

    const verify = async (p: Pending) => {
        const { confirmed } = await confirm({
            title: `Clear ${p.full_name}?`,
            text: `${money(p.paid, cur)} received against ${money(p.required, cur)} required. The student is enrolled and appears in the student directory.`,
            confirmText: 'Verify & enrol',
        });
        if (confirmed) router.post(`/fees/clearance/${p.id}/verify`, {}, { preserveScroll: true });
    };

    const close = async (g: Agreement, status: 'defaulted' | 'cancelled') => {
        const { confirmed, value } = await confirm({
            title: status === 'defaulted' ? `Mark ${g.full_name}'s agreement as defaulted?` : `Cancel ${g.full_name}'s agreement?`,
            text: status === 'defaulted' ? 'Use this when the parent did not pay as agreed. The balance stays on the student account for normal arrears follow-up.' : 'Use this when the agreement no longer applies.',
            input: 'textarea',
            inputPlaceholder: 'Note (required)…',
            confirmText: status === 'defaulted' ? 'Mark defaulted' : 'Cancel agreement',
            danger: true,
        });
        if (confirmed && value) router.post(`/fees/agreements/${g.id}/close`, { status, note: value }, { preserveScroll: true });
    };

    const remind = async (g: Agreement) => {
        const { confirmed } = await confirm({ title: `Send a reminder SMS about ${g.full_name}?`, text: "The primary guardian receives the agreed amount and date.", confirmText: 'Queue SMS' });
        if (confirmed) router.post(`/fees/agreements/${g.id}/remind`, {}, { preserveScroll: true });
    };

    const openExtend = (g: Agreement) => {
        extend.clearErrors();
        extend.setData({ due_date: '', amount: String(Number(g.amount)), note: '' });
        setExtending(g);
    };

    const submitExtend = (e: FormEvent) => {
        e.preventDefault();
        if (!extending) return;
        extend.put(`/fees/agreements/${extending.id}`, { preserveScroll: true, onSuccess: () => setExtending(null) });
    };

    const pendingColumns: Column<Pending>[] = [
        {
            key: 'student',
            header: 'Admitted student',
            render: (p) => (
                <div>
                    <Link href={`/admissions/${p.id}`} className="font-semibold text-primary hover:underline">
                        {p.full_name}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {p.admission_no} · {p.class} · {p.residence_type === 'boarding' ? 'Boarder' : 'Day'}
                    </div>
                </div>
            ),
        },
        {
            key: 'guardian',
            header: 'Parent / guardian',
            render: (p) => (
                <div>
                    <div className="font-semibold">{p.guardian_name}</div>
                    <div className="text-xs text-white-dark">{p.guardian_phone}</div>
                </div>
            ),
        },
        {
            key: 'required',
            header: 'To clear',
            render: (p) => (
                <div>
                    <div className="font-bold">{money(p.required, cur)}</div>
                    <div className="max-w-[220px] truncate text-[11px] text-white-dark" title={p.basis}>
                        {p.basis}
                    </div>
                </div>
            ),
        },
        {
            key: 'paid',
            header: 'Paid',
            align: 'right',
            render: (p) => {
                const pct = Number(p.required) > 0 ? Math.min(100, (Number(p.paid) / Number(p.required)) * 100) : 100;
                return (
                    <div className="min-w-[130px]">
                        <div className={cn('font-bold', p.ready ? 'text-success' : 'text-black dark:text-white-light')}>{money(p.paid, cur)}</div>
                        <div className="mt-1 h-1.5 rounded-full bg-white-light dark:bg-[#1b2e4b]">
                            <div className={cn('h-1.5 rounded-full', p.ready ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
                        </div>
                        {!p.ready && <div className="mt-0.5 text-[11px] text-danger">{money(p.outstanding, cur)} short</div>}
                    </div>
                );
            },
        },
        { key: 'admitted', header: 'Admitted', render: (p) => date(p.admitted_at) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (p) => (
                <div className="flex flex-wrap justify-end gap-1.5">
                    {can('fees.manage') && p.student_id && !p.ready && (
                        <Link href={`/fees/payments/create?student=${p.student_id}`} className="btn btn-sm btn-outline-primary">
                            <Wallet className="h-3.5 w-3.5" /> Receive
                        </Link>
                    )}
                    {can('fees.manage') && (
                        <button className="btn btn-sm btn-success" disabled={!p.ready} onClick={() => verify(p)} title={p.ready ? 'Verify payment and enrol' : 'The required amount is not yet paid'}>
                            <BadgeCheck className="h-3.5 w-3.5" /> Verify
                        </button>
                    )}
                    {can('fees.defer') && !p.ready && (
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setDeferring({ id: p.id, full_name: p.full_name, guardian_name: p.guardian_name, outstanding: p.outstanding })}>
                            <Handshake className="h-3.5 w-3.5" /> Defer
                        </button>
                    )}
                </div>
            ),
        },
    ];

    const agreementColumns: Column<Agreement>[] = [
        {
            key: 'student',
            header: 'Student',
            render: (g) => (
                <div>
                    <Link href={`/fees/statements/${g.student_id}`} className="font-semibold text-primary hover:underline">
                        {g.full_name}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {g.admission_no} · {g.class}
                    </div>
                </div>
            ),
        },
        {
            key: 'reason',
            header: 'Agreement',
            render: (g) => (
                <div className="max-w-[280px] text-xs">
                    <div className="line-clamp-2 text-black dark:text-white-light" title={g.reason}>
                        “{g.reason}”
                    </div>
                    <div className="mt-0.5 text-white-dark">
                        {g.requested_by && `${g.requested_by} · `}authorized by {g.authorizer ?? '—'} on {date(g.created_at)}
                    </div>
                    {g.terms && <div className="mt-0.5 text-white-dark italic">Terms: {g.terms}</div>}
                    {g.closing_note && <div className="mt-0.5 text-danger">Closed: {g.closing_note}</div>}
                </div>
            ),
        },
        {
            key: 'amount',
            header: 'Agreed / paid',
            align: 'right',
            render: (g) => (
                <div>
                    <div className="font-bold">{money(g.amount, cur)}</div>
                    <div className={cn('text-xs', Number(g.outstanding) > 0 ? 'text-white-dark' : 'text-success')}>
                        paid {money(g.paid, cur)}
                        {Number(g.outstanding) > 0 && <span className="block text-danger">{money(g.outstanding, cur)} left</span>}
                    </div>
                </div>
            ),
        },
        {
            key: 'due',
            header: 'Agreed date',
            render: (g) => (
                <div>
                    <div className="font-semibold">{date(g.due_date)}</div>
                    {['active', 'overdue'].includes(g.status) && (
                        <div className={cn('text-xs', g.days < 0 ? 'text-danger' : g.days <= 3 ? 'text-warning' : 'text-white-dark')}>
                            {g.days < 0 ? `${-g.days} day(s) overdue` : g.days === 0 ? 'Due today' : `in ${g.days} day(s)`}
                        </div>
                    )}
                    {g.settled_at && <div className="text-xs text-white-dark">closed {date(g.settled_at)}</div>}
                </div>
            ),
        },
        { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (g) =>
                ['active', 'overdue'].includes(g.status) ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                        {can('fees.manage') && (
                            <>
                                <Link href={`/fees/payments/create?student=${g.student_id}`} className="btn btn-sm btn-outline-primary">
                                    <Wallet className="h-3.5 w-3.5" /> Receive
                                </Link>
                                <button className="btn btn-sm btn-outline-info" onClick={() => remind(g)} title="SMS the guardian">
                                    <MessageSquareText className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
                        {can('fees.defer') && (
                            <>
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => openExtend(g)} title="New agreed date">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                </button>
                                <button className="btn btn-sm btn-outline-danger" onClick={() => close(g, 'defaulted')} title="Parent did not pay as agreed">
                                    <CalendarX className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Admission Clearance"
                subtitle="Admitted students waiting for fees, and payment agreements under follow-up"
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Admission Clearance' }]}
                actions={
                    <Link href="/fees/installments" className="btn btn-outline-primary">
                        <CalendarClock className="h-4 w-4" /> Installment settings
                    </Link>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Awaiting fees" value={stats.pending} icon={Wallet} tone="warning" hint="Not yet in the student directory" />
                <StatCard title="Ready to verify" value={stats.ready} icon={BadgeCheck} tone="success" hint="Required amount received" />
                <StatCard title="Open agreements" value={stats.active} icon={Handshake} tone="secondary" hint={`${money(stats.active_outstanding, cur)} promised`} />
                <StatCard title="Overdue agreements" value={stats.overdue} icon={AlarmClock} tone="danger" hint={`${money(stats.overdue_outstanding, cur)} past the agreed date`} />
            </div>

            {(errors.clearance || errors.agreement) && <div className="mb-4 rounded-md bg-danger-light p-3 text-sm text-danger dark:bg-danger-dark-light">{errors.clearance || errors.agreement}</div>}

            <div className="panel">
                <Tabs
                    tabs={[
                        { key: 'pending', label: 'Awaiting fees', icon: Wallet, count: stats.pending },
                        { key: 'agreements', label: 'Payment agreements', icon: Handshake, count: stats.active },
                    ]}
                    active={filters.tab}
                    onChange={(k) => setFilter('tab', k as Props['tab'])}
                />
                <FilterBar>
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search student, admission or application no…" />
                    {filters.tab === 'agreements' && <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={AGREEMENT_FILTERS} placeholder="Open agreements" />}
                </FilterBar>

                {filters.tab === 'pending' ? (
                    pending.length === 0 ? (
                        <EmptyState title="Nobody is waiting for fee clearance" description="Students admitted from Admissions appear here until their first installment is verified or a deferral is authorized." />
                    ) : (
                        <DataTable columns={pendingColumns} rows={pending} />
                    )
                ) : (
                    <DataTable columns={agreementColumns} paginated={agreements} empty="No payment agreements" emptyDescription="Agreements are created when a head authorizes a parent's request to pay later." />
                )}
            </div>

            <DeferralModal target={deferring} onClose={() => setDeferring(null)} />

            <Modal open={!!extending} onClose={() => setExtending(null)} title={`New agreed date · ${extending?.full_name ?? ''}`}>
                <form onSubmit={submitExtend} className="space-y-5">
                    <p className="text-sm text-white-dark">
                        Currently {money(extending?.amount, cur)} by {date(extending?.due_date)}. Due-soon and overdue notices restart from the new date.
                    </p>
                    <FormGrid>
                        <Input label="New agreed date" type="date" min={today()} required value={extend.data.due_date} onChange={(e) => extend.setData('due_date', e.target.value)} error={extend.errors.due_date} />
                        <Input label={`Agreed amount (${cur})`} type="number" min={1} value={extend.data.amount} onChange={(e) => extend.setData('amount', e.target.value)} error={extend.errors.amount} />
                    </FormGrid>
                    <Input label="Reason for the change" required value={extend.data.note} onChange={(e) => extend.setData('note', e.target.value)} error={extend.errors.note} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setExtending(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={extend.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
