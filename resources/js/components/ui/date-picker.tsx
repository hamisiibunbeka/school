import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import flatpickr from 'flatpickr';
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js';
import type { Instance } from 'flatpickr/dist/types/instance';
import { CalendarDays, CalendarRange, Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date → "Y-m-d" (never via toISOString, which shifts by timezone). */
export function ymd(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DatePickerMode = 'date' | 'datetime' | 'month';

/** Stored value format (same as native inputs) vs. what users see and type (dd/mm/yyyy). */
const formats: Record<DatePickerMode, { value: string; display: string; placeholder: string }> = {
    date: { value: 'Y-m-d', display: 'd/m/Y', placeholder: 'dd/mm/yyyy' },
    datetime: { value: 'Y-m-d\\TH:i', display: 'd/m/Y H:i', placeholder: 'dd/mm/yyyy hh:mm' },
    month: { value: 'Y-m', display: 'm/Y', placeholder: 'mm/yyyy' },
};

/** "Y-m-d" → "dd/mm/yyyy" for labels. */
export function dmy(value?: string | null): string {
    const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Auto-insert slashes while typing: "12102026" → "12/10/2026" (dates only). */
function maskDate(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max'> & {
    value?: string | null;
    /** Native-compatible: receives an event-like object whose target.value is "Y-m-d" (or "" when cleared). */
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    /** Convenience callback with the plain value. */
    onValueChange?: (value: string) => void;
    mode?: DatePickerMode;
    min?: string | number;
    max?: string | number;
    clearable?: boolean;
    /** When empty, open the calendar at this "Y-m-d" (e.g. ~14 years ago for a date of birth). */
    openTo?: string;
};

/**
 * Flatpickr date picker that behaves like `<input type="date">`: the value is
 * "Y-m-d" (or "Y-m-dTH:i" / "Y-m"), while users see a friendly "12 Oct 2026".
 * Drop-in for native date inputs: value / onChange(e => e.target.value) work unchanged.
 */
export function DatePicker({ value, onChange, onValueChange, mode = 'date', min, max, clearable, openTo, className, placeholder, disabled, required, name, id, ...rest }: DatePickerProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const fp = useRef<Instance | null>(null);
    const handlers = useRef({ onChange, onValueChange, name, openTo });
    handlers.current = { onChange, onValueChange, name, openTo };

    useEffect(() => {
        if (!inputRef.current) return;
        const f = formats[mode];

        fp.current = flatpickr(inputRef.current, {
            dateFormat: f.value,
            altInput: true,
            altFormat: f.display,
            altInputClass: cn('form-input pe-9', className),
            // Users can type dd/mm/yyyy (parsed with altFormat on blur/enter) or pick from the calendar.
            allowInput: mode !== 'month',
            disableMobile: true,
            enableTime: mode === 'datetime',
            time_24hr: true,
            locale: { firstDayOfWeek: 1 },
            defaultDate: value || undefined,
            minDate: min ? String(min) : undefined,
            maxDate: max ? String(max) : undefined,
            plugins: mode === 'month' ? [monthSelectPlugin({ shorthand: true, dateFormat: 'Y-m', altFormat: 'm/Y' })] : [],
            onOpen: (selected, _str, instance) => {
                const target = handlers.current.openTo;
                if (!selected.length && target) instance.jumpToDate(target);
            },
            onChange: (_dates, str) => {
                const { onChange: change, onValueChange: valueChange, name: n } = handlers.current;
                change?.({ target: { value: str, name: n ?? '' }, currentTarget: { value: str, name: n ?? '' } } as unknown as ChangeEvent<HTMLInputElement>);
                valueChange?.(str);
            },
        }) as Instance;

        const alt = fp.current.altInput;
        if (alt) {
            alt.placeholder = placeholder || f.placeholder;
            alt.inputMode = 'numeric';
            alt.autocomplete = 'off';
            if (id) alt.id = id;
            if (mode === 'date') {
                alt.maxLength = 10;
                alt.addEventListener('input', () => {
                    const masked = maskDate(alt.value);
                    if (masked !== alt.value) alt.value = masked;
                });
            }
        }

        return () => {
            fp.current?.destroy();
            fp.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Keep the calendar in sync with controlled value / limits / state.
    useEffect(() => {
        const instance = fp.current;
        if (!instance) return;
        const current = instance.selectedDates[0] ? instance.formatDate(instance.selectedDates[0], formats[mode].value) : '';
        if ((value || '') !== current) instance.setDate(value || '', false);
    }, [value, mode]);

    useEffect(() => {
        fp.current?.set('minDate', min ? String(min) : undefined);
        fp.current?.set('maxDate', max ? String(max) : undefined);
    }, [min, max]);

    useEffect(() => {
        const alt = fp.current?.altInput;
        if (alt) {
            alt.disabled = !!disabled;
            alt.required = !!required;
            alt.className = cn('form-input pe-9', className);
            alt.placeholder = placeholder || formats[mode].placeholder;
        }
    }, [disabled, required, className, placeholder, mode]);

    const clear = () => {
        fp.current?.clear();
    };

    const showClear = (clearable ?? !required) && !!value && !disabled;

    return (
        <div className="relative w-full">
            {/* Hidden value carrier; flatpickr renders the visible dd/mm/yyyy input (altInput).
                Must be "hidden" here: React re-applies `type` on every render, which would un-hide a text input. */}
            <input ref={inputRef} name={name} {...rest} defaultValue={value ?? ''} type="hidden" />
            {showClear ? (
                <button type="button" onClick={clear} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-white-dark hover:text-danger" aria-label="Clear date" tabIndex={-1}>
                    <X className="h-4 w-4" />
                </button>
            ) : (
                <CalendarDays className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white-dark" />
            )}
        </div>
    );
}

/** Alias used where native `<input type="date">` elements were converted. */
export const DateInput = DatePicker;

/* -------------------------------------------------------------------------- */
/*  Date range with presets                                                   */
/* -------------------------------------------------------------------------- */

export type RangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year';

export const rangePresets: { key: RangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'this_week', label: 'This week' },
    { key: 'last_week', label: 'Last week' },
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_year', label: 'This year' },
    { key: 'last_year', label: 'Last year' },
];

/** Resolve a preset to [from, to] as "Y-m-d" (weeks start on Monday). */
export function presetRange(preset: RangePreset, now = new Date()): [string, string] {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = (d.getDay() + 6) % 7; // Monday = 0
    const add = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);

    switch (preset) {
        case 'today':
            return [ymd(d), ymd(d)];
        case 'yesterday':
            return [ymd(add(d, -1)), ymd(add(d, -1))];
        case 'this_week':
            return [ymd(add(d, -day)), ymd(add(d, 6 - day))];
        case 'last_week':
            return [ymd(add(d, -day - 7)), ymd(add(d, -day - 1))];
        case 'this_month':
            return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
        case 'last_month':
            return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
        case 'this_year':
            return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`];
        case 'last_year':
            return [`${d.getFullYear() - 1}-01-01`, `${d.getFullYear() - 1}-12-31`];
    }
}

export function matchPreset(from?: string | null, to?: string | null): RangePreset | null {
    if (!from || !to) return null;
    return rangePresets.find((p) => {
        const [f, t] = presetRange(p.key);
        return f === from && t === to;
    })?.key ?? null;
}

function rangeLabel(from?: string | null, to?: string | null, placeholder = 'All dates') {
    const preset = matchPreset(from, to);
    if (preset) return rangePresets.find((p) => p.key === preset)!.label;
    if (from && to) return from === to ? dmy(from) : `${dmy(from)} – ${dmy(to)}`;
    if (from) return `From ${dmy(from)}`;
    if (to) return `Until ${dmy(to)}`;
    return placeholder;
}

/**
 * Date-range dropdown: quick presets (Today … Last year) plus a custom range calendar.
 *   <DateRangePicker from={filters.from} to={filters.to} onChange={(from, to) => ...} />
 */
export function DateRangePicker({
    from,
    to,
    onChange,
    placeholder = 'All dates',
    allowClear = true,
    className,
    label,
    align = 'start',
}: {
    from?: string | null;
    to?: string | null;
    onChange: (from: string, to: string) => void;
    placeholder?: string;
    allowClear?: boolean;
    className?: string;
    label?: string;
    align?: 'start' | 'end';
}) {
    const active = useMemo(() => matchPreset(from, to), [from, to]);
    const [custom, setCustom] = useState(false);

    return (
        <div className={cn('w-full sm:w-auto', className)}>
            {label && <span className="mb-1 block text-xs font-bold tracking-wide text-white-dark uppercase">{label}</span>}
            <Popover className="relative">
                {({ close }) => (
                    <>
                        <PopoverButton className="form-input flex w-full items-center gap-2 text-start sm:min-w-[230px]" onClick={() => setCustom(!active && !!(from || to))}>
                            <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
                            <span className={cn('flex-1 truncate', !from && !to && 'font-normal text-white-dark')}>{rangeLabel(from, to, placeholder)}</span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-white-dark" />
                        </PopoverButton>
                        <PopoverPanel
                            anchor={{ to: align === 'end' ? 'bottom end' : 'bottom start', gap: 6 }}
                            className="z-[70] flex flex-col rounded-md bg-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] ring-1 ring-black/5 sm:flex-row dark:bg-[#1b2e4b]"
                        >
                            <ul className="min-w-[180px] border-white-light py-2 sm:border-e dark:border-[#253b5c]">
                                {rangePresets.map((p) => (
                                    <li key={p.key}>
                                        <button
                                            type="button"
                                            className={cn('dropdown-item justify-between text-sm font-semibold', active === p.key && 'text-primary')}
                                            onClick={() => {
                                                const [f, t] = presetRange(p.key);
                                                onChange(f, t);
                                                setCustom(false);
                                                close();
                                            }}
                                        >
                                            {p.label}
                                            {active === p.key && <Check className="h-4 w-4" />}
                                        </button>
                                    </li>
                                ))}
                                <li className="mt-1 border-t border-white-light pt-1 dark:border-[#253b5c]">
                                    <button type="button" className={cn('dropdown-item text-sm font-semibold', custom && 'text-primary')} onClick={() => setCustom(true)}>
                                        Custom range…
                                    </button>
                                </li>
                                {allowClear && (from || to) && (
                                    <li>
                                        <button
                                            type="button"
                                            className="dropdown-item text-sm font-semibold text-danger"
                                            onClick={() => {
                                                onChange('', '');
                                                setCustom(false);
                                                close();
                                            }}
                                        >
                                            Clear dates
                                        </button>
                                    </li>
                                )}
                            </ul>
                            {custom && (
                                <CustomRange
                                    from={from}
                                    to={to}
                                    onApply={(f, t) => {
                                        onChange(f, t);
                                        close();
                                    }}
                                />
                            )}
                        </PopoverPanel>
                    </>
                )}
            </Popover>
        </div>
    );
}

function CustomRange({ from, to, onApply }: { from?: string | null; to?: string | null; onApply: (from: string, to: string) => void }) {
    const host = useRef<HTMLInputElement>(null);
    const [range, setRange] = useState<[string, string]>([from ?? '', to ?? '']);

    useEffect(() => {
        if (!host.current) return;
        const instance = flatpickr(host.current, {
            inline: true,
            mode: 'range',
            dateFormat: 'Y-m-d',
            showMonths: window.matchMedia('(min-width: 768px)').matches ? 2 : 1,
            locale: { firstDayOfWeek: 1 },
            defaultDate: [from, to].filter(Boolean) as string[],
            onChange: (dates) => {
                if (dates.length === 2) setRange([ymd(dates[0]), ymd(dates[1])]);
                else if (dates.length === 1) setRange([ymd(dates[0]), '']);
            },
        }) as Instance;
        return () => instance.destroy();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="p-3">
            <input ref={host} type="text" className="hidden" readOnly />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white-dark">
                    {range[0] ? dmy(range[0]) : 'Start'} → {range[1] ? dmy(range[1]) : 'End'}
                </span>
                <button type="button" className="btn btn-sm btn-primary" disabled={!range[0]} onClick={() => onApply(range[0], range[1] || range[0])}>
                    Apply
                </button>
            </div>
        </div>
    );
}
