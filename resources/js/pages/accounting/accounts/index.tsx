import { Link, router, useForm } from '@inertiajs/react';
import { BookOpen, Download, EyeOff, Layers, Lock, Pencil, Plus, Power, ShieldCheck, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { IconButton } from '@/components/ui/actions';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, exportCsv, num, titleCase } from '@/lib/utils';
import { Amt } from '../_components/report';

type Row = {
    id: number;
    parent_id: number | null;
    code: string;
    name: string;
    type: string;
    sub_type: string | null;
    normal_balance: 'debit' | 'credit';
    is_control: boolean;
    is_postable: boolean;
    is_active: boolean;
    description: string | null;
    depth: number;
    balance: string;
    postings: number;
    children: number;
};

type Props = {
    accounts: Row[];
    totals: Record<string, string>;
    stats: { total: number; postable: number; control: number; inactive: number };
    subTypes: Record<string, string[]>;
    parents: { value: number; label: string; type: string }[];
};

const CLASSES = [
    { key: 'asset', label: 'Assets', tone: 'text-primary', bg: 'bg-primary-light dark:bg-primary-dark-light' },
    { key: 'liability', label: 'Liabilities', tone: 'text-danger', bg: 'bg-danger-light dark:bg-danger-dark-light' },
    { key: 'equity', label: 'Equity & Funds', tone: 'text-secondary', bg: 'bg-secondary-light dark:bg-secondary-dark-light' },
    { key: 'income', label: 'Income', tone: 'text-success', bg: 'bg-success-light dark:bg-success-dark-light' },
    { key: 'expense', label: 'Expenses', tone: 'text-warning', bg: 'bg-warning-light dark:bg-warning-dark-light' },
];

const blank = { code: '', name: '', type: 'asset', sub_type: '', parent_id: '', normal_balance: 'debit', is_control: false, is_postable: true, is_active: true, description: '' };

