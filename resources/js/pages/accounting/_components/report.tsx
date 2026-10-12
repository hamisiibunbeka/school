import { router, usePage } from '@inertiajs/react';
import { CheckCircle2, AlertTriangle, CalendarRange, Clock, Coins } from 'lucide-react';
import type { ReactNode } from 'react';
import Letterhead from '@/components/ui/letterhead';
import { toast } from '@/lib/swal';
import { cleanQuery, cn, date, dateTime } from '@/lib/utils';
import { DateInput, DateRangePicker } from '@/components/ui/date-picker';

export type Meta = { generated_at: string; generated_by: string | null; currency: string };

/** Accounting figure: thousands separators, 2 decimals, negatives in parentheses. */
export function fmt(value: string | number | null | undefined, decimals = 2): string {
    const n = Number(value ?? 0);
    if (!n) return '-';
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return n < 0 ? `(${s})` : s;
}

/** Same as fmt but shows 0.00 rather than a dash. */
export function fmtZero(value: string | number | null | undefined, decimals = 2): string {
    const n = Number(value ?? 0);
    return n === 0 ? (0).toFixed(decimals) : fmt(n, decimals);
}

export function Amt({ value, className, bold, zero }: { value: string | number | null | undefined; className?: string; bold?: boolean; zero?: boolean }) {
    const n = Number(value ?? 0);
    return <span className={cn('font-mono tabular-nums whitespace-nowrap', n < 0 && 'text-danger', bold && 'font-bold', className)}>{zero ? fmtZero(value) : fmt(value)}</span>;
}

export function pct(part: string | number, whole: string | number): string {
    const w = Number(whole);
    if (!w) return '—';
    return `${((Number(part) / w) * 100).toFixed(1)}%`;
}

/** Report overview: letterhead (print) + period / generation time / currency strip (SRS 4.23). */
export function ReportHeader({ title, period, meta, children }: { title: string; period: ReactNode; meta: Meta; children?: ReactNode }) {
    const { school } = usePage().props;
    return (
        <>
            <div className="print-only">
                <Letterhead title={title} meta={<div>{period}</div>} />
            </div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-white-light bg-[#fbfbfb] px-4 py-3 text-xs dark:border-[#1b2e4b] dark:bg-[#121c2c]">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-white-dark">
                    <span className="flex items-center gap-1.5">
                        <CalendarRange className="h-4 w-4 text-primary" />
                        <strong className="text-black dark:text-white-light">{period}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Coins className="h-4 w-4 text-warning" /> Currency: <strong className="text-black dark:text-white-light">{meta.currency || school?.currency}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-info" /> Generated {dateTime(meta.generated_at)}
                        {meta.generated_by ? ` by ${meta.generated_by}` : ''}
                    </span>
                </div>
                {children}
            </div>
        </>
    );
}

export function CheckBadge({ ok, okText, failText }: { ok: boolean; okText: string; failText: string }) {
    return ok ? (
        <span className="badge badge-soft-success inline-flex items-center gap-1 text-sm">
            <CheckCircle2 className="h-4 w-4" /> {okText}
        </span>
    ) : (
        <span className="badge badge-soft-danger inline-flex items-center gap-1 text-sm">
            <AlertTriangle className="h-4 w-4" /> {failText}
        </span>
    );
}

export function periodLabel(from: string | null | undefined, to: string) {
    return from ? `${date(from)} – ${date(to)}` : `As at ${date(to)}`;
}

/** Navigate the current report with new query params. */
export function go(path: string, query: Record<string, unknown>) {
    router.get(path, cleanQuery(query) as Record<string, string>, { preserveScroll: true, preserveState: false });
}

function iso(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Quick date presets for period reports. */
export function periodPresets(): { label: string; from: string; to: string }[] {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const q = Math.floor(m / 3);
    return [
        { label: 'This month', from: iso(new Date(y, m, 1)), to: iso(now) },
        { label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
        { label: 'This quarter', from: iso(new Date(y, q * 3, 1)), to: iso(now) },
        { label: 'Year to date', from: iso(new Date(y, 0, 1)), to: iso(now) },
        { label: 'Last year', from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) },
    ];
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="mb-0 flex flex-col gap-1 text-xs font-semibold text-white-dark">
            {label}
            <DateInput className="form-input w-full sm:w-40" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
    );
}

/** Period selector with presets (Today … Last year) and a custom range. */
export function RangeField({ label = 'Period', from, to, onChange }: { label?: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
    return (
        <div className="flex flex-col gap-1 text-xs font-semibold text-white-dark">
            {label}
            <DateRangePicker from={from} to={to} onChange={onChange} allowClear={false} placeholder="Choose period" />
        </div>
    );
}

const toneText ={ primary: 'text-primary', success: 'text-success', danger: 'text-danger', warning: 'text-warning', info: 'text-info', secondary: 'text-secondary' };

/** Thin coloured heading row inside statement tables. */
export function SectionRow({ title, cols, tone = 'primary' }: { title: string; cols: number; tone?: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'secondary' }) {
    return (
        <tr className="hover:bg-transparent!">
            <td colSpan={cols} className={cn('pt-5! pb-2! text-xs font-extrabold tracking-wider uppercase', toneText[tone])}>
                {title}
            </td>
        </tr>
    );
}

/** Surface server-side validation errors (e.g. maker-checker, closed period) from router calls as a toast. */
export function showErrors(errors: Record<string, string>) {
    const first = Object.values(errors)[0];
    if (first) toast(first, 'error');
}
