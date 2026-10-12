import { router, useForm, usePage } from '@inertiajs/react';
import { Copy, KeyRound, Pencil, Plus, Power, ShieldCheck, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm, toast } from '@/lib/swal';
import { dateTime, num } from '@/lib/utils';
import type { Paginated } from '@/types';

type Row = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    role_id: number | null;
    role: string | null;
    role_slug: string | null;
    is_portal: boolean;
    status: string;
    two_factor: boolean;
    last_login_at: string | null;
    created_at: string | null;
};
type RoleOption = { value: number; label: string; slug: string; is_portal: boolean };
type Props = {
    users: Paginated<Row>;
    filters: { search: string; role: string; status: string; type: string };
    roles: RoleOption[];
    credentials: { name: string; email: string; password: string } | null;
    limit: { max: number | null; used: number };
    stats: { total: number; active: number; disabled: number; portal: number };
};

const blank = { name: '', email: '', phone: '', role_id: '', allow_portal: false };

export default function UsersIndex({ users, filters: initial, roles, credentials, limit, stats }: Props) {
    const can = useCan();
    const manage = can('administration.manage');
    const me = usePage().props.auth.user;
    const { filters, setFilter, reset } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Row | null>(null);
    const [creds, setCreds] = useState(credentials);
    const form = useForm(blank);

    useEffect(() => setCreds(credentials), [credentials]);

    const roleOptions = roles.filter((r) => !r.is_portal || form.data.allow_portal || (editing && editing.role_id === r.value)).map((r) => ({ value: r.value, label: r.is_portal ? `${r.label} (portal)` : r.label }));

    const openForm = (u: Row | null) => {
        setEditing(u);
        form.clearErrors();
        form.setData(u ? { name: u.name, email: u.email, phone: u.phone ?? '', role_id: u.role_id ? String(u.role_id) : '', allow_portal: u.is_portal } : blank);
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/admin/users/${editing.id}`, opts);
        else form.post('/admin/users', opts);
    };

    const toggle = async (u: Row) => {
        const disabling = u.status === 'active';
        const { confirmed, value } = await confirm({
            title: disabling ? `Disable ${u.name}?` : `Enable ${u.name}?`,
            text: disabling ? 'They will be signed out and cannot log in until re-enabled. Give a reason for the audit trail.' : 'They will be able to sign in again.',
            confirmText: disabling ? 'Disable' : 'Enable',
            danger: disabling,
            input: disabling ? 'textarea' : undefined,
        });
        if (confirmed) router.post(`/admin/users/${u.id}/status`, { reason: value ?? '' }, { preserveScroll: true });
    };

    const resetPassword = async (u: Row) => {
        const { confirmed } = await confirm({ title: `Reset password for ${u.name}?`, text: 'A temporary password will be shown once. Their current password stops working immediately.', confirmText: 'Reset password', danger: true });
        if (confirmed) router.post(`/admin/users/${u.id}/reset-password`, {}, { preserveScroll: true });
    };

    const columns: Column<Row>[] = [
        {
            key: 'user',
            header: 'User',
            render: (u) => (
                <div className="flex items-center gap-3">
                    <Avatar name={u.name} src={u.avatar_url} />
                    <div>
                        <div className="font-bold">
                            {u.name} {u.id === me?.id && <span className="badge badge-soft-primary ms-1">You</span>}
                        </div>
                        <div className="text-xs text-white-dark">{u.email}</div>
                    </div>
                </div>
            ),
        },
        { key: 'phone', header: 'Phone', render: (u) => u.phone ?? '—' },
        {
            key: 'role',
            header: 'Role',
            render: (u) => (u.role ? <span className={`badge ${u.is_portal ? 'badge-soft-secondary' : 'badge-soft-primary'}`}>{u.role}</span> : <span className="text-white-dark">No role</span>),
        },
        { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} tone={u.status === 'disabled' ? 'danger' : undefined} /> },
        { key: '2fa', header: '2FA', align: 'center', render: (u) => (u.two_factor ? <ShieldCheck className="mx-auto h-4 w-4 text-success" /> : <span className="text-white-dark">—</span>) },
        { key: 'login', header: 'Last login', render: (u) => (u.last_login_at ? dateTime(u.last_login_at) : <span className="text-white-dark">Never</span>) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (u) =>
                manage ? (
                    <div className="flex justify-end gap-1">
                        <IconButton icon={Pencil} title="Edit" className="text-primary" onClick={() => openForm(u)} />
                        <IconButton icon={KeyRound} title="Reset password" className="text-warning" onClick={() => resetPassword(u)} />
                        {u.id !== me?.id && <IconButton icon={Power} title={u.status === 'active' ? 'Disable' : 'Enable'} className={u.status === 'active' ? 'text-danger' : 'text-success'} onClick={() => toggle(u)} />}
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Users"
                subtitle="Staff and portal accounts for this school. Every change is recorded in the audit trail."
                breadcrumbs={[{ title: 'Administration' }, { title: 'Users' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <UserPlus className="h-4 w-4" /> Add user
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="All users" value={num(stats.total)} icon={Users} tone="primary" hint={limit.max ? `${num(limit.used)} / ${num(limit.max)} staff seats used` : `${num(limit.used)} staff accounts`} />
                <StatCard title="Active" value={num(stats.active)} icon={UserCheck} tone="success" />
                <StatCard title="Disabled" value={num(stats.disabled)} icon={UserX} tone="danger" />
                <StatCard title="Parent / student portal" value={num(stats.portal)} icon={Plus} tone="secondary" />
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
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search name, email or phone…" />
                    <FilterSelect
                        value={filters.type}
                        onChange={(v) => setFilter('type', v)}
                        options={[
                            { value: 'staff', label: 'Staff accounts' },
                            { value: 'portal', label: 'Portal accounts' },
                        ]}
                        placeholder="Staff & portal"
                    />
                    <FilterSelect value={filters.role} onChange={(v) => setFilter('role', v)} options={roles.map((r) => ({ value: r.value, label: r.label }))} placeholder="All roles" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={[
                            { value: 'active', label: 'Active' },
                            { value: 'disabled', label: 'Disabled' },
                        ]}
                        placeholder="Any status"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={users} empty="No users found" />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'Add user'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Full name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                        <Input label="Email (login)" type="email" required value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                        <Input label="Phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        <Select
                            label="Role"
                            required
                            placeholder="Select role"
                            value={form.data.role_id}
                            onChange={(e) => form.setData('role_id', e.target.value)}
                            options={roleOptions}
                            error={form.errors.role_id}
                            disabled={!!editing && editing.id === me?.id}
                            help={editing && editing.id === me?.id ? 'You cannot change your own role.' : undefined}
                        />
                    </FormGrid>
                    <Checkbox
                        label="This is a parent/student portal account (show portal-only roles)"
                        checked={form.data.allow_portal}
                        onChange={(e) => form.setData((d) => ({ ...d, allow_portal: e.target.checked, role_id: '' }))}
                    />
                    {!editing && <p className="rounded-md bg-info-light p-3 text-xs text-info dark:bg-info-dark-light">A temporary password is generated and shown once after saving. Ask the user to change it after first sign-in.</p>}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            {editing ? 'Save changes' : 'Create user'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!creds} onClose={() => setCreds(null)} title="Temporary sign-in details" size="sm">
                {creds && (
                    <div className="space-y-4">
                        <p className="text-sm text-white-dark">Share these details securely with {creds.name}. The password will not be shown again.</p>
                        <div className="space-y-2 rounded-lg bg-[#f6f8fa] p-4 font-mono text-sm dark:bg-[#1a2941]">
                            <div>
                                <span className="text-white-dark">Email:</span> {creds.email}
                            </div>
                            <div>
                                <span className="text-white-dark">Password:</span> <strong className="text-primary">{creds.password}</strong>
                            </div>
                        </div>
                        <div className="flex justify-center gap-3">
                            <button
                                type="button"
                                className="btn btn-outline-primary"
                                onClick={() => {
                                    void navigator.clipboard?.writeText(`Email: ${creds.email}\nPassword: ${creds.password}`);
                                    toast('Copied to clipboard');
                                }}
                            >
                                <Copy className="h-4 w-4" /> Copy
                            </button>
                            <button className="btn btn-primary" onClick={() => setCreds(null)}>
                                Done
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
