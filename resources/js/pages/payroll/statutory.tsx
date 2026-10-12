import { useForm } from '@inertiajs/react';
import {
    BadgeInfo,
    Calculator,
    CircleCheck,
    CircleAlert,
    ExternalLink,
    History,
    Landmark,
    Pencil,
    Plus,
    Save,
    ShieldCheck,
    Trash2,
    UserCog,
    Users,
    X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { FormGrid, Input, Select, Switch, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import Tabs from '@/components/ui/tabs';
import { confirm } from '@/lib/swal';
import { cn, date, dateTime, money, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';
import { DateInput } from '@/components/ui/date-picker';
import SearchSelect from '@/components/ui/search-select';

type Band = { lower_limit: string; upper_limit: string | null; rate: string; base_tax: string };
type TaxTable = {
    id: number;
    name: string;
    jurisdiction: string;
    effective_from: string;
    is_active: boolean;
    in_force: boolean;
    taxable_base: 'gross' | 'gross_less_pension';
    secondary_rate: string;
    non_resident_rate: string;
    source_url: string | null;
    notes: string | null;
    updated_at: string | null;
    updated_by: string | null;
    bands: Band[];
};
type Component = {
    id: number;
    name: string;
    code: string | null;
    authority: string | null;
    description: string | null;
    type: 'deduction' | 'employer_contribution' | 'allowance';
    calculation: 'fixed' | 'percent_of_basic' | 'paye';
    base: 'basic' | 'gross';
    value: string;
    min_employees: number | null;
    cap_amount: string | null;
    applies_to_all: boolean;
    exclude_on_probation: boolean;
    is_active: boolean;
    account_id: number | null;
    account: string | null;
    excluded_ids: number[];
    assigned_ids: number[];
    threshold_met: boolean;
};
type Staff = {
    id: number;
    name: string;
    employee_no: string;
    designation: string | null;
    department: string | null;
    basic_salary: string | null;
    hire_date: string | null;
    probation_end_date: string | null;
    on_probation: boolean;
    tax_status: string;
    nssf_no: string | null;
    tin: string | null;
};
type Props = {
    tables: TaxTable[];
    components: Component[];
    staff: Staff[];
    headcount: number;
    rules: { paye_taxable: string; version: string; notice: string };
    accounts: Option[];
    canManage: boolean;
    sources: { label: string; url: string }[];
};

const taxStatuses: Option[] = [
    { value: 'primary', label: 'Primary employment (PAYE bands)' },
    { value: 'secondary', label: 'Secondary employment (flat rate)' },
    { value: 'non_resident', label: 'Non-resident (flat rate)' },
    { value: 'exempt', label: 'Exempt from PAYE' },
];

/** PAYE using a table — mirrors App\Services\Payroll\PayrollCalculator::payeFor(). */
function computePaye(taxable: number, table: TaxTable | undefined, status: string) {
    if (!table) return { tax: 0, band: -1, text: 'No PAYE table configured.' };
    if (status === 'exempt') return { tax: 0, band: -1, text: 'Employee is exempt from PAYE.' };
    if (status === 'secondary' || status === 'non_resident') {
        const rate = Number(status === 'secondary' ? table.secondary_rate : table.non_resident_rate);
        const tax = Math.round(Math.max(taxable, 0) * rate) / 100;
        return { tax, band: -1, text: `${status === 'secondary' ? 'Secondary employment' : 'Non-resident'} flat rate: ${num(taxable)} × ${rate}% = ${num(tax)}` };
    }
    if (taxable <= 0) return { tax: 0, band: 0, text: 'No taxable income.' };
    const idx = table.bands.findIndex((b, i) => (taxable > Number(b.lower_limit) || i === 0) && (b.upper_limit === null || taxable <= Number(b.upper_limit)));
    if (idx < 0) return { tax: 0, band: -1, text: 'Income not covered by the table.' };
    const b = table.bands[idx];
    const tax = Math.round((Number(b.base_tax) + ((taxable - Number(b.lower_limit)) * Number(b.rate)) / 100) * 100) / 100;
    const text =
        Number(b.rate) === 0
            ? `Taxable income ${num(taxable)} is within the tax-free band — no PAYE.`
            : `${num(b.base_tax)} + ${Number(b.rate)}% × (${num(taxable)} − ${num(b.lower_limit)}) = ${num(tax)}`;
    return { tax, band: idx, text };
}

function bandRange(b: Band, i: number) {
    if (b.upper_limit === null) return `Above ${num(b.lower_limit)}`;
    return i === 0 ? `0 – ${num(b.upper_limit)}` : `${num(Number(b.lower_limit) + 1)} – ${num(b.upper_limit)}`;
}

function bandFormula(b: Band) {
    const rate = Number(b.rate);
    if (rate === 0) return 'Nil (tax-free)';
    const base = Number(b.base_tax);
    return `${base ? `${num(base)} + ` : ''}${rate}% of the amount above ${num(b.lower_limit)}`;
}

export default function Statutory(props: Props) {
    const { tables, components, staff, headcount, canManage, sources } = props;
    const [tab, setTab] = useState('paye');
    const inForce = tables.find((t) => t.in_force) ?? tables[0];
    const [selectedId, setSelectedId] = useState<number | undefined>(inForce?.id);
    const selected = tables.find((t) => t.id === selectedId) ?? inForce;

    return (
        <>
            <PageHeader
                title="Statutory Rules"
                subtitle="How PAYE, NSSF, WCF, SDL, HESLB and other government deductions are calculated — transparent to everyone, editable by payroll administrators."
                breadcrumbs={[{ title: 'Payroll', href: '/payroll' }, { title: 'Statutory rules' }]}
            />

            <div className="mb-5 flex items-start gap-3 rounded-md border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning dark:bg-warning-dark-light">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                    <strong>Verify before each payroll year.</strong> These defaults follow the latest published Tanzania Mainland rules (TRA 2025/26, NSSF, WCF, HESLB). Rates change with each Finance Act — when they do,
                    create a new PAYE table version with its effective date instead of editing history. Approved payrolls always keep the exact rules they were calculated with.
                </div>
            </div>

            <Tabs
                tabs={[
                    { key: 'paye', label: 'PAYE Table', icon: Calculator },
                    { key: 'contributions', label: 'Contributions & Deductions', icon: Landmark, count: components.length },
                    { key: 'staff', label: 'Staff Statutory Profile', icon: UserCog, count: staff.length },
                    { key: 'sources', label: 'Sources', icon: BadgeInfo },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'paye' && selected && (
                <PayeTab
                    key={selected.id + (selected.updated_at ?? '')}
                    table={selected}
                    tables={tables}
                    onSelect={setSelectedId}
                    canManage={canManage}
                    nssfRate={Number(components.find((c) => c.code === 'NSSF_EE')?.value ?? 10)}
                />
            )}
            {tab === 'contributions' && <ContributionsTab components={components} staff={staff} headcount={headcount} canManage={canManage} accounts={props.accounts} />}
            {tab === 'staff' && <StaffTab staff={staff} components={components} canManage={canManage} />}
            {tab === 'sources' && (
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Official references used for the defaults</h5>
                    <ul className="space-y-3">
                        {sources.map((s) => (
                            <li key={s.url}>
                                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
                                    <ExternalLink className="h-4 w-4" /> {s.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-6 text-sm text-white-dark">{props.rules.notice}</p>
                    <p className="mt-2 text-xs text-white-dark">Rule pack in use today: {props.rules.version}</p>
                </div>
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* PAYE                                                                */
/* ------------------------------------------------------------------ */

function PayeTab({ table, tables, onSelect, canManage, nssfRate }: { table: TaxTable; tables: TaxTable[]; onSelect: (id: number) => void; canManage: boolean; nssfRate: number }) {
    const [editing, setEditing] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [gross, setGross] = useState('1250000');
    const [status, setStatus] = useState('primary');

    const g = Number(gross) || 0;
    const nssf = table.taxable_base === 'gross_less_pension' ? Math.round(g * nssfRate) / 100 : 0;
    const nssfDeducted = Math.round(g * nssfRate) / 100;
    const taxable = g - nssf;
    const result = computePaye(taxable, table, status);
    const net = g - nssfDeducted - result.tax;

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h5 className="text-lg font-bold">{table.name}</h5>
                                {table.in_force && (
                                    <span className="badge badge-soft-success">
                                        <CircleCheck className="h-3 w-3" /> In force
                                    </span>
                                )}
                                {!table.is_active && <span className="badge badge-soft-dark">Inactive draft</span>}
                            </div>
                            <p className="text-xs text-white-dark">
                                {table.jurisdiction} · effective {date(table.effective_from)} · monthly · taxable income ={' '}
                                <strong>{table.taxable_base === 'gross' ? 'gross pay' : 'gross pay − employee NSSF/pension'}</strong>
                                {table.updated_by && ` · last edited by ${table.updated_by} ${dateTime(table.updated_at)}`}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {tables.length > 1 && (
                                <SearchSelect className="form-select form-select-sm w-auto" value={table.id} onChange={(e) => onSelect(Number(e.target.value))}>
                                    {tables.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.effective_from}){t.in_force ? ' • in force' : ''}
                                        </option>
                                    ))}
                                </SearchSelect>
                            )}
                            {canManage && !editing && (
                                <>
                                    <button className="btn btn-sm btn-outline-primary" onClick={() => setNewOpen(true)}>
                                        <History className="h-4 w-4" /> New version
                                    </button>
                                    <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
                                        <Pencil className="h-4 w-4" /> Edit table
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {editing ? (
                        <TableEditor table={table} onDone={() => setEditing(false)} />
                    ) : (
                        <>
                            <div className="table-responsive">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Monthly taxable income (TZS)</th>
                                            <th className="text-center!">Rate</th>
                                            <th className="text-end!">Tax on lower bands</th>
                                            <th>How the tax is calculated</th>
                                            <th className="text-end!">Max tax at top of band</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {table.bands.map((b, i) => (
                                            <tr key={i} className={cn(result.band === i && status === 'primary' && 'bg-primary-light/60! dark:bg-primary-dark-light!')}>
                                                <td className="font-bold">{i + 1}</td>
                                                <td className="font-semibold">{bandRange(b, i)}</td>
                                                <td className="text-center!">
                                                    <span className={cn('badge', Number(b.rate) === 0 ? 'badge-soft-success' : 'badge-soft-primary')}>{Number(b.rate)}%</span>
                                                </td>
                                                <td className="text-end!">{num(b.base_tax)}</td>
                                                <td className="text-sm">{bandFormula(b)}</td>
                                                <td className="text-end! font-semibold">
                                                    {b.upper_limit === null ? '—' : num(Number(b.base_tax) + ((Number(b.upper_limit) - Number(b.lower_limit)) * Number(b.rate)) / 100)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                                <div className="rounded-md bg-[#f6f8fa] p-3 dark:bg-[#1a2941]">
                                    <div className="text-xs font-bold text-white-dark uppercase">Secondary employment</div>
                                    Flat <strong>{Number(table.secondary_rate)}%</strong> of the taxable amount (no tax-free band).
                                </div>
                                <div className="rounded-md bg-[#f6f8fa] p-3 dark:bg-[#1a2941]">
                                    <div className="text-xs font-bold text-white-dark uppercase">Non-resident employees</div>
                                    Flat <strong>{Number(table.non_resident_rate)}%</strong> of the taxable amount.
                                </div>
                            </div>
                            {table.notes && <p className="mt-4 text-sm text-white-dark">{table.notes}</p>}
                            {table.source_url && (
                                <a href={table.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                                    <ExternalLink className="h-3.5 w-3.5" /> Source
                                </a>
                            )}
                        </>
                    )}
                </div>

                <div className="panel">
                    <h5 className="mb-3 text-lg font-bold">How PAYE works, step by step</h5>
                    <ol className="list-decimal space-y-2 ps-5 text-sm">
                        <li>
                            <strong>Gross pay</strong> = basic salary (less any unpaid leave) + taxable allowances.
                        </li>
                        <li>
                            <strong>Taxable income</strong> = gross pay {table.taxable_base === 'gross_less_pension' ? `− the employee's NSSF contribution (${nssfRate}% of gross).` : '(no pension deduction).'}
                        </li>
                        <li>
                            Find the <strong>band</strong> the taxable income falls into.
                        </li>
                        <li>
                            <strong>PAYE</strong> = the band's &ldquo;tax on lower bands&rdquo; + the band rate × (taxable income − the band&apos;s lower limit).
                        </li>
                        <li>
                            Staff on <strong>secondary employment</strong> or <strong>non-resident</strong> status pay the flat rate instead; <strong>exempt</strong> staff pay none.
                        </li>
                    </ol>
                </div>
            </div>

            <div className="panel h-max xl:sticky xl:top-24">
                <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                    <Calculator className="h-5 w-5 text-primary" /> PAYE calculator
                </h5>
                <div className="space-y-4">
                    <Input label="Monthly gross pay (TZS)" type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} />
                    <Select label="Tax status" value={status} onChange={(e) => setStatus(e.target.value)} options={taxStatuses} />
                </div>
                <dl className="mt-5 space-y-2 text-sm">
                    <Line label="Gross pay" value={money(g, '')} />
                    <Line label={`Employee NSSF (${nssfRate}%)`} value={`− ${money(nssfDeducted, '')}`} />
                    <Line label="Taxable income" value={money(taxable, '')} strong />
                    {status === 'primary' && result.band >= 0 && <Line label="Band" value={`Band ${result.band + 1} (${Number(table.bands[result.band]?.rate)}%)`} />}
                    <div className="rounded-md bg-primary-light p-3 text-xs font-semibold text-primary dark:bg-primary-dark-light">{result.text}</div>
                    <Line label="PAYE" value={`− ${money(result.tax, '')}`} strong />
                    <div className="border-t border-white-light pt-2 dark:border-[#1b2e4b]">
                        <Line label="Net pay (before other deductions)" value={money(net, 'TZS')} strong />
                    </div>
                    {g > 0 && <p className="text-xs text-white-dark">Effective PAYE rate: {((result.tax / g) * 100).toFixed(2)}% of gross.</p>}
                </dl>
            </div>

            <NewVersionModal open={newOpen} onClose={() => setNewOpen(false)} copyFrom={table} />
        </div>
    );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-white-dark">{label}</dt>
            <dd className={cn('text-end', strong && 'font-extrabold text-black dark:text-white-light')}>{value}</dd>
        </div>
    );
}

function TableEditor({ table, onDone }: { table: TaxTable; onDone: () => void }) {
    const form = useForm({
        name: table.name,
        jurisdiction: table.jurisdiction,
        effective_from: table.effective_from,
        is_active: table.is_active,
        taxable_base: table.taxable_base,
        secondary_rate: table.secondary_rate,
        non_resident_rate: table.non_resident_rate,
        source_url: table.source_url ?? '',
        notes: table.notes ?? '',
        auto_base_tax: true,
        bands: table.bands.map((b) => ({ ...b, upper_limit: b.upper_limit ?? '' })),
    });

    const setBand = (i: number, key: keyof Band, value: string) => form.setData('bands', form.data.bands.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)));

    // Keep bands continuous: each band starts where the previous ends.
    const chained = useMemo(() => {
        let cumulative = 0;
        return form.data.bands.map((b, i) => {
            const lower = i === 0 ? 0 : Number(form.data.bands[i - 1].upper_limit || 0);
            const upper = b.upper_limit === '' ? null : Number(b.upper_limit);
            const base = form.data.auto_base_tax ? cumulative : Number(b.base_tax || 0);
            if (upper !== null) cumulative = base + ((upper - lower) * Number(b.rate || 0)) / 100;
            return { lower, base };
        });
    }, [form.data.bands, form.data.auto_base_tax]);

    const err = form.errors as Record<string, string>;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const { confirmed } = await confirm({
            title: 'Save PAYE table?',
            text: 'Draft payrolls recalculated after this — and all new runs from the effective date — will use these bands. Approved payrolls are not changed.',
            confirmText: 'Save table',
        });
        if (!confirmed) return;
        form.transform((d) => ({
            ...d,
            bands: d.bands.map((b, i) => ({ ...b, lower_limit: String(chained[i].lower), upper_limit: b.upper_limit === '' ? null : b.upper_limit, base_tax: String(chained[i].base) })),
        }));
        form.put(`/payroll/statutory/tables/${table.id}`, { preserveScroll: true, onSuccess: onDone });
    };

    return (
        <form onSubmit={submit} className="space-y-5">
            <FormGrid cols={3}>
                <Input label="Table name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={err.name} />
                <Input label="Jurisdiction" value={form.data.jurisdiction} onChange={(e) => form.setData('jurisdiction', e.target.value)} error={err.jurisdiction} />
                <Input label="Effective from" type="date" value={form.data.effective_from} onChange={(e) => form.setData('effective_from', e.target.value)} error={err.effective_from} />
                <Select
                    label="Taxable income"
                    value={form.data.taxable_base}
                    onChange={(e) => form.setData('taxable_base', e.target.value as TaxTable['taxable_base'])}
                    options={[
                        { value: 'gross_less_pension', label: 'Gross less employee NSSF/pension' },
                        { value: 'gross', label: 'Gross pay' },
                    ]}
                />
                <Input label="Secondary employment flat rate (%)" type="number" step="0.001" value={form.data.secondary_rate} onChange={(e) => form.setData('secondary_rate', e.target.value)} error={err.secondary_rate} />
                <Input label="Non-resident flat rate (%)" type="number" step="0.001" value={form.data.non_resident_rate} onChange={(e) => form.setData('non_resident_rate', e.target.value)} error={err.non_resident_rate} />
            </FormGrid>

            <div className="table-responsive">
                <table className="table table-compact">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>From (above)</th>
                            <th>To (up to and including)</th>
                            <th>Rate %</th>
                            <th>Tax on lower bands</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {form.data.bands.map((b, i) => {
                            const isLast = i === form.data.bands.length - 1;
                            return (
                                <tr key={i}>
                                    <td className="font-bold">{i + 1}</td>
                                    <td>
                                        <input className="form-input form-input-sm w-32" value={num(chained[i].lower)} disabled />
                                    </td>
                                    <td>
                                        <input
                                            className="form-input form-input-sm w-36"
                                            type="number"
                                            min={0}
                                            placeholder={isLast ? 'No limit' : ''}
                                            value={b.upper_limit ?? ''}
                                            disabled={isLast}
                                            onChange={(e) => setBand(i, 'upper_limit', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input className="form-input form-input-sm w-24" type="number" step="0.001" min={0} max={100} value={b.rate} onChange={(e) => setBand(i, 'rate', e.target.value)} />
                                    </td>
                                    <td>
                                        <input
                                            className="form-input form-input-sm w-32"
                                            type="number"
                                            value={form.data.auto_base_tax ? String(Math.round(chained[i].base * 100) / 100) : b.base_tax}
                                            disabled={form.data.auto_base_tax}
                                            onChange={(e) => setBand(i, 'base_tax', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        {form.data.bands.length > 1 && (
                                            <button
                                                type="button"
                                                className="text-danger"
                                                title="Remove band"
                                                onClick={() => {
                                                    const next = form.data.bands.filter((_, idx) => idx !== i);
                                                    next[next.length - 1] = { ...next[next.length - 1], upper_limit: '' };
                                                    form.setData('bands', next);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {err.bands && <p className="form-error">{err.bands}</p>}

            <div className="flex flex-wrap items-center gap-4">
                <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                        const bands = [...form.data.bands];
                        const last = bands[bands.length - 1];
                        const prevUpper = bands.length > 1 ? Number(bands[bands.length - 2].upper_limit || 0) : 0;
                        bands[bands.length - 1] = { ...last, upper_limit: String(prevUpper + 250000) };
                        bands.push({ lower_limit: '', upper_limit: '', rate: last.rate, base_tax: '0' });
                        form.setData('bands', bands);
                    }}
                >
                    <Plus className="h-4 w-4" /> Add band
                </button>
                <Switch checked={form.data.auto_base_tax} onChange={(v) => form.setData('auto_base_tax', v)} label="Calculate 'tax on lower bands' automatically" />
                <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active" />
            </div>

            <FormGrid>
                <Input label="Source / legal reference URL" value={form.data.source_url} onChange={(e) => form.setData('source_url', e.target.value)} error={err.source_url} />
                <Textarea label="Notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} />
            </FormGrid>

            <div className="flex justify-center gap-3">
                <button type="button" className="btn btn-outline-dark" onClick={onDone}>
                    <X className="h-4 w-4" /> Cancel
                </button>
                <button className="btn btn-primary" disabled={form.processing}>
                    <Save className="h-4 w-4" /> Save table
                </button>
            </div>
        </form>
    );
}

function NewVersionModal({ open, onClose, copyFrom }: { open: boolean; onClose: () => void; copyFrom: TaxTable }) {
    const form = useForm({ name: `PAYE — Resident individuals (from ${new Date().getFullYear() + 1})`, effective_from: `${new Date().getFullYear() + 1}-07-01`, copy_from: String(copyFrom.id) });
    return (
        <Modal open={open} onClose={onClose} title="New PAYE table version">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post('/payroll/statutory/tables', { preserveScroll: true, onSuccess: onClose });
                }}
                className="space-y-4"
            >
                <p className="text-sm text-white-dark">
                    Use this when a Finance Act changes the bands. The new table starts as an inactive copy of <strong>{copyFrom.name}</strong>; edit the bands, then activate it. Payroll periods ending on or
                    after the effective date will use it automatically.
                </p>
                <Input label="Name" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                <Input label="Effective from" type="date" value={form.data.effective_from} onChange={(e) => form.setData('effective_from', e.target.value)} error={form.errors.effective_from} />
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        Create version
                    </button>
                </div>
            </form>
        </Modal>
    );
}

/* ------------------------------------------------------------------ */
/* Contributions                                                       */
/* ------------------------------------------------------------------ */

function describe(c: Component) {
    if (c.calculation === 'paye') return 'Per the PAYE table';
    if (c.calculation === 'fixed') return `${money(c.value, 'TZS')} per month`;
    return `${Number(c.value)}% of ${c.base} pay${c.cap_amount ? ` (max ${money(c.cap_amount, '')})` : ''}`;
}

function ContributionsTab({ components, staff, headcount, canManage, accounts }: { components: Component[]; staff: Staff[]; headcount: number; canManage: boolean; accounts: Option[] }) {
    const [editing, setEditing] = useState<Component | 'new' | null>(null);
    const [people, setPeople] = useState<{ component: Component; mode: 'exclude' | 'assign' } | null>(null);
    const probation = staff.filter((s) => s.on_probation).length;

    return (
        <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3 text-sm">
                    <span className="badge badge-soft-primary px-3! py-1.5!">
                        <Users className="h-4 w-4" /> {headcount} employees on record
                    </span>
                    <span className="badge badge-soft-warning px-3! py-1.5!">{probation} on probation</span>
                </div>
                {canManage && (
                    <button className="btn btn-primary" onClick={() => setEditing('new')}>
                        <Plus className="h-4 w-4" /> Add statutory item
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {components.map((c) => (
                    <div key={c.id} className={cn('panel flex flex-col', !c.is_active && 'opacity-60')}>
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h6 className="text-base font-bold">{c.name}</h6>
                                    {c.authority && <span className="badge badge-soft-info">{c.authority}</span>}
                                </div>
                                <div className="text-xs text-white-dark">
                                    {titleCase(c.type)} · {c.code}
                                    {!c.is_active && ' · inactive'}
                                </div>
                            </div>
                            <div className="text-end">
                                <div className="text-xl font-extrabold text-primary">{c.calculation === 'percent_of_basic' ? `${Number(c.value)}%` : c.calculation === 'paye' ? 'Bands' : num(c.value)}</div>
                            </div>
                        </div>
                        {c.description && <p className="mb-3 text-sm text-white-dark">{c.description}</p>}
                        <ul className="mb-4 space-y-1.5 text-sm">
                            <li>
                                <strong>Calculation:</strong> {describe(c)}
                            </li>
                            <li>
                                <strong>Applies to:</strong>{' '}
                                {c.applies_to_all ? `All staff${c.excluded_ids.length ? ` except ${c.excluded_ids.length} excluded` : ''}` : `${c.assigned_ids.length} selected staff`}
                                {c.exclude_on_probation && <span className="badge badge-soft-warning ms-2">Skips staff on probation</span>}
                            </li>
                            {c.min_employees && (
                                <li className="flex items-center gap-2">
                                    <strong>Threshold:</strong> payable when the school has ≥ {c.min_employees} employees
                                    <span className={cn('badge', c.threshold_met ? 'badge-soft-success' : 'badge-soft-dark')}>
                                        {c.threshold_met ? `Applies (${headcount})` : `Not due (${headcount})`}
                                    </span>
                                </li>
                            )}
                            <li>
                                <strong>Ledger account:</strong> {c.account ?? '—'}
                            </li>
                        </ul>
                        {canManage && (
                            <div className="mt-auto flex flex-wrap gap-2">
                                <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing(c)}>
                                    <Pencil className="h-3.5 w-3.5" /> Edit
                                </button>
                                {c.applies_to_all ? (
                                    <button className="btn btn-sm btn-outline-warning" onClick={() => setPeople({ component: c, mode: 'exclude' })}>
                                        <Users className="h-3.5 w-3.5" /> Exclusions ({c.excluded_ids.length})
                                    </button>
                                ) : (
                                    <button className="btn btn-sm btn-outline-success" onClick={() => setPeople({ component: c, mode: 'assign' })}>
                                        <Users className="h-3.5 w-3.5" /> Staff ({c.assigned_ids.length})
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {editing && <ComponentModal component={editing === 'new' ? null : editing} accounts={accounts} onClose={() => setEditing(null)} />}
            {people && <PeopleModal component={people.component} mode={people.mode} staff={staff} onClose={() => setPeople(null)} />}
        </>
    );
}

function ComponentModal({ component, accounts, onClose }: { component: Component | null; accounts: Option[]; onClose: () => void }) {
    const isPaye = component?.calculation === 'paye';
    const form = useForm({
        name: component?.name ?? '',
        code: component?.code ?? '',
        authority: component?.authority ?? '',
        description: component?.description ?? '',
        type: component?.type ?? 'deduction',
        calculation: component?.calculation ?? 'percent_of_basic',
        base: component?.base ?? 'gross',
        value: component?.value ?? '',
        min_employees: component?.min_employees ? String(component.min_employees) : '',
        cap_amount: component?.cap_amount ?? '',
        applies_to_all: component?.applies_to_all ?? true,
        exclude_on_probation: component?.exclude_on_probation ?? false,
        is_active: component?.is_active ?? true,
        account_id: component?.account_id ? String(component.account_id) : '',
    });
    const err = form.errors as Record<string, string>;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: onClose };
        if (component) form.put(`/payroll/statutory/components/${component.id}`, opts);
        else form.post('/payroll/statutory/components', opts);
    };

    return (
        <Modal open onClose={onClose} title={component ? `Edit ${component.name}` : 'Add statutory / government item'} size="lg">
            <form onSubmit={submit} className="space-y-4">
                <FormGrid>
                    <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={err.name} />
                    {!component && <Input label="Code" required value={form.data.code} onChange={(e) => form.setData('code', e.target.value.toUpperCase())} error={err.code} placeholder="e.g. TUGHE" />}
                    <Input label="Authority / recipient" value={form.data.authority} onChange={(e) => form.setData('authority', e.target.value)} placeholder="TRA, NSSF, WCF, HESLB, union…" />
                    {!isPaye && (
                        <>
                            <Select
                                label="Type"
                                value={form.data.type}
                                onChange={(e) => form.setData('type', e.target.value as Component['type'])}
                                options={[
                                    { value: 'deduction', label: 'Employee deduction' },
                                    { value: 'employer_contribution', label: 'Employer contribution' },
                                ]}
                                disabled={!!component}
                            />
                            <Select
                                label="Calculation"
                                value={form.data.calculation}
                                onChange={(e) => form.setData('calculation', e.target.value as Component['calculation'])}
                                options={[
                                    { value: 'percent_of_basic', label: 'Percentage' },
                                    { value: 'fixed', label: 'Fixed amount' },
                                ]}
                            />
                            {form.data.calculation === 'percent_of_basic' && (
                                <Select
                                    label="Percentage of"
                                    value={form.data.base}
                                    onChange={(e) => form.setData('base', e.target.value as Component['base'])}
                                    options={[
                                        { value: 'gross', label: 'Gross pay (basic + allowances)' },
                                        { value: 'basic', label: 'Basic salary' },
                                    ]}
                                />
                            )}
                            <Input
                                label={form.data.calculation === 'fixed' ? 'Amount per month (TZS)' : 'Rate (%)'}
                                type="number"
                                step="0.0001"
                                min={0}
                                value={form.data.value}
                                onChange={(e) => form.setData('value', e.target.value)}
                                error={err.value}
                            />
                            <Input
                                label="Monthly cap per employee (optional)"
                                type="number"
                                min={0}
                                value={form.data.cap_amount}
                                onChange={(e) => form.setData('cap_amount', e.target.value)}
                                error={err.cap_amount}
                            />
                            <Input
                                label="Minimum employees for it to apply (optional)"
                                type="number"
                                min={1}
                                value={form.data.min_employees}
                                onChange={(e) => form.setData('min_employees', e.target.value)}
                                error={err.min_employees}
                                help="e.g. SDL is only payable by employers with 10 or more employees."
                            />
                        </>
                    )}
                    <Select label="Ledger (liability) account" placeholder="Default: Accrued expenses" value={form.data.account_id} onChange={(e) => form.setData('account_id', e.target.value)} options={accounts} error={err.account_id} />
                </FormGrid>
                <Textarea label="Description" rows={2} value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} />
                <div className="flex flex-wrap gap-6">
                    <Switch checked={form.data.applies_to_all} onChange={(v) => form.setData('applies_to_all', v)} label="Applied to all staff" />
                    <Switch checked={form.data.exclude_on_probation} onChange={(v) => form.setData('exclude_on_probation', v)} label="Skip staff still on probation" />
                    <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Active" />
                </div>
                {isPaye && <p className="text-xs text-white-dark">PAYE rates are edited in the PAYE Table tab.</p>}
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        <ShieldCheck className="h-4 w-4" /> Save
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function PeopleModal({ component, mode, staff, onClose }: { component: Component; mode: 'exclude' | 'assign'; staff: Staff[]; onClose: () => void }) {
    const form = useForm({ employee_ids: mode === 'exclude' ? component.excluded_ids : component.assigned_ids, reason: '' });
    const [search, setSearch] = useState('');
    const visible = staff.filter((s) => `${s.name} ${s.employee_no} ${s.designation ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    const toggle = (id: number) => form.setData('employee_ids', form.data.employee_ids.includes(id) ? form.data.employee_ids.filter((x) => x !== id) : [...form.data.employee_ids, id]);

    return (
        <Modal open onClose={onClose} title={mode === 'exclude' ? `Exclude staff from ${component.name}` : `Staff ${component.name} applies to`} size="lg">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.put(`/payroll/statutory/components/${component.id}/${mode === 'exclude' ? 'exclusions' : 'assignments'}`, { preserveScroll: true, onSuccess: onClose });
                }}
                className="space-y-4"
            >
                <p className="text-sm text-white-dark">
                    {mode === 'exclude'
                        ? 'Ticked staff will not have this item calculated (e.g. not yet registered with NSSF, or on probation). Untick to include them again.'
                        : 'Tick the staff this item applies to (e.g. HESLB loan beneficiaries).'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <input className="form-input flex-1" placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    {mode === 'exclude' && (
                        <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => form.setData('employee_ids', Array.from(new Set([...form.data.employee_ids, ...staff.filter((s) => s.on_probation).map((s) => s.id)])))}>
                            Tick all on probation
                        </button>
                    )}
                </div>
                <div className="max-h-[50vh] divide-y divide-white-light overflow-y-auto rounded-md border border-white-light dark:divide-[#1b2e4b] dark:border-[#1b2e4b]">
                    {visible.map((s) => (
                        <label key={s.id} className="mb-0 flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-white-light/30 dark:hover:bg-[#1a2941]">
                            <input type="checkbox" className="form-checkbox" checked={form.data.employee_ids.includes(s.id)} onChange={() => toggle(s.id)} />
                            <span className="flex-1">
                                <span className="font-semibold">{s.name}</span> <span className="text-xs text-white-dark">· {s.employee_no} · {s.designation}</span>
                            </span>
                            {s.on_probation && <span className="badge badge-soft-warning">Probation to {date(s.probation_end_date)}</span>}
                        </label>
                    ))}
                </div>
                {mode === 'exclude' && <Input label="Reason (recorded in the audit trail)" value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} placeholder="e.g. Probation — NSSF registration pending" />}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{form.data.employee_ids.length} selected</span>
                    <div className="flex gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}

/* ------------------------------------------------------------------ */
/* Staff profile                                                       */
/* ------------------------------------------------------------------ */

function StaffTab({ staff, components, canManage }: { staff: Staff[]; components: Component[]; canManage: boolean }) {
    const [search, setSearch] = useState('');
    const rows = staff.filter((s) => `${s.name} ${s.employee_no} ${s.department ?? ''}`.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white-dark">Set each employee&apos;s PAYE status and probation end date. Items marked &ldquo;skip staff on probation&rdquo; are not deducted until probation ends.</p>
                <input className="form-input w-full sm:w-64" placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="table-responsive">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>TIN / NSSF no.</th>
                            <th>Tax status</th>
                            <th>Probation ends</th>
                            <th>Excluded from</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((s) => (
                            <StaffRow key={s.id} staff={s} excludedFrom={components.filter((c) => c.excluded_ids.includes(s.id)).map((c) => c.code ?? c.name)} canManage={canManage} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StaffRow({ staff, excludedFrom, canManage }: { staff: Staff; excludedFrom: string[]; canManage: boolean }) {
    const form = useForm({ tax_status: staff.tax_status, probation_end_date: staff.probation_end_date ?? '' });
    const dirty = form.data.tax_status !== staff.tax_status || (form.data.probation_end_date || null) !== staff.probation_end_date;

    return (
        <tr>
            <td>
                <div className="font-bold">{staff.name}</div>
                <div className="text-xs text-white-dark">
                    {staff.employee_no} · {staff.designation ?? '—'}
                </div>
            </td>
            <td className="text-xs">
                <div>TIN: {staff.tin ?? '—'}</div>
                <div>NSSF: {staff.nssf_no ?? <span className="text-danger">missing</span>}</div>
            </td>
            <td>
                <SearchSelect className="form-select form-select-sm min-w-[170px]" disabled={!canManage} value={form.data.tax_status} onChange={(e) => form.setData('tax_status', e.target.value)}>
                    {taxStatuses.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </SearchSelect>
            </td>
            <td>
                <div className="flex items-center gap-2">
                    <DateInput className="form-input form-input-sm w-40" disabled={!canManage} value={form.data.probation_end_date} onChange={(e) => form.setData('probation_end_date', e.target.value)} />
                    {staff.on_probation && <span className="badge badge-soft-warning">On probation</span>}
                </div>
            </td>
            <td>
                <div className="flex flex-wrap gap-1">
                    {excludedFrom.length ? excludedFrom.map((c) => <span key={c} className="badge badge-soft-danger">{c}</span>) : <span className="text-white-dark">—</span>}
                </div>
            </td>
            <td className="text-end!">
                {canManage && dirty && (
                    <button className="btn btn-sm btn-primary" disabled={form.processing} onClick={() => form.put(`/payroll/statutory/staff/${staff.id}`, { preserveScroll: true })}>
                        <Save className="h-3.5 w-3.5" /> Save
                    </button>
                )}
            </td>
        </tr>
    );
}
