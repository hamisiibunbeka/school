import { Link, router, useForm } from '@inertiajs/react';
import { Ban, CalendarCheck, CalendarDays, Check, ClipboardList, Download, Hourglass, Plane, Plus, Scale, Tags, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, dateTime, exportCsv, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { LeaveModal, type LeaveBalance } from './_components/leave-modal';

type Request = {
    id: number;
    employee_id: number;
    employee: string;
    employee_no: string;
    designation: string | null;
    type: string;
    is_paid: boolean;
    start_date: string;
    end_date: string;
    days: number;
    reason: string | null;
    status: string;
    approver: string | null;
    approved_at: string | null;
    decision_note: string | null;
    created_at: string;
    is_own: boolean;
};

type LeaveTypeRow = { id: number; name: string; days_per_year: number; is_paid: boolean; used_count: number };
type BalanceRow = { id: number; name: string; employee_no: string; designation: string | null; types: LeaveBalance[] };

type Props = {
    requests: Paginated<Request>;
    filters: { search: string; status: string; type: string; employee: string; month: string };
    stats: { pending: number; on_leave_today: number; approved_this_month: number; days_taken: number };
    balances: BalanceRow[];
    leaveTypes: LeaveTypeRow[];
    typeOptions: Option[];
    employees: Option[];
    statuses: Option[];
    ownEmployeeId: number | null;
    year: number;
};

export default function Leave({ requests, filters: initial, stats, balances, leaveTypes, typeOptions, employees, statuses, ownEmployeeId, year }: Props) {
    const can = useCan();
    const { filters, setFilter, reset } = useFilters(initial);
    const [tab, setTab] = useState('requests');
    const [applyOpen, setApplyOpen] = useState(false);
    const [balanceSearch, setBalanceSearch] = useState('');
    const [typeOpen, setTypeOpen] = useState(false);
    const [editingType, setEditingType] = useState<LeaveTypeRow | null>(null);
    const typeForm = useForm({ name: '', days_per_year: '0', is_paid: true });

    const balanceMap = useMemo(() => Object.fromEntries(balances.map((b) => [b.id, b.types])), [balances]);
    const filteredBalances = balances.filter((b) => !balanceSearch || `${b.name} ${b.employee_no}`.toLowerCase().includes(balanceSearch.toLowerCase()));

    const decide = async (r: Request, action: 'approve' | 'reject') => {
        const res = await confirm({
            title: action === 'approve' ? `Approve ${r.days} day(s) for ${r.employee}?` : `Reject leave for ${r.employee}?`,
            text: `${r.type} · ${date(r.start_date)} → ${date(r.end_date)}`,
            confirmText: action === 'approve' ? 'Approve' : 'Reject',
            danger: action === 'reject',
            input: action === 'reject' ? 'textarea' : undefined,
            inputPlaceholder: 'Reason for rejection',
        });
        if (res.confirmed) router.post(`/hr/leave/${r.id}/${action}`, { note: res.value ?? '' }, { preserveScroll: true });
    };

    const cancel = async (r: Request) => {
        const { confirmed } = await confirm({ title: 'Cancel this leave request?', danger: true, confirmText: 'Cancel request' });
        if (confirmed) router.post(`/hr/leave/${r.id}/cancel`, {}, { preserveScroll: true });
    };

    const openType = (t: LeaveTypeRow | null) => {
        setEditingType(t);
        typeForm.clearErrors();
        typeForm.setData({ name: t?.name ?? '', days_per_year: String(t?.days_per_year ?? 0), is_paid: t?.is_paid ?? true });
        setTypeOpen(true);
    };

    const submitType = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setTypeOpen(false) };
        if (editingType) typeForm.put(`/hr/leave-types/${editingType.id}`, opts);
        else typeForm.post('/hr/leave-types', opts);
    };

    const columns: Column<Request>[] = [
        {
            key: 'employee',
            header: 'Employee',
            render: (r) => (
                <div className="flex items-center gap-3">
                    <Avatar name={r.employee} />
                    <div>
                        <Link href={`/hr/employees/${r.employee_id}`} className="font-bold text-black hover:text-primary dark:text-white-light">
                            {r.employee}
                        </Link>
                        <div className="text-xs text-white-dark">{r.designation ?? r.employee_no}</div>
                    </div>
                </div>
            ),
        },
        {
            key: 'type',
            header: 'Type',
            render: (r) => (
                <div>
                    <div className="font-semibold">{r.type}</div>
                    {!r.is_paid && <span className="badge badge-soft-danger">Unpaid</span>}
                </div>
            ),
        },
        {
            key: 'dates',
            header: 'Dates',
            render: (r) => (
                <div className="whitespace-nowrap">
                    {date(r.start_date)} → {date(r.end_date)}
                    <div className="text-xs text-white-dark">Applied {dateTime(r.created_at)}</div>
                </div>
            ),
        },
        { key: 'days', header: 'Days', align: 'center', render: (r) => <span className="font-bold">{r.days}</span> },
        { key: 'reason', header: 'Reason', render: (r) => <div className="max-w-[220px] text-sm">{r.reason ?? '—'}</div> },
        {
            key: 'status',
            header: 'Status',
            render: (r) => (
                <div>
                    <StatusBadge status={r.status} />
                    {r.approver && (
                        <div className="mt-1 text-xs text-white-dark" title={r.decision_note ?? ''}>
                            by {r.approver}
                            {r.decision_note && <div className="max-w-[180px] truncate italic">“{r.decision_note}”</div>}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
                <div className="flex items-center justify-end gap-1">
                    {r.status === 'pending' && can('hr.manage') && !r.is_own && (
                        <>
                            <IconButton icon={Check} title="Approve" className="text-success" onClick={() => decide(r, 'approve')} />
                            <IconButton icon={X} title="Reject" className="text-danger" onClick={() => decide(r, 'reject')} />
                        </>
                    )}
                    {(r.status === 'pending' || (r.status === 'approved' && can('hr.manage'))) && (r.is_own || can('hr.manage')) && (
                        <IconButton icon={Ban} title="Cancel request" className="text-white-dark" onClick={() => cancel(r)} />
                    )}
                </div>
            ),
        },
    ];

    const exportBalances = () =>
        exportCsv(`leave-balances-${year}`, [
            ['Employee No', 'Employee', ...leaveTypes.flatMap((t) => [`${t.name} entitled`, `${t.name} used`, `${t.name} remaining`])],
            ...balances.map((b) => [b.employee_no, b.name, ...b.types.flatMap((t) => [t.entitled, t.used, t.remaining])]),
        ]);

    const tabs = [
        { key: 'requests', label: 'Requests', icon: ClipboardList, count: requests.total },
        { key: 'balances', label: `Balances ${year}`, icon: Scale },
        { key: 'types', label: 'Leave types', icon: Tags, count: leaveTypes.length },
    ];

    return (
        <>
            <PageHeader
                title="Leave Management"
                subtitle="Applications, approvals and entitlement balances."
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Leave' }]}
                actions={
                    (can('hr.manage') || ownEmployeeId) && (
                        <button className="btn btn-primary" onClick={() => setApplyOpen(true)}>
                            <Plus className="h-4 w-4" /> Apply for leave
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <button type="button" className="text-start" onClick={() => (setTab('requests'), setFilter('status', 'pending'))}>
                    <StatCard title="Pending approval" value={num(stats.pending)} icon={Hourglass} tone="warning" hint="Click to filter" />
                </button>
                <StatCard title="On leave today" value={num(stats.on_leave_today)} icon={Plane} tone="info" />
                <StatCard title="Approved this month" value={num(stats.approved_this_month)} icon={CalendarCheck} tone="success" />
                <StatCard title={`Days taken ${year}`} value={num(stats.days_taken)} icon={CalendarDays} tone="primary" hint="Approved working days" />
            </div>

            <Tabs tabs={tabs} active={tab} onChange={setTab} />

            {tab === 'requests' && (
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
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search employee…" />
                        <FilterSelect value={filters.status} onChange={(v) => setFilter('status', v)} options={statuses} placeholder="Any status" />
                        <FilterSelect value={filters.type} onChange={(v) => setFilter('type', v)} options={typeOptions} placeholder="All leave types" />
                        <input type="month" className="form-input w-full sm:w-auto" value={filters.month} onChange={(e) => setFilter('month', e.target.value)} title="Starting month" />
                    </FilterBar>
                    <DataTable columns={columns} paginated={requests} empty="No leave requests found" emptyDescription="Try clearing filters or submit a new application." />
                </div>
            )}

            {tab === 'balances' && (
                <div className="panel">
                    <FilterBar
                        actions={
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={exportBalances}>
                                <Download className="h-4 w-4" /> Export CSV
                            </button>
                        }
                    >
                        <SearchInput value={balanceSearch} onChange={setBalanceSearch} placeholder="Search employee…" />
                    </FilterBar>
                    <div className="table-responsive">
                        <table className="table-compact table">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    {leaveTypes.map((t) => (
                                        <th key={t.id} className="text-center!">
                                            {t.name}
                                            <div className="text-[10px] font-normal text-white-dark">{t.days_per_year} days/yr</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBalances.map((b) => (
                                    <tr key={b.id}>
                                        <td>
                                            <Link href={`/hr/employees/${b.id}`} className="font-semibold hover:text-primary">
                                                {b.name}
                                            </Link>
                                            <div className="text-xs text-white-dark">{b.designation}</div>
                                        </td>
                                        {b.types.map((t) => (
                                            <td key={t.type_id} className="text-center!">
                                                <span className={`font-bold ${t.entitled && t.remaining === 0 ? 'text-danger' : t.used > 0 ? 'text-primary' : ''}`}>{t.remaining}</span>
                                                <span className="text-xs text-white-dark"> / {t.entitled}</span>
                                                {t.pending > 0 && <div className="text-[10px] text-warning">{t.pending} pending</div>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {filteredBalances.length === 0 && (
                                    <tr>
                                        <td colSpan={leaveTypes.length + 1} className="text-center! text-white-dark">
                                            No employees found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-xs text-white-dark">Remaining = annual entitlement − approved days in {year}. Pending requests are shown separately.</p>
                </div>
            )}

            {tab === 'types' && (
                <div className="panel">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Leave types</h5>
                        {can('hr.manage') && (
                            <button className="btn btn-primary btn-sm" onClick={() => openType(null)}>
                                <Plus className="h-4 w-4" /> Add leave type
                            </button>
                        )}
                    </div>
                    <DataTable
                        rows={leaveTypes}
                        empty="No leave types configured"
                        columns={[
                            { key: 'name', header: 'Name', render: (t) => <span className="font-semibold">{t.name}</span> },
                            { key: 'days_per_year', header: 'Days per year', align: 'center' },
                            { key: 'is_paid', header: 'Pay', render: (t) => (t.is_paid ? <span className="badge badge-soft-success">Paid</span> : <span className="badge badge-soft-danger">Unpaid</span>) },
                            { key: 'used_count', header: `Approved requests ${year}`, align: 'center' },
                            {
                                key: 'actions',
                                header: '',
                                align: 'right',
                                render: (t) => (can('hr.manage') ? <RowActions onEdit={() => openType(t)} destroy={`/hr/leave-types/${t.id}`} label="leave type" /> : null),
                            },
                        ]}
                    />
                    <p className="mt-3 text-xs text-white-dark">Unpaid leave days are deducted pro-rata from basic pay in the payroll run for that month.</p>
                </div>
            )}

            <LeaveModal
                open={applyOpen}
                onClose={() => setApplyOpen(false)}
                employees={can('hr.manage') ? employees : employees.filter((e) => Number(e.value) === ownEmployeeId)}
                leaveTypes={typeOptions}
                defaultEmployeeId={can('hr.manage') ? null : ownEmployeeId}
                balances={(id) => balanceMap[id]}
            />

            <Modal open={typeOpen} onClose={() => setTypeOpen(false)} title={editingType ? 'Edit leave type' : 'Add leave type'}>
                <form onSubmit={submitType} className="space-y-4">
                    <FormGrid>
                        <Input label="Name" required value={typeForm.data.name} onChange={(e) => typeForm.setData('name', e.target.value)} error={typeForm.errors.name} placeholder="e.g. Study Leave" />
                        <Input label="Days per year" type="number" min={0} max={365} required value={typeForm.data.days_per_year} onChange={(e) => typeForm.setData('days_per_year', e.target.value)} error={typeForm.errors.days_per_year} />
                    </FormGrid>
                    <Checkbox label="Paid leave" checked={typeForm.data.is_paid} onChange={(e) => typeForm.setData('is_paid', e.target.checked)} />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setTypeOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={typeForm.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
