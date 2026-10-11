import { router, useForm } from '@inertiajs/react';
import { CalendarDays, CalendarRange, LogOut, Plus, UserCheck, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DeleteButton, IconButton } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { dateTime, num } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import SearchSelect from './_components/search-select';

type Visit = {
    id: number;
    visitor_name: string;
    phone: string | null;
    id_number: string | null;
    student: string | null;
    admission_no: string | null;
    purpose: string;
    check_in: string;
    check_out: string | null;
    recorded_by: string | null;
};
type Props = {
    visitors: Paginated<Visit>;
    filters: { search: string; status: string; date: string };
    students: Option[];
    stats: { on_premises: number; today: number; week: number; month: number };
};

const blank = { visitor_name: '', phone: '', id_number: '', student_id: '', purpose: '' };

export default function Visitors({ visitors, filters: initial, students, stats }: Props) {
    const can = useCan();
    const manage = can('boarding.manage');
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const form = useForm(blank);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/boarding/visitors', { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const checkOut = async (v: Visit) => {
        const { confirmed } = await confirm({ title: `Check out ${v.visitor_name}?`, confirmText: 'Check out' });
        if (confirmed) router.post(`/boarding/visitors/${v.id}/check-out`, {}, { preserveScroll: true });
    };

    const columns: Column<Visit>[] = [
        {
            key: 'visitor',
            header: 'Visitor',
            render: (v) => (
                <div className="flex items-center gap-3">
                    <Avatar name={v.visitor_name} />
                    <div>
                        <div className="font-bold text-black dark:text-white-light">{v.visitor_name}</div>
                        <div className="text-xs text-white-dark">
                            {v.phone ?? '—'}
                            {v.id_number ? ` · ID ${v.id_number}` : ''}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            key: 'student',
            header: 'Visiting',
            render: (v) =>
                v.student ? (
                    <div>
                        <div className="font-semibold">{v.student}</div>
                        <div className="text-xs text-white-dark">{v.admission_no}</div>
                    </div>
                ) : (
                    <span className="text-white-dark">Office / general</span>
                ),
        },
        { key: 'purpose', header: 'Purpose', render: (v) => <span className="line-clamp-2 max-w-[220px]">{v.purpose}</span> },
        { key: 'check_in', header: 'Checked in', render: (v) => dateTime(v.check_in) },
        {
            key: 'check_out',
            header: 'Checked out',
            render: (v) => (v.check_out ? dateTime(v.check_out) : <span className="badge badge-soft-success">On premises</span>),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (v) =>
                manage ? (
                    <div className="flex justify-end gap-1">
                        {!v.check_out && <IconButton icon={LogOut} title="Check out" className="text-warning" onClick={() => checkOut(v)} />}
                        <DeleteButton href={`/boarding/visitors/${v.id}`} label="visitor entry" />
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Visitor Log"
                subtitle="Check visitors in and out of the boarding premises."
                breadcrumbs={[{ title: 'Boarding', href: '/boarding/dormitories' }, { title: 'Visitors' }]}
                actions={
                    manage && (
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                form.reset();
                                form.clearErrors();
                                setOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" /> Check in visitor
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="On premises now" value={num(stats.on_premises)} icon={UserCheck} tone={stats.on_premises ? 'warning' : 'success'} />
                <StatCard title="Today" value={num(stats.today)} icon={Users} tone="primary" />
                <StatCard title="This week" value={num(stats.week)} icon={CalendarDays} tone="info" />
                <StatCard title="This month" value={num(stats.month)} icon={CalendarRange} tone="secondary" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search visitor, phone, student…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'in', label: 'On premises' },
                            { value: 'out', label: 'Checked out' },
                        ]}
                        placeholder="All visits"
                    />
                    <input type="date" className="form-input w-full sm:w-auto" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
                </FilterBar>
                <DataTable columns={columns} paginated={visitors} empty="No visitors recorded" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Check in visitor" size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Visitor name" required value={form.data.visitor_name} onChange={(e) => form.setData('visitor_name', e.target.value)} error={form.errors.visitor_name} />
                        <Input label="Phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        <Input label="ID / NIDA number" value={form.data.id_number} onChange={(e) => form.setData('id_number', e.target.value)} error={form.errors.id_number} />
                        <SearchSelect label="Student visited (optional)" options={students} value={form.data.student_id} onChange={(v) => form.setData('student_id', v)} error={form.errors.student_id} />
                    </FormGrid>
                    <Input label="Purpose of visit" required value={form.data.purpose} onChange={(e) => form.setData('purpose', e.target.value)} error={form.errors.purpose} placeholder="e.g. Visiting day, delivering supplies" />
                    <div className="flex justify-end gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Check in
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
