import { useForm, usePage } from '@inertiajs/react';
import { CalendarClock, Info, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import EmptyState from '@/components/ui/empty-state';
import { FilterBar, FilterSelect, useFilters } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import { cn, date, num } from '@/lib/utils';
import type { Option } from '@/types';

type Installment = { name: string; percent: string; due_date: string };
type Props = {
    year: { id: number; name: string; start_date: string | null; end_date: string | null } | null;
    years: (Option & { is_current: boolean; installments: number })[];
    installments: Installment[];
    classes: { class: string; day: string; boarding: string }[];
};

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

/** Spread n installments evenly across the year, the last one taking the rounding remainder. */
function preset(n: number, start: string | null, end: string | null): Installment[] {
    const from = start ? new Date(`${start}T00:00:00`).getTime() : Date.now();
    const to = end ? new Date(`${end}T00:00:00`).getTime() : from + 300 * 86400000;
    const share = Math.floor((100 / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(from + ((to - from) * i) / n);
        return {
            name: `${ORDINAL[i]} installment`,
            percent: String(i === n - 1 ? Math.round((100 - share * (n - 1)) * 100) / 100 : share),
            due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        };
    });
}

export default function Installments({ year, years, installments, classes }: Props) {
    const can = useCan();
    const manage = can('fees.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const { filters, setFilter } = useFilters({ year: year ? String(year.id) : '' });
    const form = useForm({ academic_year_id: year?.id ?? '', installments });

    // Filters keep page state, so load the chosen year's plan into the form when the year changes.
    useEffect(() => {
        form.setData({ academic_year_id: year?.id ?? '', installments });
        form.clearErrors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [year?.id]);

    const rows = form.data.installments;
    const total = Math.round(rows.reduce((t, r) => t + (Number(r.percent) || 0), 0) * 100) / 100;
    const balanced = rows.length === 0 || total === 100;
    const first = rows[0];

    const setRow = (i: number, key: keyof Installment, value: string) => form.setData('installments', rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    const addRow = () => {
        const last = rows[rows.length - 1];
        form.setData('installments', [...rows, { name: `${ORDINAL[rows.length] ?? `${rows.length + 1}th`} installment`, percent: String(Math.max(0, Math.round((100 - total) * 100) / 100)), due_date: last?.due_date ?? year?.start_date ?? '' }]);
    };
    const removeRow = (i: number) => form.setData('installments', rows.filter((_, j) => j !== i));

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put('/fees/installments', { preserveScroll: true });
    };

    const errors = form.errors as Record<string, string>;

    return (
        <>
            <PageHeader
                title="Installment Settings"
                subtitle="How much of the year's fees is due by each date"
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Installment Settings' }]}
            />

            <div className="mb-6 flex items-start gap-3 rounded-md border border-info/30 bg-info-light p-4 text-sm dark:bg-info-dark-light">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" />
                <div className="text-black dark:text-white-light">
                    <strong>The 1st installment is the admission clearance amount.</strong> A newly admitted student stays out of the student directory until finance verifies
                    that share of the year's fees (for their class and residence, after discounts) is paid — or a head authorizes a payment agreement. Later installments are
                    the follow-up schedule shown on the clearance desk.
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <form onSubmit={submit} className="panel xl:col-span-2">
                    <FilterBar>
                        <FilterSelect
                            value={filters.year}
                            onChange={(v) => setFilter('year', v)}
                            options={years.map((y) => ({ value: y.value, label: `${y.label}${y.is_current ? ' (current)' : ''} · ${y.installments ? `${y.installments} installments` : 'not set'}` }))}
                            placeholder="Select academic year"
                        />
                    </FilterBar>

                    {!year ? (
                        <EmptyState title="No academic year" description="Create an academic year under Academics → Years & Terms first." />
                    ) : (
                        <>
                            {manage && (
                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-white-dark uppercase">Quick start</span>
                                    {[1, 2, 3, 4].map((n) => (
                                        <button key={n} type="button" className="btn btn-sm btn-outline-primary" onClick={() => form.setData('installments', preset(n, year.start_date, year.end_date))}>
                                            {n === 1 ? 'Pay in full' : `${n} equal installments`}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {rows.length === 0 ? (
                                <EmptyState
                                    title={`No installments for ${year.name}`}
                                    description="Without installment settings, an admitted student must pay their whole admission invoice to be cleared."
                                    action={
                                        manage && (
                                            <button type="button" className="btn btn-primary" onClick={addRow}>
                                                <Plus className="h-4 w-4" /> Add installment
                                            </button>
                                        )
                                    }
                                />
                            ) : (
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th className="w-10">#</th>
                                                <th>Name</th>
                                                <th className="w-36">Share (%)</th>
                                                <th className="w-44">Due by</th>
                                                <th className="w-12" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((r, i) => (
                                                <tr key={i}>
                                                    <td className="font-bold">{i + 1}</td>
                                                    <td>
                                                        <input className="form-input" value={r.name} disabled={!manage} onChange={(e) => setRow(i, 'name', e.target.value)} aria-label="Installment name" />
                                                        {errors[`installments.${i}.name`] && <p className="form-error">{errors[`installments.${i}.name`]}</p>}
                                                    </td>
                                                    <td>
                                                        <input
                                                            className="form-input"
                                                            type="number"
                                                            min={0.01}
                                                            max={100}
                                                            step="0.01"
                                                            value={r.percent}
                                                            disabled={!manage}
                                                            onChange={(e) => setRow(i, 'percent', e.target.value)}
                                                            aria-label="Share in percent"
                                                        />
                                                        {errors[`installments.${i}.percent`] && <p className="form-error">{errors[`installments.${i}.percent`]}</p>}
                                                    </td>
                                                    <td>
                                                        <DatePicker value={r.due_date} disabled={!manage} onValueChange={(v) => setRow(i, 'due_date', v)} aria-label="Due date" />
                                                        {errors[`installments.${i}.due_date`] && <p className="form-error">{errors[`installments.${i}.due_date`]}</p>}
                                                    </td>
                                                    <td className="text-end!">
                                                        {manage && (
                                                            <button type="button" className="text-danger hover:opacity-70" onClick={() => removeRow(i)} aria-label="Remove installment">
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td />
                                                <td className="font-bold">Total</td>
                                                <td className={cn('font-extrabold', balanced ? 'text-success' : 'text-danger')}>{num(total, 2)}%</td>
                                                <td colSpan={2} className="text-xs text-white-dark">
                                                    {balanced ? 'Shares add up to 100%.' : `Shares must add up to 100% (${num(100 - total, 2)}% ${total < 100 ? 'missing' : 'too much'}).`}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                            {errors.installments && <p className="form-error mt-2">{errors.installments}</p>}

                            {manage && (
                                <div className="mt-5 flex flex-wrap justify-between gap-3">
                                    {rows.length > 0 ? (
                                        <button type="button" className="btn btn-outline-primary" onClick={addRow} disabled={rows.length >= 12}>
                                            <Plus className="h-4 w-4" /> Add installment
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                    <button className="btn btn-primary" disabled={form.processing || !balanced}>
                                        <Save className="h-4 w-4" /> Save installments
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </form>

                <div className="panel">
                    <h5 className="mb-1 flex items-center gap-2 text-lg font-bold">
                        <CalendarClock className="h-5 w-5 text-primary" /> What parents pay
                    </h5>
                    <p className="mb-4 text-xs text-white-dark">Year's fees per class ({cur}) from the fee structures, before student discounts.</p>
                    {classes.length === 0 ? (
                        <EmptyState title="No fee structures" description={`Add fee lines for ${year?.name ?? 'this year'} to see installment amounts.`} />
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-compact">
                                <thead>
                                    <tr>
                                        <th>Class</th>
                                        <th className="text-end!">Year</th>
                                        <th className="text-end!">{first ? `${first.name} (${num(first.percent, 2)}%)` : 'To clear'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classes.map((c) =>
                                        (['day', 'boarding'] as const)
                                            .filter((r) => Number(c[r]) > 0)
                                            .map((r) => (
                                                <tr key={`${c.class}-${r}`}>
                                                    <td>
                                                        <div className="font-semibold">{c.class}</div>
                                                        <div className="text-[11px] text-white-dark">{r === 'day' ? 'Day scholar' : 'Boarder'}</div>
                                                    </td>
                                                    <td className="text-end! whitespace-nowrap">{num(c[r])}</td>
                                                    <td className="text-end! font-bold whitespace-nowrap text-primary">{num(first ? (Number(c[r]) * (Number(first.percent) || 0)) / 100 : Number(c[r]))}</td>
                                                </tr>
                                            )),
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {rows.length > 0 && (
                        <ol className="mt-5 space-y-2 border-t border-white-light pt-4 text-sm dark:border-[#1b2e4b]">
                            {rows.map((r, i) => (
                                <li key={i} className="flex justify-between gap-3">
                                    <span className="font-semibold">{r.name || `Installment ${i + 1}`}</span>
                                    <span className="text-white-dark">
                                        {num(r.percent, 2)}% by {date(r.due_date)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </>
    );
}
