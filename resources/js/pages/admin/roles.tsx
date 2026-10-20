import { router, useForm } from '@inertiajs/react';
import { Lock, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { FormGrid, Input } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, titleCase } from '@/lib/utils';

type Role = { id: number; name: string; slug: string; description: string | null; permissions: string[]; is_system: boolean; users_count: number; is_portal: boolean };
type Props = { roles: Role[]; modules: { key: string; label: string }[]; portalPermissions: string[]; specialPermissions: { key: string; label: string }[] };

export default function Roles({ roles, modules, portalPermissions, specialPermissions }: Props) {
    const can = useCan();
    const manage = can('administration.manage');
    const [selectedId, setSelectedId] = useState<number | 'new'>(roles[0]?.id ?? 'new');
    const selected = selectedId === 'new' ? null : (roles.find((r) => r.id === selectedId) ?? null);
    const form = useForm({ name: '', description: '', permissions: [] as string[] });

    useEffect(() => {
        form.clearErrors();
        form.setData({ name: selected?.name ?? '', description: selected?.description ?? '', permissions: selected?.permissions ?? [] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, roles]);

    const has = (p: string) => form.data.permissions.includes(p);
    const toggle = (p: string, on: boolean) => {
        const set = new Set(form.data.permissions);
        if (on) set.add(p);
        else set.delete(p);
        // manage implies view; removing view removes manage
        const [mod, level] = p.split('.');
        if (on && level === 'manage') set.add(`${mod}.view`);
        if (!on && level === 'view') set.delete(`${mod}.manage`);
        form.setData('permissions', [...set]);
    };
    const setAll = (level: 'view' | 'manage' | 'none') => {
        const keep = form.data.permissions.filter((p) => p.startsWith('portal.') || specialPermissions.some((s) => s.key === p));
        if (level === 'none') return form.setData('permissions', keep);
        form.setData('permissions', [...keep, ...modules.flatMap((m) => (level === 'manage' ? [`${m.key}.view`, `${m.key}.manage`] : [`${m.key}.view`]))]);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (selected) form.put(`/admin/roles/${selected.id}`, { preserveScroll: true });
        else
            form.post('/admin/roles', {
                preserveScroll: true,
                onSuccess: (page) => {
                    const list = (page.props as unknown as Props).roles;
                    const created = list.find((r) => r.name === form.data.name);
                    if (created) setSelectedId(created.id);
                },
            });
    };

    const destroy = async () => {
        if (!selected) return;
        const { confirmed } = await confirm({ title: `Delete role "${selected.name}"?`, text: 'Users must be reassigned first. This is recorded in the audit trail.', confirmText: 'Delete role', danger: true });
        if (confirmed) router.delete(`/admin/roles/${selected.id}`, { preserveScroll: true, onSuccess: () => setSelectedId(roles[0]?.id ?? 'new') });
    };

    const granted = form.data.permissions.length;

    return (
        <>
            <PageHeader
                title="Roles & Permissions"
                subtitle="Control what each role can view and manage. Changes take effect on the user's next page load."
                breadcrumbs={[{ title: 'Administration' }, { title: 'Roles & Permissions' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => setSelectedId('new')}>
                            <Plus className="h-4 w-4" /> New role
                        </button>
                    )
                }
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
                <div className="panel h-fit p-3">
                    <ul className="space-y-1">
                        {roles.map((r) => (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(r.id)}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-start transition hover:bg-primary-light dark:hover:bg-primary-dark-light',
                                        selectedId === r.id && 'bg-primary-light text-primary dark:bg-primary-dark-light',
                                    )}
                                >
                                    <ShieldCheck className={cn('h-4 w-4 shrink-0', r.is_portal ? 'text-secondary' : 'text-primary')} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-bold">{r.name}</div>
                                        <div className="flex items-center gap-2 text-[11px] text-white-dark">
                                            <Users className="h-3 w-3" /> {r.users_count} {r.is_system && <span className="badge badge-soft-dark px-1.5! py-0!">System</span>}
                                            {r.is_portal && <span className="badge badge-soft-secondary px-1.5! py-0!">Portal</span>}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                        {selectedId === 'new' && (
                            <li className="flex items-center gap-3 rounded-md bg-primary-light px-3 py-2.5 text-sm font-bold text-primary dark:bg-primary-dark-light">
                                <Plus className="h-4 w-4" /> New role
                            </li>
                        )}
                    </ul>
                </div>

                <form onSubmit={submit} className="panel lg:col-span-2 xl:col-span-3">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h5 className="text-lg font-bold">{selected ? selected.name : 'Create a custom role'}</h5>
                            <p className="text-xs text-white-dark">
                                {selected?.is_system ? 'System role — editable, but cannot be deleted.' : selected ? 'Custom role' : 'Start from no access and tick what this role needs.'} · {granted} permission{granted === 1 ? '' : 's'} granted
                            </p>
                        </div>
                        {manage && (
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="btn btn-sm btn-outline-info" onClick={() => setAll('view')}>
                                    View all
                                </button>
                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setAll('manage')}>
                                    Manage all
                                </button>
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => setAll('none')}>
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>

                    <FormGrid className="mb-6">
                        <Input label="Role name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} disabled={!manage} />
                        <Input label="Description" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} disabled={!manage} />
                    </FormGrid>

                    <div className="table-responsive">
                        <table className="table table-compact">
                            <thead>
                                <tr>
                                    <th>Module</th>
                                    <th className="text-center!">View</th>
                                    <th className="text-center!">Manage</th>
                                </tr>
                            </thead>
                            <tbody>
                                {modules.map((m) => (
                                    <tr key={m.key}>
                                        <td>
                                            <div className="font-semibold">{m.label}</div>
                                            <div className="font-mono text-[11px] text-white-dark">{m.key}</div>
                                        </td>
                                        {(['view', 'manage'] as const).map((level) => (
                                            <td key={level} className="text-center!">
                                                <input
                                                    type="checkbox"
                                                    className="form-checkbox"
                                                    disabled={!manage}
                                                    checked={has(`${m.key}.${level}`)}
                                                    onChange={(e) => toggle(`${m.key}.${level}`, e.target.checked)}
                                                    aria-label={`${m.label} ${level}`}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {specialPermissions.length > 0 && (
                                    <tr className="bg-primary-light/40 dark:bg-primary-dark-light">
                                        <td colSpan={3} className="text-xs font-bold text-primary uppercase">
                                            Special authorities
                                        </td>
                                    </tr>
                                )}
                                {specialPermissions.map((p) => (
                                    <tr key={p.key}>
                                        <td>
                                            <div className="font-semibold">{p.label}</div>
                                            <div className="font-mono text-[11px] text-white-dark">{p.key}</div>
                                        </td>
                                        <td colSpan={2} className="text-center!">
                                            <input type="checkbox" className="form-checkbox" disabled={!manage} checked={has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} aria-label={p.label} />
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-secondary-light/40 dark:bg-secondary-dark-light">
                                    <td colSpan={3} className="text-xs font-bold text-secondary uppercase">
                                        Self-service portal
                                    </td>
                                </tr>
                                {portalPermissions.map((p) => (
                                    <tr key={p}>
                                        <td>
                                            <div className="font-semibold">{p === 'portal.parent' ? 'Parent portal (linked wards only)' : 'Student portal (own records)'}</div>
                                            <div className="font-mono text-[11px] text-white-dark">{p}</div>
                                        </td>
                                        <td colSpan={2} className="text-center!">
                                            <input type="checkbox" className="form-checkbox" disabled={!manage} checked={has(p)} onChange={(e) => toggle(p, e.target.checked)} aria-label={titleCase(p)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {form.errors.permissions && <p className="mt-2 text-sm text-danger">{form.errors.permissions}</p>}

                    {manage && (
                        <div className="mt-6 flex flex-wrap justify-between gap-3">
                            <div>
                                {selected && !selected.is_system && (
                                    <button type="button" className="btn btn-outline-danger" onClick={destroy}>
                                        <Trash2 className="h-4 w-4" /> Delete role
                                    </button>
                                )}
                                {selected?.is_system && (
                                    <span className="flex items-center gap-2 text-xs text-white-dark">
                                        <Lock className="h-4 w-4" /> System roles cannot be deleted.
                                    </span>
                                )}
                            </div>
                            <button className="btn btn-primary" disabled={form.processing}>
                                <Save className="h-4 w-4" /> {selected ? 'Save permissions' : 'Create role'}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </>
    );
}
