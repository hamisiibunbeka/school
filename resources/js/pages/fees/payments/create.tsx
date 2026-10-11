import { Link, router, useForm, usePage } from '@inertiajs/react';
import { BookOpenText, CheckCircle2, Info, Phone, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import EmptyState from '@/components/ui/empty-state';
import { Field, FormGrid, Input, Select, Switch, Textarea } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { cn, date, money, titleCase, today } from '@/lib/utils';
import type { Option } from '@/types';
import { methodMeta } from '../_components/shared';
import StudentPicker from '../_components/student-picker';

type OpenInvoice = { id: number; invoice_no: string; term: string | null; issue_date: string; due_date: string | null; total: string; paid: string; balance: string; status: string };
type StudentContext = {
    id: number;
    full_name: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    residence_type: string;
    status: string;
    guardian: { name: string; phone: string } | null;
    balance: string;
    credit: string;
    invoices: OpenInvoice[];
    recent: { id: number; receipt_no: string; payment_date: string; amount: string; method: string; status: string }[];
};

type Props = {
    student: StudentContext | null;
    methods: Option[];
    accounts: (Option & { sub_type: string | null })[];
    defaultAccounts: Record<string, number | null>;
};

export default function CollectPayment({ student, methods, accounts, defaultAccounts }: Props) {
    const cur = usePage().props.school?.currency ?? 'TZS';
    const [manual, setManual] = useState(false);
    const form = useForm({
        student_id: student?.id ?? ('' as string | number),
        amount: '',
        method: 'mobile_money',
        reference: '',
        payer_name: student?.guardian?.name ?? '',
        deposit_account_id: String(defaultAccounts.mobile_money ?? ''),
        payment_date: today(),
        notes: '',
        allocations: [] as { invoice_id: number; amount: string }[],
    });
    const errors = form.errors as Record<string, string>;

    useEffect(() => {
        form.setData((d) => ({ ...d, student_id: student?.id ?? '', payer_name: student?.guardian?.name ?? '', allocations: [] }));
        setManual(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [student?.id]);

    const selectStudent = (id: number | null) => router.get('/fees/payments/create', id ? { student: id } : {}, { preserveScroll: true });

    const amount = Number(form.data.amount) || 0;

    // Preview how the amount will be applied (oldest invoice first) — mirrors the server rule.
    const autoPlan = useMemo(() => {
        let left = amount;
        const plan: Record<number, number> = {};
        (student?.invoices ?? []).forEach((inv) => {
            const take = Math.min(left, Number(inv.balance));
            plan[inv.id] = take > 0 ? take : 0;
            left -= plan[inv.id];
        });
        return { plan, excess: Math.max(0, left) };
    }, [amount, student]);

    const manualTotal = form.data.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const manualAmount = (id: number) => form.data.allocations.find((a) => a.invoice_id === id)?.amount ?? '';
    const setManualAmount = (id: number, value: string) => {
        const rest = form.data.allocations.filter((a) => a.invoice_id !== id);
        form.setData('allocations', value === '' ? rest : [...rest, { invoice_id: id, amount: value }]);
    };

    const changeMethod = (m: string) => form.setData((d) => ({ ...d, method: m, deposit_account_id: String(defaultAccounts[m] ?? ''), reference: m === 'cash' ? '' : d.reference }));

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, allocations: manual ? d.allocations.filter((a) => Number(a.amount) > 0) : [] }));
        form.post('/fees/payments', { preserveScroll: true });
    };

    const balanceAfter = Number(student?.balance ?? 0) - amount;

    return (
        <>
            <PageHeader
                title="Collect Payment"
                subtitle="Receive school fees, allocate them to invoices and issue an official receipt."
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Receipts', href: '/fees/payments' }, { title: 'Collect payment' }]}
            />

            {!student ? (
                <div className="panel mx-auto max-w-2xl py-10">
                    <div className="mb-6 text-center">
                        <span className="mx-auto mb-3 grid h-16 w-16 place-content-center rounded-full bg-primary-light text-primary dark:bg-primary-dark-light">
                            <Wallet className="h-8 w-8" />
                        </span>
                        <h4 className="text-xl font-bold text-black dark:text-white-light">Who is paying?</h4>
                        <p className="text-sm text-white-dark">Search by student name or admission number to see outstanding invoices.</p>
                    </div>
                    <StudentPicker currency={cur} autoFocus onSelect={(s) => selectStudent(s.id)} error={errors.student_id} />
                </div>
            ) : (
                <form onSubmit={submit} className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <div className="space-y-6 xl:col-span-2">
                        <div className="panel">
                            <div className="flex flex-wrap items-center gap-4">
                                <Avatar name={student.full_name} src={student.photo_url} className="h-14 w-14 text-base" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-lg font-bold text-black dark:text-white-light">{student.full_name}</div>
                                    <div className="text-sm text-white-dark">
                                        {student.admission_no} · {student.class || 'No class'} · {titleCase(student.residence_type)}
                                    </div>
                                    {student.guardian && (
                                        <div className="mt-0.5 flex items-center gap-1 text-xs text-white-dark">
                                            <Phone className="h-3 w-3" /> {student.guardian.name} · {student.guardian.phone}
                                        </div>
                                    )}
                                </div>
                                <div className="text-end">
                                    <div className="text-xs font-bold text-white-dark uppercase">Outstanding</div>
                                    <div className={cn('text-2xl font-extrabold', Number(student.balance) > 0 ? 'text-danger' : 'text-success')}>{money(student.balance, cur)}</div>
                                    {Number(student.credit) > 0 && <div className="text-xs text-info">Credit on account: {money(student.credit, cur)}</div>}
                                </div>
                                <div className="flex w-full gap-2 sm:w-auto">
                                    <Link href={`/fees/statements/${student.id}`} className="btn btn-sm btn-outline-info">
                                        <BookOpenText className="h-4 w-4" /> Statement
                                    </Link>
                                    <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => selectStudent(null)}>
                                        <X className="h-4 w-4" /> Change
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="panel">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h5 className="text-lg font-bold dark:text-white-light">Outstanding invoices</h5>
                                {student.invoices.length > 0 && <Switch checked={manual} onChange={setManual} label="Allocate manually" />}
                            </div>
                            {student.invoices.length === 0 ? (
                                <EmptyState title="No outstanding invoices" description="Any amount received will be held as credit and applied to the next invoice automatically." />
                            ) : (
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Invoice</th>
                                                <th>Due</th>
                                                <th className="text-end!">Total</th>
                                                <th className="text-end!">Balance</th>
                                                <th className="text-end!">{manual ? 'Allocate' : 'Will apply'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {student.invoices.map((inv) => (
                                                <tr key={inv.id}>
                                                    <td>
                                                        <Link href={`/fees/invoices/${inv.id}`} className="font-semibold text-primary hover:underline">
                                                            {inv.invoice_no}
                                                        </Link>
                                                        <div className="text-xs text-white-dark">
                                                            {inv.term ?? 'General'} · <StatusBadge status={inv.status} />
                                                        </div>
                                                    </td>
                                                    <td className={cn(inv.due_date && inv.due_date < today() && 'font-semibold text-danger')}>{date(inv.due_date)}</td>
                                                    <td className="text-end!">{money(inv.total, cur)}</td>
                                                    <td className="text-end! font-bold text-danger">{money(inv.balance, cur)}</td>
                                                    <td className="text-end!">
                                                        {manual ? (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={Number(inv.balance)}
                                                                className="form-input ms-auto w-32 text-end"
                                                                value={manualAmount(inv.id)}
                                                                onChange={(e) => setManualAmount(inv.id, e.target.value)}
                                                            />
                                                        ) : (
                                                            <span className={cn('font-semibold', autoPlan.plan[inv.id] > 0 ? 'text-success' : 'text-white-dark')}>
                                                                {autoPlan.plan[inv.id] > 0 ? money(autoPlan.plan[inv.id], cur) : '—'}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {errors.allocations && <p className="form-error mt-2">{errors.allocations}</p>}
                            <p className="mt-3 flex items-start gap-2 text-xs text-white-dark">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {manual
                                    ? `Allocated ${money(manualTotal, cur)} of ${money(amount, cur)}. Anything not allocated goes to the oldest open invoices, then stays as credit.`
                                    : 'Payments settle the oldest invoices first. Any excess is held as credit and applied automatically to the next invoice.'}
                            </p>
                        </div>

                        {student.recent.length > 0 && (
                            <div className="panel">
                                <h5 className="mb-3 text-lg font-bold dark:text-white-light">Recent receipts</h5>
                                <div className="divide-y divide-white-light dark:divide-[#1b2e4b]">
                                    {student.recent.map((r) => (
                                        <Link key={r.id} href={`/fees/payments/${r.id}`} className="flex items-center justify-between py-2 text-sm hover:text-primary">
                                            <span>
                                                <strong>{r.receipt_no}</strong> · {date(r.payment_date)} · {methodMeta[r.method]?.label ?? r.method}
                                            </span>
                                            <span className={cn('font-semibold', r.status === 'void' && 'line-through text-white-dark')}>{money(r.amount, cur)}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="panel space-y-4 self-start xl:sticky xl:top-24">
                        <h5 className="text-lg font-bold dark:text-white-light">Payment details</h5>
                        <Input
                            label={`Amount received (${cur})`}
                            type="number"
                            min={1}
                            required
                            autoFocus
                            className="py-3 text-xl font-bold"
                            value={form.data.amount}
                            onChange={(e) => form.setData('amount', e.target.value)}
                            error={errors.amount}
                        />
                        {Number(student.balance) > 0 && (
                            <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => form.setData('amount', String(Number(student.balance)))}>
                                Pay full balance ({money(student.balance, cur)})
                            </button>
                        )}
                        <Field label="Method" required error={errors.method}>
                            <div className="grid grid-cols-3 gap-2">
                                {methods.map((m) => {
                                    const meta = methodMeta[String(m.value)];
                                    const Icon = meta?.icon ?? Wallet;
                                    const on = form.data.method === m.value;
                                    return (
                                        <button
                                            key={m.value}
                                            type="button"
                                            onClick={() => changeMethod(String(m.value))}
                                            className={cn(
                                                'flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-semibold transition',
                                                on ? 'border-primary bg-primary-light text-primary dark:bg-primary-dark-light' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]',
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {meta?.label ?? m.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                        <Input
                            label="Transaction reference"
                            required={form.data.method !== 'cash'}
                            value={form.data.reference}
                            onChange={(e) => form.setData('reference', e.target.value.toUpperCase())}
                            error={errors.reference}
                            placeholder={form.data.method === 'mobile_money' ? 'e.g. SGH7K2L9QX' : form.data.method === 'cash' ? 'Optional' : 'Bank slip / transfer ref'}
                            help="Each reference can only be used once per method — this prevents duplicate posting."
                        />
                        <FormGrid>
                            <Input label="Payment date" type="date" required max={today()} value={form.data.payment_date} onChange={(e) => form.setData('payment_date', e.target.value)} error={errors.payment_date} />
                            <Input label="Paid by" value={form.data.payer_name} onChange={(e) => form.setData('payer_name', e.target.value)} error={errors.payer_name} />
                        </FormGrid>
                        <Select
                            label="Deposit account"
                            value={form.data.deposit_account_id}
                            onChange={(e) => form.setData('deposit_account_id', e.target.value)}
                            options={accounts}
                            placeholder="Default for method"
                            error={errors.deposit_account_id}
                        />
                        <Textarea label="Notes" rows={2} value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={errors.notes} />

                        <div className="rounded-md bg-[#f8f9fa] p-3 text-sm dark:bg-[#0e1726]">
                            <div className="flex justify-between">
                                <span className="text-white-dark">Balance before</span>
                                <span className="font-semibold">{money(student.balance, cur)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-white-dark">This payment</span>
                                <span className="font-semibold text-success">− {money(amount, cur)}</span>
                            </div>
                            <div className="mt-1 flex justify-between border-t border-white-light pt-1 dark:border-[#1b2e4b]">
                                <span className="font-bold">{balanceAfter < 0 ? 'Credit after' : 'Balance after'}</span>
                                <span className={cn('font-extrabold', balanceAfter > 0 ? 'text-danger' : 'text-success')}>{money(Math.abs(balanceAfter), cur)}</span>
                            </div>
                        </div>

                        <button className="btn btn-success w-full py-3 text-base" disabled={form.processing || amount <= 0}>
                            <CheckCircle2 className="h-5 w-5" /> Save & issue receipt
                        </button>
                    </div>
                </form>
            )}
        </>
    );
}
