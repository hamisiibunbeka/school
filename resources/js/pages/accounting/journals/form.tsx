import { Link, useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Lock, Plus, Save, Send, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormGrid, Input, Select } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { cn, today } from '@/lib/utils';
import type { Option } from '@/types';
import { fmtZero } from '../_components/report';

type AccountOption = Option & { type: string; is_control: boolean };
type Line = { account_id: string; debit: string; credit: string; narration: string };
type Journal = {
    id: number;
    journal_no: string;
    date: string;
    type: string;
    reference: string;
    narration: string;
    status: string;
    rejection_reason: string | null;
    lines: Line[];
};

const emptyLine = (): Line => ({ account_id: '', debit: '', credit: '', narration: '' });
const cents = (v: string) => Math.round((Number(v) || 0) * 100);

export default function JournalForm({ journal, accounts, types }: { journal: Journal | null; accounts: AccountOption[]; types: Option[] }) {
    const form = useForm({
        date: journal?.date ?? today(),
        type: journal?.type ?? 'general',
        reference: journal?.reference ?? '',
        narration: journal?.narration ?? '',
        action: 'draft',
        lines: journal?.lines?.length ? journal.lines : [emptyLine(), emptyLine()],
    });
    const errors = form.errors as Record<string, string>;

    const totalDr = form.data.lines.reduce((s, l) => s + cents(l.debit), 0);
    const totalCr = form.data.lines.reduce((s, l) => s + cents(l.credit), 0);
    const diff = totalDr - totalCr;
    const balanced = diff === 0 && totalDr > 0;
    const controlAllowed = ['opening', 'adjustment'].includes(form.data.type);

    const setLine = (i: number, key: keyof Line, value: string) => {
        const lines = form.data.lines.map((l, idx) => {
            if (idx !== i) return l;
            const next = { ...l, [key]: value };
            // A line carries either a debit or a credit.
            if (key === 'debit' && value) next.credit = '';
            if (key === 'credit' && value) next.debit = '';
            return next;
        });
        form.setData('lines', lines);
    };

    const addLine = () => form.setData('lines', [...form.data.lines, emptyLine()]);
    const removeLine = (i: number) => form.setData('lines', form.data.lines.filter((_, idx) => idx !== i));

    const balanceLine = (i: number) => {
        const others = form.data.lines.filter((_, idx) => idx !== i);
        const d = others.reduce((s, l) => s + cents(l.debit), 0) - others.reduce((s, l) => s + cents(l.credit), 0);
        if (d > 0) setLine(i, 'credit', (d / 100).toFixed(2));
        else if (d < 0) setLine(i, 'debit', (-d / 100).toFixed(2));
    };

    const save = (action: 'draft' | 'submit') => (e?: FormEvent) => {
        e?.preventDefault();
        form.transform((d) => ({ ...d, action }));
        if (journal) form.put(`/accounting/journals/${journal.id}`);
        else form.post('/accounting/journals');
    };

    return (
        <>
            <PageHeader
                title={journal ? `Edit journal ${journal.journal_no}` : 'New journal entry'}
                subtitle="Debits must equal credits. Submitted journals are posted only after approval by a different user."
                breadcrumbs={[{ title: 'Accounting' }, { title: 'Journals', href: '/accounting/journals' }, { title: journal ? journal.journal_no : 'New' }]}
            />

            {journal?.status === 'rejected' && journal.rejection_reason && (
                <div className="mb-5 flex items-start gap-3 rounded-md border border-danger/30 bg-danger-light p-4 text-danger dark:bg-danger-dark-light">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <div className="font-bold">Returned by the checker</div>
                        <div className="text-sm">{journal.rejection_reason}</div>
                    </div>
                </div>
            )}

            <form onSubmit={save('draft')} className="space-y-6">
                <div className="panel">
                    <FormGrid cols={4}>
                        <Input label="Transaction date" type="date" required value={form.data.date} onChange={(e) => form.setData('date', e.target.value)} error={errors.date} />
                        <Select label="Journal type" required value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} options={types} error={errors.type} />
                        <Input label="Reference" value={form.data.reference} onChange={(e) => form.setData('reference', e.target.value)} error={errors.reference} placeholder="Invoice, memo or document no." />
                        <Input label="Narration" required value={form.data.narration} onChange={(e) => form.setData('narration', e.target.value)} error={errors.narration} placeholder="What is this entry for?" />
                    </FormGrid>
                </div>

                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h5 className="text-lg font-bold text-black dark:text-white-light">Journal lines</h5>
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={addLine}>
                            <Plus className="h-4 w-4" /> Add line
                        </button>
                    </div>
                    {errors.lines && <div className="mb-4 rounded-md bg-danger-light p-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">{errors.lines}</div>}

                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="w-10">#</th>
                                    <th className="min-w-[260px]">Account</th>
                                    <th className="min-w-[200px]">Line narration</th>
                                    <th className="min-w-[150px] text-end!">Debit</th>
                                    <th className="min-w-[150px] text-end!">Credit</th>
                                    <th className="w-20" />
                                </tr>
                            </thead>
                            <tbody>
                                {form.data.lines.map((line, i) => {
                                    const acc = accounts.find((a) => String(a.value) === String(line.account_id));
                                    return (
                                        <tr key={i} className="align-top">
                                            <td className="pt-4! text-white-dark">{i + 1}</td>
                                            <td>
                                                <select className={cn('form-select', errors[`lines.${i}.account_id`] && 'border-danger')} value={line.account_id} onChange={(e) => setLine(i, 'account_id', e.target.value)}>
                                                    <option value="">Select account…</option>
                                                    {['asset', 'liability', 'equity', 'income', 'expense'].map((t) => (
                                                        <optgroup key={t} label={t[0].toUpperCase() + t.slice(1)}>
                                                            {accounts
                                                                .filter((a) => a.type === t)
                                                                .map((a) => (
                                                                    <option key={a.value} value={a.value}>
                                                                        {a.label}
                                                                        {a.is_control ? ' (control)' : ''}
                                                                    </option>
                                                                ))}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                                {acc?.is_control && (
                                                    <p className={cn('mt-1 flex items-center gap-1 text-xs', controlAllowed ? 'text-warning' : 'text-danger')}>
                                                        <Lock className="h-3 w-3" /> Control account{controlAllowed ? ' — allowed for this journal type' : ' — only opening/adjustment journals may post here'}
                                                    </p>
                                                )}
                                                {errors[`lines.${i}.account_id`] && <p className="form-error">{errors[`lines.${i}.account_id`]}</p>}
                                            </td>
                                            <td>
                                                <input className="form-input" value={line.narration} onChange={(e) => setLine(i, 'narration', e.target.value)} placeholder="Optional" />
                                            </td>
                                            <td>
                                                <input
                                                    className={cn('form-input text-end font-mono', errors[`lines.${i}.debit`] && 'border-danger')}
                                                    inputMode="decimal"
                                                    value={line.debit}
                                                    onChange={(e) => setLine(i, 'debit', e.target.value.replace(/[^0-9.]/g, ''))}
                                                    placeholder="0.00"
                                                />
                                                {errors[`lines.${i}.debit`] && <p className="form-error">{errors[`lines.${i}.debit`]}</p>}
                                            </td>
                                            <td>
                                                <input
                                                    className="form-input text-end font-mono"
                                                    inputMode="decimal"
                                                    value={line.credit}
                                                    onChange={(e) => setLine(i, 'credit', e.target.value.replace(/[^0-9.]/g, ''))}
                                                    placeholder="0.00"
                                                />
                                            </td>
                                            <td className="pt-3! whitespace-nowrap">
                                                <button type="button" title="Balance this line" className="btn btn-sm btn-outline-info px-2!" onClick={() => balanceLine(i)}>
                                                    =
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Remove line"
                                                    className="ms-1 inline-flex h-8 w-8 items-center justify-center rounded text-danger hover:bg-danger-light disabled:opacity-30"
                                                    disabled={form.data.lines.length <= 2}
                                                    onClick={() => removeLine(i)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-[#fbfbfb] dark:bg-[#121c2c]">
                                    <td colSpan={3} className="text-end! font-bold uppercase">
                                        Totals
                                    </td>
                                    <td className="text-end! font-mono font-extrabold">{fmtZero(totalDr / 100)}</td>
                                    <td className="text-end! font-mono font-extrabold">{fmtZero(totalCr / 100)}</td>
                                    <td />
                                </tr>
                                <tr>
                                    <td colSpan={3} className="text-end! font-bold uppercase">
                                        Difference
                                    </td>
                                    <td colSpan={2} className="text-end!">
                                        {balanced ? (
                                            <span className="badge badge-soft-success inline-flex items-center gap-1">
                                                <CheckCircle2 className="h-4 w-4" /> Balanced
                                            </span>
                                        ) : (
                                            <span className="badge badge-soft-danger inline-flex items-center gap-1 font-mono">
                                                <AlertTriangle className="h-4 w-4" /> {fmtZero(Math.abs(diff) / 100)} {diff > 0 ? 'more debit' : diff < 0 ? 'more credit' : ''}
                                            </span>
                                        )}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Link href={journal ? `/accounting/journals/${journal.id}` : '/accounting/journals'} className="btn btn-outline-dark">
                        Cancel
                    </Link>
                    <button type="submit" className="btn btn-outline-primary" disabled={form.processing || !balanced}>
                        <Save className="h-4 w-4" /> Save as draft
                    </button>
                    <button type="button" className="btn btn-primary" disabled={form.processing || !balanced} onClick={() => save('submit')()}>
                        <Send className="h-4 w-4" /> Submit for approval
                    </button>
                </div>
                {!balanced && <p className="text-end text-xs text-white-dark">The journal can be saved once total debits equal total credits.</p>}
            </form>
        </>
    );
}
