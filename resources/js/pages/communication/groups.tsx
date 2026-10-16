import { router, useForm } from '@inertiajs/react';
import { Contact, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DeleteButton } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import EmptyState from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, num } from '@/lib/utils';

type Group = { id: number; name: string; description: string | null; members_count: number };
type Member = { id: number; name: string | null; phone: string | null; email: string | null };

export default function ContactGroups({ groups, selected, members }: { groups: Group[]; selected: number | null; members: Member[] }) {
    const can = useCan();
    const manage = can('communication.manage');
    const current = groups.find((g) => g.id === selected) ?? null;
    const [groupModal, setGroupModal] = useState<Group | 'new' | null>(null);
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState<Member | null>(null);

    const groupForm = useForm({ name: '', description: '' });
    const linesForm = useForm({ lines: '' });
    const memberForm = useForm({ name: '', phone: '', email: '' });

    const openGroup = (g: Group | 'new') => {
        groupForm.clearErrors();
        groupForm.setData(g === 'new' ? { name: '', description: '' } : { name: g.name, description: g.description ?? '' });
        setGroupModal(g);
    };
    const saveGroup = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setGroupModal(null) };
        if (groupModal === 'new') groupForm.post('/communication/groups', opts);
        else if (groupModal) groupForm.put(`/communication/groups/${groupModal.id}`, opts);
    };
    const addMembers = (e: FormEvent) => {
        e.preventDefault();
        if (!current) return;
        linesForm.post(`/communication/groups/${current.id}/members`, { preserveScroll: true, onSuccess: () => (linesForm.reset(), setAdding(false)) });
    };
    const saveMember = (e: FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        memberForm.put(`/communication/group-members/${editing.id}`, { preserveScroll: true, onSuccess: () => setEditing(null) });
    };
    const deleteGroup = async (g: Group) => {
        const { confirmed } = await confirm({ title: `Delete "${g.name}"?`, text: `Its ${g.members_count} contact(s) will be removed too.`, confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/communication/groups/${g.id}`);
    };

    const columns: Column<Member>[] = [
        { key: 'name', header: 'Name', render: (m) => <span className="font-semibold">{m.name ?? '—'}</span> },
        { key: 'phone', header: 'Phone', render: (m) => m.phone ?? '—' },
        { key: 'email', header: 'Email', render: (m) => m.email ?? '—' },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (m) =>
                manage && (
                    <div className="flex justify-end gap-1">
                        <button
                            type="button"
                            className="text-primary hover:opacity-70"
                            title="Edit"
                            onClick={() => {
                                memberForm.clearErrors();
                                memberForm.setData({ name: m.name ?? '', phone: m.phone ?? '', email: m.email ?? '' });
                                setEditing(m);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                        <DeleteButton href={`/communication/group-members/${m.id}`} label="contact" />
                    </div>
                ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Contact Groups"
                subtitle="Saved lists of people outside your student and staff records — board members, PTA, alumni, partners, government officers — for use in broadcasts."
                breadcrumbs={[{ title: 'Communication' }, { title: 'Broadcast Centre', href: '/communication/broadcasts' }, { title: 'Contact Groups' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openGroup('new')}>
                            <Plus className="h-4 w-4" /> New group
                        </button>
                    )
                }
            />

            {groups.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No contact groups yet" description="Create a group, then paste names, phone numbers and emails into it." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
                    <div className="panel space-y-1 p-3!">
                        {groups.map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => router.get('/communication/groups', { group: g.id }, { preserveScroll: true, preserveState: true })}
                                className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start',
                                    g.id === selected ? 'bg-primary text-white' : 'hover:bg-primary-light dark:hover:bg-primary-dark-light',
                                )}
                            >
                                <span className="flex items-center gap-2 truncate font-semibold">
                                    <Contact className="h-4 w-4 shrink-0" /> {g.name}
                                </span>
                                <span className={cn('badge rounded-full!', g.id === selected ? 'bg-white/20' : 'badge-soft-primary')}>{num(g.members_count)}</span>
                            </button>
                        ))}
                    </div>

                    {current && (
                        <div className="panel">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-lg font-bold">{current.name}</h5>
                                    {current.description && <p className="text-sm text-white-dark">{current.description}</p>}
                                </div>
                                {manage && (
                                    <div className="flex gap-2">
                                        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
                                            <UserPlus className="h-4 w-4" /> Add contacts
                                        </button>
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => openGroup(current)}>
                                            <Pencil className="h-4 w-4" /> Rename
                                        </button>
                                        <button className="btn btn-sm btn-outline-danger" onClick={() => deleteGroup(current)}>
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <DataTable columns={columns} rows={members} empty="No contacts in this group" emptyDescription="Use “Add contacts” to paste a list." />
                        </div>
                    )}
                </div>
            )}

            <Modal open={!!groupModal} onClose={() => setGroupModal(null)} title={groupModal === 'new' ? 'New contact group' : 'Edit group'}>
                <form onSubmit={saveGroup} className="space-y-4">
                    <Input
                        label="Name"
                        required
                        value={groupForm.data.name}
                        onChange={(e) => groupForm.setData('name', e.target.value)}
                        error={groupForm.errors.name}
                        placeholder="e.g. School Board"
                    />
                    <Input
                        label="Description"
                        value={groupForm.data.description}
                        onChange={(e) => groupForm.setData('description', e.target.value)}
                        error={groupForm.errors.description}
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setGroupModal(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={groupForm.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={adding} onClose={() => setAdding(false)} title={`Add contacts to ${current?.name ?? ''}`} size="lg">
                <form onSubmit={addMembers} className="space-y-4">
                    <Textarea
                        label="Contacts — one per line"
                        rows={10}
                        required
                        value={linesForm.data.lines}
                        onChange={(e) => linesForm.setData('lines', e.target.value)}
                        error={linesForm.errors.lines}
                        placeholder={'Juma Hassan, 0754 123 456, juma@example.com\nAsha Mrema, +255713000111\nboard.chair@example.com'}
                        help="Name, phone and email separated by commas (any can be left out, but each line needs a phone or an email). Paste straight from Excel. Duplicates are skipped."
                    />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setAdding(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={linesForm.processing}>
                            Add contacts
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit contact">
                <form onSubmit={saveMember} className="space-y-4">
                    <Input label="Name" value={memberForm.data.name} onChange={(e) => memberForm.setData('name', e.target.value)} error={memberForm.errors.name} />
                    <Input label="Phone" value={memberForm.data.phone} onChange={(e) => memberForm.setData('phone', e.target.value)} error={memberForm.errors.phone} />
                    <Input label="Email" type="email" value={memberForm.data.email} onChange={(e) => memberForm.setData('email', e.target.value)} error={memberForm.errors.email} />
                    <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={memberForm.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
