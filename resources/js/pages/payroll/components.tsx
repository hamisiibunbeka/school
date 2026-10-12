import { Link, router, useForm, usePage } from '@inertiajs/react';
import { Building, HandCoins, Layers, MinusCircle, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { IconButton, RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { confirm } from '@/lib/swal';
import { money, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Component = {
    id: number;
    name: string;
    code: string | null;
    type: string;
    calculation: string;
    value: string;
    is_statutory: boolean;
    applies_to_all: boolean;
    is_active: boolean;
    account_id: number | null;
    account: string | null;
    assignments_count: number;
};

type Assignment = {
    id: number;
    employee_id: number;
    employee: string;
    employee_no: string;
    employee_status: string;
    component_id: number;
    component: string;
    type: string;
    calculation: string;
    value: string;
    amount: string | null;
    effective: string | null;
};

type Props = {
    components: Component[];
    assignments: Paginated<Assignment>;
    filters: { search: string; component: string };
    accounts: Option[];
    employees: Option[];
    canManage: boolean;
};

const typeTone: Record<string, string> = { allowance: 'badge-soft-success', deduction: 'badge-soft-danger', employer_contribution: 'badge-soft-info' };
const calcLabel: Record<string, string> = { fixed: 'Fixed amount', percent_of_basic: '% of basic', paye: 'PAYE tax bands' };

function describe(c: { calculation: string; value: string; is_statutory?: boolean; code?: string | null }, cur: string) {
    if (c.calculation === 'paye') return 'Banded on taxable pay';
    if (c.calculation === 'percent_of_basic') return `${Number(c.value)}% of ${c.is_statutory && ['NSSF_EE', 'NSSF_ER', 'WCF', 'SDL'].includes(c.code ?? '') ? 'gross' : 'basic'}`;
    return money(c.value, cur);
}

export default function SalaryComponents({ components, assignments, filters: initial, accounts, employees, canManage }: Props) {
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [tab, setTab] = useState(initial.search || initial.component ? 'assignments' : 'components');
    const { filters, setFilter } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Component | null>(null);
    const [assignOpen, setAssignOpen] = useState(false);
    const [editAssignment, setEditAssignment] = useState<Assignment | null>(null);

    const blank = { name: '', code: '', type: 'allowance', calculation: 'fixed', value: '', applies_to_all: false, is_active: true, account_id: '' };
    const form = useForm(blank);
    const assignForm = useForm({ salary_component_id: '', employee_ids: [] as string[], amount: '' });
    const overrideForm = useForm({ amount: '' });

    const openForm = (c: Component | null) => {
        setEditing(c);
        form.clearErrors();
        form.setData(
            c
                ? { name: c.name, code: c.code ?? '', type: c.type, calculation: c.calculation, value: c.value, applies_to_all: c.applies_to_all, is_active: c.is_active, account_id: c.account_id ? String(c.account_id) : '' }
                : blank,
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/payroll/components/${editing.id}`, opts);
        else form.post('/payroll/components', opts);
    };

    const openAssign = (componentId?: number) => {
        assignForm.clearErrors();
        assignForm.setData({ salary_component_id: componentId ? String(componentId) : '', employee_ids: [], amount: '' });
        setAssignOpen(true);
    };

    const groups = (['allowance', 'deduction', 'employer_contribution'] as const).map((t) => ({ type: t, rows: components.filter((c) => c.type === t) }));
    const selectedComponent = components.find((c) => String(c.id) === assignForm.data.salary_component_id);

    const componentColumns: Column<Component>[] = [
        {
            key: 'name',
            header: 'Component',
            render: (c) => (
                <div>
                    <div className="flex items-center gap-2 font-bold">
                        {c.name}
                        {c.is_statutory && (
                            <span className="badge badge-soft-warning flex items-center gap-1 px-1.5 py-0 text-[10px]">
                                <ShieldCheck className="h-3 w-3" /> Statutory
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-white-dark">{c.code ?? '—'}</div>
                </div>
            ),
        },
        { key: 'calculation', header: 'Calculation', render: (c) => <span className="text-sm">{calcLabel[c.calculation] ?? c.calculation}</span> },
        { key: 'value', header: 'Rate / amount', align: 'right', render: (c) => <span className="font-semibold">{describe(c, cur)}</span> },
        {
            key: 'scope',
            header: 'Applies to',
            render: (c) =>
                c.applies_to_all ? (
                    <span className="badge badge-soft-primary">All staff</span>
                ) : (
                    <button type="button" className="badge badge-soft-secondary hover:underline" onClick={() => (setTab('assignments'), setFilter('component', String(c.id)))}>
                        {c.assignments_count} assigned
                    </button>
                ),
        },
        { key: 'account', header: 'GL account', render: (c) => <span className="text-sm">{c.account ?? <span className="text-warning">Default (2200)</span>}</span> },
        { key: 'is_active', header: 'Status', render: (c) => <StatusBadge status={c.is_active ? 'active' : 'inactive'} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) =>
                canManage ? (
                    <RowActions onEdit={() => openForm(c)} destroy={c.is_statutory ? undefined : `/payroll/components/${c.id}`} label="salary component">
                        {c.calculation !== 'paye' && <IconButton icon={UserPlus} title="Assign to employees" className="text-success" onClick={() => openAssign(c.id)} />}
                    </RowActions>
                ) : null,
        },
    ];

    const assignmentColumns: Column<Assignment>[] = [
        {
            key: 'employee',
            header: 'Employee',
            render: (a) => (
                <div>
                    <Link href={`/hr/employees/${a.employee_id}`} className="font-bold hover:text-primary">
                        {a.employee}
                    </Link>
                    <div className="text-xs text-white-dark">
                        {a.employee_no} {a.employee_status !== 'active' && <StatusBadge status={a.employee_status} className="ms-1" />}
                    </div>
                </div>
            ),
        },
        {
            key: 'component',
            header: 'Component',
            render: (a) => (
                <div>
                    <div className="font-semibold">{a.component}</div>
                    <span className={`badge ${typeTone[a.type]}`}>{titleCase(a.type)}</span>
                </div>
            ),
        },
        { key: 'default', header: 'Default', align: 'right', render: (a) => <span className="text-sm text-white-dark">{describe(a, cur)}</span> },
        { key: 'amount', header: 'Override', align: 'right', render: (a) => (a.amount !== null ? <span className="font-semibold text-primary">{money(a.amount, '')}</span> : <span className="text-white-dark">—</span>) },
        { key: 'effective', header: 'Monthly amount', align: 'right', render: (a) => <span className="font-bold">{a.effective !== null ? money(a.effective, '') : '—'}</span> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (a) =>
                canManage ? (
                    <div className="flex justify-end gap-1">
                        <IconButton
                            icon={Pencil}
                            title="Edit override"
                            className="text-primary"
                            onClick={() => {
                                overrideForm.setData('amount', a.amount !== null ? String(Number(a.amount)) : '');
                                setEditAssignment(a);
                            }}
                        />
                        <IconButton
                            icon={Trash2}
                            title="Remove"
                            className="text-danger"
                            onClick={async () => {
                                const { confirmed } = await confirm({ title: `Remove ${a.component} from ${a.employee}?`, danger: true, confirmText: 'Remove' });
                                if (confirmed) router.delete(`/payroll/assignments/${a.id}`, { preserveScroll: true });
                            }}
                        />
                    </div>
                ) : null,
        },
    ];

    return (
        <>
            <PageHeader
                title="Salary Components"
                subtitle="Allowances, deductions and employer contributions used to calculate payroll."
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Payroll', href: '/payroll' }, { title: 'Components' }]}
                actions={
                    canManage && (
                        <>
                            <button className="btn btn-outline-success" onClick={() => openAssign()}>
                                <UserPlus className="h-4 w-4" /> Assign to staff
                            </button>
                            <button className="btn btn-primary" onClick={() => openForm(null)}>
                                <Plus className="h-4 w-4" /> New component
                            </button>
                        </>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Allowances" value={num(groups[0].rows.length)} icon={HandCoins} tone="success" />
                <StatCard title="Deductions" value={num(groups[1].rows.length)} icon={MinusCircle} tone="danger" />
                <StatCard title="Employer contributions" value={num(groups[2].rows.length)} icon={Building} tone="info" />
                <StatCard title="Employee assignments" value={num(assignments.total)} icon={Layers} tone="primary" />
            </div>

            <div className="mb-5 rounded-md border border-warning/40 bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">
                <strong>Statutory rules must be verified.</strong> PAYE bands, NSSF (10% + 10%), WCF (0.5%) and SDL (3.5%) are configurable defaults for Tanzania mainland. Confirm current rates with TRA, NSSF and WCF before approving payroll.
            </div>

            <Tabs
                tabs={[
                    { key: 'components', label: 'Components', icon: Layers, count: components.length },
                    { key: 'assignments', label: 'Employee assignments', icon: UserPlus, count: assignments.total },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'components' && (
                <div className="space-y-6">
                    {groups.map((g) => (
                        <div key={g.type} className="panel">
                            <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                                <span className={`badge ${typeTone[g.type]}`}>{titleCase(g.type)}s</span>
                            </h5>
                            <DataTable columns={componentColumns} rows={g.rows} empty={`No ${titleCase(g.type).toLowerCase()}s configured`} />
                        </div>
                    ))}
                </div>
            )}

            {tab === 'assignments' && (
                <div className="panel">
                    <FilterBar>
                        <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search employee…" />
                        <FilterSelect
                            value={filters.component}
                            onChange={(v) => setFilter('component', v)}
                            options={components.filter((c) => !c.applies_to_all || c.assignments_count > 0).map((c) => ({ value: c.id, label: c.name }))}
                            placeholder="All components"
                        />
                    </FilterBar>
                    <DataTable columns={assignmentColumns} paginated={assignments} empty="No component assignments" emptyDescription="Assign allowances or deductions (e.g. loans) to specific employees." />
                </div>
            )}

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New salary component'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    {editing?.is_statutory && <p className="rounded-md bg-warning-light p-3 text-sm text-warning dark:bg-warning-dark-light">Statutory component: only the name, rate, GL account and active status can be changed.</p>}
                    <FormGrid>
                        <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} placeholder="e.g. Housing allowance" />
                        <Input label="Code" value={form.data.code} disabled={editing?.is_statutory} onChange={(e) => form.setData('code', e.target.value.toUpperCase())} error={form.errors.code} placeholder="e.g. HOUSING" />
                        <Select
                            label="Type"
                            required
                            disabled={editing?.is_statutory}
                            value={form.data.type}
                            onChange={(e) => form.setData((d) => ({ ...d, type: e.target.value, calculation: e.target.value !== 'deduction' && d.calculation === 'paye' ? 'fixed' : d.calculation }))}
                            options={[
                                { value: 'allowance', label: 'Allowance (earning)' },
                                { value: 'deduction', label: 'Deduction (employee)' },
                                { value: 'employer_contribution', label: 'Employer contribution' },
                            ]}
                            error={form.errors.type}
                        />
                        <Select
                            label="Calculation"
                            required
                            disabled={editing?.is_statutory}
                            value={form.data.calculation}
                            onChange={(e) => form.setData('calculation', e.target.value)}
                            options={[
                                { value: 'fixed', label: 'Fixed amount' },
                                { value: 'percent_of_basic', label: 'Percentage of basic' },
                                ...(form.data.type === 'deduction' ? [{ value: 'paye', label: 'PAYE (tax bands)' }] : []),
                            ]}
                            error={form.errors.calculation}
                        />
                        {form.data.calculation !== 'paye' && (
                            <Input
                                label={form.data.calculation === 'fixed' ? `Amount (${cur})` : 'Rate (%)'}
                                type="number"
                                min={0}
                                step="0.0001"
                                required
                                value={form.data.value}
                                onChange={(e) => form.setData('value', e.target.value)}
                                error={form.errors.value}
                            />
                        )}
                        <Select
                            label="GL account"
                            placeholder={form.data.type === 'allowance' ? 'Default: 6100 Salaries' : 'Default: 2200 Accrued liabilities'}
                            value={form.data.account_id}
                            onChange={(e) => form.setData('account_id', e.target.value)}
                            options={accounts}
                            error={form.errors.account_id}
                            help={form.data.type === 'allowance' ? 'Allowances are expensed through 6100 Salaries.' : 'Liability credited when payroll is approved (e.g. 2600 Loans, 1310 Staff advances).'}
                        />
                    </FormGrid>
                    <div className="flex flex-wrap gap-6">
                        <Checkbox label="Applies to all staff" disabled={editing?.is_statutory} checked={form.data.applies_to_all} onChange={(e) => form.setData('applies_to_all', e.target.checked)} />
                        <Checkbox label="Active" checked={form.data.is_active} onChange={(e) => form.setData('is_active', e.target.checked)} />
                    </div>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save component
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign component to employees" size="lg">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        assignForm.post('/payroll/assignments', { preserveScroll: true, onSuccess: () => setAssignOpen(false) });
                    }}
                    className="space-y-4"
                >
                    <Select
                        label="Component"
                        required
                        placeholder="Select component…"
                        value={assignForm.data.salary_component_id}
                        onChange={(e) => assignForm.setData('salary_component_id', e.target.value)}
                        options={components.filter((c) => c.calculation !== 'paye' && c.is_active).map((c) => ({ value: c.id, label: `${c.name} · ${titleCase(c.type)} · ${describe(c, cur)}` }))}
                        error={assignForm.errors.salary_component_id}
                    />
                    <Field label={`Employees (${assignForm.data.employee_ids.length} selected)`} error={assignForm.errors.employee_ids} required>
                        <div className="max-h-60 overflow-y-auto rounded-md border border-white-light p-2 dark:border-[#1b2e4b]">
                            <div className="mb-2 flex gap-3 text-xs">
                                <button type="button" className="font-bold text-primary" onClick={() => assignForm.setData('employee_ids', employees.map((e) => String(e.value)))}>
                                    Select all
                                </button>
                                <button type="button" className="font-bold text-white-dark" onClick={() => assignForm.setData('employee_ids', [])}>
                                    Clear
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                {employees.map((e) => {
                                    const v = String(e.value);
                                    const checked = assignForm.data.employee_ids.includes(v);
                                    return (
                                        <Checkbox
                                            key={v}
                                            label={<span className="text-sm font-normal">{e.label}</span>}
                                            checked={checked}
                                            onChange={() => assignForm.setData('employee_ids', checked ? assignForm.data.employee_ids.filter((x) => x !== v) : [...assignForm.data.employee_ids, v])}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </Field>
                    <Input
                        label={`Override amount (${cur}, optional)`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={assignForm.data.amount}
                        onChange={(e) => assignForm.setData('amount', e.target.value)}
                        error={assignForm.errors.amount}
                        help={selectedComponent ? `Leave blank to use the component default (${describe(selectedComponent, cur)}).` : 'Leave blank to use the component default.'}
                    />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setAssignOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-success" disabled={assignForm.processing}>
                            Assign
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!editAssignment} onClose={() => setEditAssignment(null)} title="Edit override amount" size="sm">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        overrideForm.put(`/payroll/assignments/${editAssignment?.id}`, { preserveScroll: true, onSuccess: () => setEditAssignment(null) });
                    }}
                    className="space-y-4"
                >
                    <p className="text-sm text-white-dark">
                        {editAssignment?.component} for <strong className="text-black dark:text-white-light">{editAssignment?.employee}</strong>
                    </p>
                    <Input
                        label={`Amount (${cur})`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={overrideForm.data.amount}
                        onChange={(e) => overrideForm.setData('amount', e.target.value)}
                        error={overrideForm.errors.amount}
                        help="Leave blank to use the component default."
                    />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setEditAssignment(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={overrideForm.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