export default function Accounts({ accounts, totals, stats, subTypes, parents }: Props) {
    const can = useCan();
    const manage = can('accounting.manage');
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [status, setStatus] = useState('');
    const [editing, setEditing] = useState<Row | null>(null);
    const [open, setOpen] = useState(false);
    const form = useForm(blank);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return accounts.filter(
            (a) =>
                (!type || a.type === type) &&
                (!status || (status === 'active' ? a.is_active : !a.is_active)) &&
                (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.sub_type ?? '').includes(q)),
        );
    }, [accounts, search, type, status]);

    const openForm = (a: Row | null, parent?: Row) => {
        setEditing(a);
        form.clearErrors();
        form.setData(
            a
                ? {
                      code: a.code,
                      name: a.name,
                      type: a.type,
                      sub_type: a.sub_type ?? '',
                      parent_id: a.parent_id ? String(a.parent_id) : '',
                      normal_balance: a.normal_balance,
                      is_control: a.is_control,
                      is_postable: a.is_postable,
                      is_active: a.is_active,
                      description: a.description ?? '',
                  }
                : parent
                  ? { ...blank, type: parent.type, parent_id: String(parent.id), normal_balance: ['asset', 'expense'].includes(parent.type) ? 'debit' : 'credit' }
                  : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/accounting/accounts/${editing.id}`, opts);
        else form.post('/accounting/accounts', opts);
    };

    const changeType = (t: string) => {
        form.setData((d) => ({ ...d, type: t, parent_id: '', sub_type: '', normal_balance: ['asset', 'expense'].includes(t) ? 'debit' : 'credit' }));
    };

    const toggle = async (a: Row) => {
        const { confirmed } = await confirm({
            title: a.is_active ? `Deactivate ${a.code}?` : `Activate ${a.code}?`,
            text: a.is_active ? 'Inactive accounts cannot receive new postings but keep their history.' : 'The account will be available for posting again.',
            confirmText: a.is_active ? 'Deactivate' : 'Activate',
            danger: a.is_active,
        });
        if (confirmed) router.post(`/accounting/accounts/${a.id}/toggle`, {}, { preserveScroll: true });
    };

    const destroy = async (a: Row) => {
        const { confirmed } = await confirm({ title: `Delete ${a.code} · ${a.name}?`, text: 'This cannot be undone.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/accounting/accounts/${a.id}`, { preserveScroll: true });
    };

    const exportRows = () =>
        exportCsv('chart-of-accounts', [
            ['Code', 'Name', 'Class', 'Sub-type', 'Normal balance', 'Control', 'Postable', 'Active', 'Balance'],
            ...accounts.map((a) => [a.code, a.name, a.type, a.sub_type, a.normal_balance, a.is_control ? 'Yes' : 'No', a.is_postable ? 'Yes' : 'No', a.is_active ? 'Yes' : 'No', a.balance]),
        ]);

    const parentOptions = parents.filter((p) => p.type === form.data.type && p.value !== editing?.id);

    return (
        <>
            <PageHeader
                title="Chart of Accounts"
                subtitle="Hierarchical, configurable ledger structure with live balances from posted journals."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Chart of Accounts' }]}
                actions={
                    <>
                        <button type="button" className="btn btn-outline-primary" onClick={exportRows}>
                            <Download className="h-4 w-4" /> Export CSV
                        </button>
                        {manage && (
                            <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> New account
                            </button>
                        )}
                    </>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Accounts" value={num(stats.total)} icon={BookOpen} tone="primary" />
                <StatCard title="Postable" value={num(stats.postable)} icon={Layers} tone="success" />
                <StatCard title="Control accounts" value={num(stats.control)} icon={ShieldCheck} tone="warning" hint="Updated via sub-ledgers" />
                <StatCard title="Inactive" value={num(stats.inactive)} icon={EyeOff} tone="danger" />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                {CLASSES.map((c) => (
                    <button
                        type="button"
                        key={c.key}
                        onClick={() => setType(type === c.key ? '' : c.key)}
                        className={cn('panel p-4! text-start transition hover:-translate-y-0.5', type === c.key && 'ring-2 ring-primary')}
                    >
                        <div className={cn('text-xs font-extrabold tracking-wider uppercase', c.tone)}>{c.label}</div>
                        <div className="mt-1 text-lg font-extrabold text-black dark:text-white-light">
                            <Amt value={totals[c.key]} zero />
                        </div>
                    </button>
                ))}
            </div>

            <div className="panel">
                <FilterBar
                    actions={
                        (search || type || status) && (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-dark"
                                onClick={() => {
                                    setSearch('');
                                    setType('');
                                    setStatus('');
                                }}
                            >
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={search} onChange={setSearch} placeholder="Search code, name or sub-type…" />
                    <FilterSelect value={type} onChange={setType} options={CLASSES.map((c) => ({ value: c.key, label: c.label }))} placeholder="All classes" />
                    <FilterSelect
                        value={status}
                        onChange={setStatus}
                        options={[
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' },
                        ]}
                        placeholder="Active & inactive"
                    />
                </FilterBar>

                <div className="table-responsive">
                    <table className="table table-compact">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Account name</th>
                                <th>Sub-type</th>
                                <th>Normal</th>
                                <th className="text-center!">Flags</th>
                                <th className="text-end!">Balance</th>
                                {manage && <th />}
                            </tr>
                        </thead>
                        <tbody>
                            {CLASSES.filter((c) => !type || c.key === type).map((c) => {
                                const rows = filtered.filter((a) => a.type === c.key);
                                if (!rows.length) return null;
                                return [
                                    <tr key={`h-${c.key}`} className="hover:bg-transparent!">
                                        <td colSpan={manage ? 7 : 6} className={cn('py-2! text-xs font-extrabold tracking-wider uppercase', c.tone, c.bg)}>
                                            {c.label}
                                        </td>
                                    </tr>,
                                    ...rows.map((a) => (
                                        <tr key={a.id} className={cn(!a.is_active && 'opacity-60')}>
                                            <td className={cn('font-mono', !a.is_postable && 'font-extrabold')}>{a.code}</td>
                                            <td>
                                                <div className="flex items-center gap-2" style={{ paddingInlineStart: `${a.depth * 1.25}rem` }}>
                                                    {a.depth > 0 && <span className="text-white-dark">└</span>}
                                                    {a.is_postable ? (
                                                        <Link href={`/accounting/ledger?account=${a.id}`} className="font-semibold hover:text-primary hover:underline">
                                                            {a.name}
                                                        </Link>
                                                    ) : (
                                                        <span className="font-extrabold text-black uppercase dark:text-white-light">{a.name}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="text-xs text-white-dark">{titleCase(a.sub_type)}</td>
                                            <td>
                                                <span className={cn('badge', a.normal_balance === 'debit' ? 'badge-outline-primary' : 'badge-outline-secondary')}>{a.normal_balance === 'debit' ? 'Dr' : 'Cr'}</span>
                                            </td>
                                            <td className="text-center!">
                                                <div className="flex flex-wrap justify-center gap-1">
                                                    {a.is_control && (
                                                        <span className="badge badge-soft-warning inline-flex items-center gap-1" title="Control account — updated through its sub-ledger">
                                                            <Lock className="h-3 w-3" /> Control
                                                        </span>
                                                    )}
                                                    {!a.is_postable && <span className="badge badge-soft-dark">Header</span>}
                                                    {!a.is_active && <span className="badge badge-soft-danger">Inactive</span>}
                                                    {a.is_postable && a.is_active && !a.is_control && <span className="badge badge-soft-success">Postable</span>}
                                                </div>
                                            </td>
                                            <td className="text-end!">
                                                <Amt value={a.balance} bold={!a.is_postable} zero />
                                            </td>
                                            {manage && (
                                                <td className="text-end!">
                                                    <div className="flex justify-end gap-1">
                                                        {!a.is_postable && <IconButton icon={Plus} title="Add sub-account" className="text-success" onClick={() => openForm(null, a)} />}
                                                        <IconButton icon={Power} title={a.is_active ? 'Deactivate' : 'Activate'} className={a.is_active ? 'text-warning' : 'text-success'} onClick={() => toggle(a)} />
                                                        <IconButton
                                                            icon={Pencil}
                                                            title="Edit"
                                                            className="text-primary"
                                                            onClick={() => openForm(a)}
                                                        />
                                                        {a.postings === 0 && a.children === 0 && <IconButton icon={Trash2} title="Delete" className="text-danger" onClick={() => destroy(a)} />}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    )),
                                ];
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-10 text-center text-white-dark">
                                        No accounts match your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-xs text-white-dark">
                    Balances are derived from posted journals and shown in each account&apos;s normal direction; header totals roll up their sub-accounts. Accounts with postings cannot be deleted — deactivate them instead.
                </p>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit account ${editing.code}` : 'New ledger account'} size="lg">
                <form onSubmit={submit} className="space-y-5">
                    {editing && editing.postings > 0 && (
                        <div className="rounded-md bg-warning-light p-3 text-xs text-warning dark:bg-warning-dark-light">
                            This account has {num(editing.postings)} posting(s): its class and normal balance are locked.
                        </div>
                    )}
                    <FormGrid>
                        <Input label="Account code" required value={form.data.code} onChange={(e) => form.setData('code', e.target.value)} error={form.errors.code} help="Unique within this school, e.g. 6250" />
                        <Input label="Account name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                        <Select
                            label="Class"
                            required
                            value={form.data.type}
                            onChange={(e) => changeType(e.target.value)}
                            options={CLASSES.map((c) => ({ value: c.key, label: c.label }))}
                            error={form.errors.type}
                            disabled={!!editing && editing.postings > 0}
                        />
                        <Select
                            label="Sub-type"
                            value={form.data.sub_type}
                            onChange={(e) => form.setData('sub_type', e.target.value)}
                            options={(subTypes[form.data.type] ?? []).map((s) => ({ value: s, label: titleCase(s) }))}
                            placeholder="— none —"
                            error={form.errors.sub_type}
                            help="Drives statement classification (current/non-current, direct cost, cash…)"
                        />
                        <Select label="Parent account" value={form.data.parent_id} onChange={(e) => form.setData('parent_id', e.target.value)} options={parentOptions} placeholder="— top level —" error={form.errors.parent_id} />
                        <Select
                            label="Normal balance"
                            value={form.data.normal_balance}
                            onChange={(e) => form.setData('normal_balance', e.target.value)}
                            options={[
                                { value: 'debit', label: 'Debit' },
                                { value: 'credit', label: 'Credit' },
                            ]}
                            error={form.errors.normal_balance}
                            disabled={!!editing && editing.postings > 0}
                            help="Defaulted by class; use credit for contra-assets such as accumulated depreciation."
                        />
                        <Textarea label="Description" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} wrapperClassName="sm:col-span-2" rows={2} />
                    </FormGrid>
                    <div className="flex flex-wrap gap-6">
                        <Checkbox label="Postable (accepts journal lines)" checked={form.data.is_postable} onChange={(e) => form.setData('is_postable', e.target.checked)} />
                        <Checkbox label="Control account (sub-ledger only)" checked={form.data.is_control} onChange={(e) => form.setData('is_control', e.target.checked)} />
                        <Checkbox label="Active" checked={form.data.is_active} onChange={(e) => form.setData('is_active', e.target.checked)} />
                    </div>
                    {form.errors.is_postable && <p className="form-error">{form.errors.is_postable}</p>}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save account
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
