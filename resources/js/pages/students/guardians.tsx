import { Link, useForm } from '@inertiajs/react';
import { KeyRound, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import type { Paginated } from '@/types';
import ImportButton from '@/components/ui/import-button';

type Guardian = {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
    gender: string | null;
    phone: string;
    alt_phone: string | null;
    email: string | null;
    occupation: string | null;
    national_id: string | null;
    address: string | null;
    preferred_channel: string;
    user_id: number | null;
    students_count: number;
    students: { id: number; first_name: string; last_name: string; admission_no: string }[];
    matched_student_ids: number[];
};

const blank = { first_name: '', last_name: '', gender: '', phone: '', alt_phone: '', email: '', occupation: '', national_id: '', address: '', preferred_channel: 'sms' };

export default function Guardians({ guardians, filters: initial }: { guardians: Paginated<Guardian>; filters: { search: string } }) {
    const can = useCan();
    const { filters, setFilter } = useFilters(initial);
    const [editing, setEditing] = useState<Guardian | null>(null);
    const [open, setOpen] = useState(false);
    const [portalFor, setPortalFor] = useState<Guardian | null>(null);
    const form = useForm(blank);
    const portal = useForm({ email: '' });

    const openForm = (g: Guardian | null) => {
        setEditing(g);
        form.clearErrors();
        form.setData(
            g
                ? {
                      first_name: g.first_name,
                      last_name: g.last_name,
                      gender: g.gender ?? '',
                      phone: g.phone,
                      alt_phone: g.alt_phone ?? '',
                      email: g.email ?? '',
                      occupation: g.occupation ?? '',
                      national_id: g.national_id ?? '',
                      address: g.address ?? '',
                      preferred_channel: g.preferred_channel,
                  }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/guardians/${editing.id}`, opts);
        else form.post('/guardians', opts);
    };

    const columns: Column<Guardian>[] = [
        {
            key: 'name',
            header: 'Guardian',
            render: (g) => (
                <div className="flex items-center gap-3">
                    <Avatar name={g.full_name} />
                    <div>
                        <div className="font-bold">{g.full_name}</div>
                        <div className="text-xs text-white-dark">{g.occupation ?? '—'}</div>
                    </div>
                </div>
            ),
        },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email', render: (g) => g.email ?? '—' },
        {
            key: 'students',
            header: 'Children',
            render: (g) => (
                <div className="flex flex-wrap gap-1">
                    {g.students.map((s) => (
                        <Link
                            key={s.id}
                            href={`/students/${s.id}`}
                            title={s.admission_no}
                            className={`badge hover:underline ${g.matched_student_ids.includes(s.id) ? 'badge-primary' : 'badge-soft-primary'}`}
                        >
                            {s.first_name} {s.last_name}
                        </Link>
                    ))}
                    {g.students.length === 0 && <span className="text-white-dark">—</span>}
                </div>
            ),
        },
        { key: 'portal', header: 'Portal', render: (g) => (g.user_id ? <span className="badge badge-soft-success">Active</span> : <span className="badge badge-soft-dark">None</span>) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (g) =>
                can('students.manage') ? (
                    <RowActions onEdit={() => openForm(g)} destroy={`/guardians/${g.id}`} label="guardian">
                        <IconButton
                            icon={KeyRound}
                            title="Parent portal access"
                            className="text-success"
                            onClick={() => {
                                portal.setData('email', g.email ?? '');
                                setPortalFor(g);
                            }}
                        />
                    </RowActions>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Parents & Guardians"
                subtitle="Contacts, linked children and parent-portal access."
                breadcrumbs={[{ title: 'Students', href: '/students' }, { title: 'Guardians' }]}
                actions={
                    <>
                        {can('students.manage') && <ImportButton type="guardians" label="Import guardians" />}
                        {can('students.manage') && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Add guardian
                        </button>
                    )}
                    </>
                }
            />
            <div className="panel">
                <FilterBar>
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search guardian or student: name, phone, email, admission no…" />
                </FilterBar>
                <DataTable columns={columns} paginated={guardians} empty="No guardians found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit guardian' : 'Add guardian'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="First name" required value={form.data.first_name} onChange={(e) => form.setData('first_name', e.target.value)} error={form.errors.first_name} />
                        <Input label="Last name" required value={form.data.last_name} onChange={(e) => form.setData('last_name', e.target.value)} error={form.errors.last_name} />
                        <Input label="Phone" required value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        <Input label="Alternative phone" value={form.data.alt_phone} onChange={(e) => form.setData('alt_phone', e.target.value)} />
                        <Input label="Email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                        <Input label="Occupation" value={form.data.occupation} onChange={(e) => form.setData('occupation', e.target.value)} />
                        <Input label="National ID (NIDA)" value={form.data.national_id} onChange={(e) => form.setData('national_id', e.target.value)} />
                        <Select
                            label="Preferred channel"
                            value={form.data.preferred_channel}
                            onChange={(e) => form.setData('preferred_channel', e.target.value)}
                            options={[
                                { value: 'sms', label: 'SMS' },
                                { value: 'email', label: 'Email' },
                                { value: 'whatsapp', label: 'WhatsApp' },
                            ]}
                        />
                        <Input label="Address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} wrapperClassName="sm:col-span-2" />
                    </FormGrid>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save guardian
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!portalFor} onClose={() => setPortalFor(null)} title="Parent portal access">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        portal.post(`/guardians/${portalFor?.id}/portal-access`, { preserveScroll: true, onSuccess: () => setPortalFor(null) });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm text-white-dark">
                        Create or reset a login for <strong className="text-black dark:text-white-light">{portalFor?.full_name}</strong>. They will only see their own linked children. A temporary password is shown once after
                        saving.
                    </p>
                    <Input label="Login email" type="email" required value={portal.data.email} onChange={(e) => portal.setData('email', e.target.value)} error={portal.errors.email} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setPortalFor(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-success" disabled={portal.processing}>
                            Issue access
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
