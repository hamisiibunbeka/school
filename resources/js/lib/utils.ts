import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Format a money value (decimal string or number from Laravel) e.g. "TZS 1,250,000". */
export function money(value: string | number | null | undefined, currency = 'TZS', decimals = 0): string {
    const n = Number(value ?? 0);
    const formatted = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return currency ? `${currency} ${formatted}` : formatted;
}

/** Plain number with thousands separators, optional decimals. */
export function num(value: string | number | null | undefined, decimals = 0): string {
    return Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Compact number e.g. 12.4M */
export function compact(value: string | number | null | undefined): string {
    return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function parseDate(value: string): Date {
    return new Date(value.length === 10 ? `${value}T00:00:00` : value);
}

/**
 * App-wide date format: dd/mm/yyyy (e.g. 12/10/2026).
 * Pass Intl options only for short labels such as chart axes ("12 Oct").
 */
export function date(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
    if (!value) return '—';
    const d = parseDate(value);
    if (Number.isNaN(d.getTime())) return value;
    if (opts) return d.toLocaleDateString('en-GB', opts);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Weekday + dd/mm/yyyy, e.g. "Monday, 12/10/2026" (or "Mon, 12/10/2026" when short). */
export function weekdayDate(value: string | null | undefined, style: 'long' | 'short' = 'long'): string {
    if (!value) return '—';
    const d = parseDate(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${d.toLocaleDateString('en-GB', { weekday: style })}, ${date(value)}`;
}

/** dd/mm/yyyy HH:mm (24-hour). */
export function dateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = parseDate(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${date(value)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initials(name: string | null | undefined): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function titleCase(value: string | null | undefined): string {
    if (!value) return '';
    return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Download rows as CSV entirely client-side. */
export function exportCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
    const csv = rows
        .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Build a query object without empty values (for filter forms). */
export function cleanQuery<T extends Record<string, unknown>>(query: T): Partial<T> {
    return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined)) as Partial<T>;
}
