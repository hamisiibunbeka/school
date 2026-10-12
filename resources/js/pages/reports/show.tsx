import { Link, router, usePage } from '@inertiajs/react';
import type { ApexOptions } from 'apexcharts';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Bookmark, CalendarRange, Download, Info, Loader2, Play, Printer, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import Chart from '@/components/ui/chart';
import { DatePicker, DateRangePicker } from '@/components/ui/date-picker';
import EmptyState from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/filters';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { toast } from '@/lib/swal';
import { cleanQuery, cn, compact, money, num } from '@/lib/utils';
import {
    FavouriteStar,
    FormattedCell,
    isNumeric,
    plainValue,
    reportIcon,
    useFavourites,
    useSavedFilters,
    type Cell,
    type ReportColumn,
    type ReportRow,
} from './_components/report-kit';
import SearchSelect from '@/components/ui/search-select';

type FilterOption = { value: string | number; label: string; parent?: string | number | null };
type FilterDef = {
    key: string;
    label: string;
    type: 'date' | 'select' | 'number' | 'text';
    options?: FilterOption[];
    default?: string;
    placeholder?: string | null;
    dependsOn?: string;
    min?: number;
    max?: number;
};

type Summary = { label: string; value: Cell; format: 'money' | 'number' | 'percent' | 'text'; tone: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info'; icon: string };

type ChartSpec = {
    type: 'bar' | 'line' | 'area' | 'donut' | 'pie';
    categories?: string[];
    labels?: string[];
    series: { name: string; data: number[] }[] | number[];
    format?: 'money' | 'percent' | 'number';
    stacked?: boolean;
    horizontal?: boolean;
};

type Props = {
    report: { key: string; title: string; description: string; category: string; icon: string };
    category: string;
    definitions: FilterDef[];
    filters: Record<string, string>;
    result: {
        columns: ReportColumn[];
        rows: ReportRow[];
        totals: ReportRow | null;
        summary: Summary[];
        chart: ChartSpec | null;
        note: string | null;
        truncated: boolean;
    };
    meta: { school: string | null; period: string; filters: { label: string; value: string }[]; generated_at: string; generated_by: string; currency: string };
};

const PAGE_SIZES = [25, 50, 100, 0];

export default function ReportShow({ report, category, definitions, filters, result, meta }: Props) {
    const { school } = usePage().props;
    const currency = meta.currency || school?.currency || 'TZS';
    const { isFavourite, toggle } = useFavourites();
    const saved = useSavedFilters(report.key);
    const Icon = reportIcon(report.icon);

    const [values, setValues] = useState<Record<string, string>>(filters);
    const [processing, setProcessing] = useState(false);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
    const [pageSize, setPageSize] = useState(50);
    const [page, setPage] = useState(1);
    const [hasSaved, setHasSaved] = useState(false);

    // Keep the form in sync with what the server actually ran.
    useEffect(() => {
        setValues(filters);
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(filters)]);

    // Apply saved filters when the report is opened without an explicit query.
    useEffect(() => {
        const stored = saved.read();
        setHasSaved(!!stored);
        if (stored && window.location.search === '' && JSON.stringify(cleanQuery(stored)) !== JSON.stringify(cleanQuery(filters))) {
            run(stored, true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [report.key]);

    // Print every row, not just the current page.
    useEffect(() => {
        let previous = pageSize;
        const before = () => {
            previous = pageSize;
            flushSync(() => setPageSize(0));
        };
        const after = () => setPageSize(previous || 50);
        window.addEventListener('beforeprint', before);
        window.addEventListener('afterprint', after);
        return () => {
            window.removeEventListener('beforeprint', before);
            window.removeEventListener('afterprint', after);
        };
    }, [pageSize]);

    const run = (next: Record<string, string>, replace = false) => {
        router.get(`/reports/${report.key}`, cleanQuery(next) as Record<string, string>, {
            preserveScroll: true,
            preserveState: true,
            replace,
            onStart: () => setProcessing(true),
            onFinish: () => setProcessing(false),
        });
    };

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        run(values);
    };

    const resetFilters = () => {
        const defaults = Object.fromEntries(definitions.map((d) => [d.key, d.default ?? '']));
        setValues(defaults);
        run(defaults);
    };

    const setValue = (key: string, value: string) => {
        setValues((v) => {
            const next = { ...v, [key]: value };
            definitions.filter((d) => d.dependsOn === key).forEach((d) => (next[d.key] = ''));
            return next;
        });
    };

    const saveDefaults = () => {
        saved.save(values);
        setHasSaved(true);
        toast('Filters saved — they will load next time you open this report.', 'success');
    };

    const clearSaved = () => {
        saved.clear();
        setHasSaved(false);
        toast('Saved filters cleared.', 'info');
    };

    const hasRange = definitions.some((d) => d.key === 'from') && definitions.some((d) => d.key === 'to');

    const exportUrl = `/reports/${report.key}/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`;
    const dirty = JSON.stringify(cleanQuery(values)) !== JSON.stringify(cleanQuery(filters));

    // ------------------------------------------------------------------ table data
    const columns = result.columns;
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        let rows = result.rows;
        if (term) {
            rows = rows.filter((r) => columns.some((c) => plainValue(r[c.key], c.type, currency).toLowerCase().includes(term)));
        }
        if (sort) {
            const col = columns.find((c) => c.key === sort.key);
            const numeric = col ? isNumeric(col.type) : false;
            rows = [...rows].sort((a, b) => {
                const av = a[sort.key];
                const bv = b[sort.key];
                if (av === bv) return 0;
                if (av === null || av === undefined || av === '') return 1;
                if (bv === null || bv === undefined || bv === '') return -1;
                const cmp = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), undefined, { numeric: true });
                return sort.dir === 'asc' ? cmp : -cmp;
            });
        }
        return rows;
    }, [result.rows, columns, search, sort, currency]);

    const pages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
    const current = Math.min(page, pages);
    const pageRows = pageSize ? filtered.slice((current - 1) * pageSize, current * pageSize) : filtered;

    const toggleSort = (key: string) => {
        setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
        setPage(1);
    };

    const formatSummary = (s: Summary) => {
        if (s.value === null || s.value === undefined || s.value === '') return '—';
        if (s.format === 'money') return money(s.value as number, currency);
        if (s.format === 'percent') return `${num(s.value as number, 1)}%`;
        if (s.format === 'number') return num(s.value as number);
        return String(s.value);
    };

    return (
        <>
            <PageHeader
                title={report.title}
                subtitle={report.description}
                breadcrumbs={[{ title: 'Reports', href: '/reports' }, { title: category }, { title: report.title }]}
                actions={
                    <>
                        <Link href="/reports" className="btn btn-outline-dark">
                            <ArrowLeft className="h-4 w-4" /> Catalogue
                        </Link>
                        <FavouriteStar active={isFavourite(report.key)} onClick={() => toggle(report.key)} className="h-10 w-10 border border-white-light dark:border-[#253b5c]" />
                        <a href={exportUrl} className={cn('btn btn-outline-primary', result.rows.length === 0 && 'pointer-events-none opacity-50')}>
                            <Download className="h-4 w-4" /> Export CSV
                        </a>
                        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                            <Printer className="h-4 w-4" /> Print
                        </button>
                    </>
                }
            />

            {/* ------------------------------------------------------------ filters */}
            {definitions.length > 0 && (
                <form onSubmit={submit} className="panel no-print sticky top-[60px] z-30 mb-6 border border-white-light/60 shadow-lg shadow-black/5 dark:border-[#1b2e4b]">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-5">
                            {definitions.map((d) => {
                                // A from/to pair renders as one period dropdown (Today … Last year, custom range).
                                if (d.key === 'to' && hasRange) return null;
                                if (d.key === 'from' && hasRange) {
                                    return (
                                        <DateRangePicker
                                            key="period"
                                            label="Period"
                                            from={values.from ?? ''}
                                            to={values.to ?? ''}
                                            onChange={(from, to) => {
                                                const next = { ...values, from, to };
                                                setValues(next);
                                                run(next);
                                            }}
                                        />
                                    );
                                }
                                return <FilterControl key={d.key} def={d} value={values[d.key] ?? ''} parentValue={d.dependsOn ? values[d.dependsOn] ?? '' : ''} onChange={(v) => setValue(d.key, v)} />;
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="submit" className={cn('btn btn-primary', dirty && 'animate-pulse')} disabled={processing}>
                                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run report
                            </button>
                            <button type="button" className="btn btn-outline-dark" onClick={resetFilters} title="Reset to defaults">
                                <RotateCcw className="h-4 w-4" />
                            </button>
                            <button type="button" className={cn('btn', hasSaved ? 'btn-outline-warning' : 'btn-outline-secondary')} onClick={saveDefaults} title="Save these filters as my default">
                                <Bookmark className={cn('h-4 w-4', hasSaved && 'fill-current')} />
                            </button>
                            {hasSaved && (
                                <button type="button" className="text-xs font-semibold text-white-dark hover:text-danger" onClick={clearSaved}>
                                    Clear saved
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            )}

            <div className={cn('transition-opacity', processing && 'pointer-events-none opacity-60')}>
                {/* -------------------------------------------------------- print header */}
                <div className="print-only">
                    <Letterhead
                        title={report.title}
                        meta={
                            <>
                                <div>
                                    <b>Period:</b> {meta.period}
                                </div>
                                <div>
                                    <b>Generated:</b> {meta.generated_at}
                                </div>
                            </>
                        }
                    />
                </div>

                {/* -------------------------------------------------------- metadata block (SRS 4.23) */}
                <div className="mb-6 overflow-hidden rounded-md border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent dark:border-primary/30 print:mb-4 print:border-dark/30">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <span className="grid h-10 w-10 place-content-center rounded-lg bg-primary text-white print:hidden">
                                <Icon className="h-5 w-5" />
                            </span>
                            <MetaItem label="Reporting period" value={meta.period} icon />
                        </div>
                        <MetaItem label="Generated at" value={meta.generated_at} />
                        <MetaItem label="Generated by" value={meta.generated_by} />
                        <MetaItem label="Currency" value={currency} />
                        <MetaItem label="Records" value={num(result.rows.length)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-primary/10 px-5 py-2.5 text-xs">
                        <span className="font-bold tracking-wide text-white-dark uppercase">Filters</span>
                        {meta.filters.length === 0 ? (
                            <span className="text-white-dark">None — all records</span>
                        ) : (
                            meta.filters.map((f) => (
                                <span key={f.label} className="rounded-full bg-white px-2.5 py-1 font-semibold shadow-sm dark:bg-[#1b2e4b]">
                                    <span className="text-white-dark">{f.label}:</span> <span className="text-black dark:text-white-light">{f.value}</span>
                                </span>
                            ))
                        )}
                    </div>
                </div>

                {/* -------------------------------------------------------- summary */}
                {result.summary.length > 0 && (
                    <div className={cn('mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2', result.summary.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3', result.summary.length >= 5 && '2xl:grid-cols-5')}>
                        {result.summary.map((s) => (
                            <StatCard key={s.label} title={s.label} value={formatSummary(s)} icon={reportIcon(s.icon)} tone={s.tone} />
                        ))}
                    </div>
                )}

                {/* -------------------------------------------------------- chart */}
                {result.chart && result.rows.length > 0 && (
                    <div className="panel mb-6 print:break-inside-avoid">
                        <h5 className="mb-2 text-base font-bold text-black dark:text-white-light">Overview</h5>
                        <ReportChart spec={result.chart} currency={currency} />
                    </div>
                )}

                {/* -------------------------------------------------------- table */}
                <div className="panel">
                    {result.note && (
                        <div className="mb-4 flex items-start gap-2 rounded-md bg-info-light px-4 py-2.5 text-sm text-info dark:bg-info-dark-light">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {result.note}
                        </div>
                    )}
                    {result.truncated && (
                        <div className="mb-4 rounded-md bg-warning-light px-4 py-2.5 text-sm text-warning dark:bg-warning-dark-light">
                            Only the first 5,000 rows are shown on screen. Export to CSV for the complete dataset.
                        </div>
                    )}

                    {result.rows.length > 0 && (
                        <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <SearchInput
                                value={search}
                                onChange={(v) => {
                                    setSearch(v);
                                    setPage(1);
                                }}
                                placeholder="Search within results…"
                            />
                            <div className="flex items-center gap-2 text-sm text-white-dark">
                                <span>
                                    {num(filtered.length)} of {num(result.rows.length)} rows
                                </span>
                                <SearchSelect
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setPage(1);
                                    }}
                                    className="form-select w-auto py-1.5"
                                >
                                    {PAGE_SIZES.map((s) => (
                                        <option key={s} value={s}>
                                            {s ? `${s} / page` : 'Show all'}
                                        </option>
                                    ))}
                                </SearchSelect>
                            </div>
                        </div>
                    )}

                    {columns.length === 0 || result.rows.length === 0 ? (
                        <EmptyState
                            title={result.note && columns.length === 0 ? 'Nothing to show yet' : 'No records for these filters'}
                            description={
                                result.note && columns.length === 0
                                    ? result.note
                                    : 'Try widening the date range or clearing some filters. Modules without data yet also show empty reports.'
                            }
                            action={
                                definitions.length > 0 && (
                                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={resetFilters}>
                                        <RotateCcw className="h-4 w-4" /> Reset filters
                                    </button>
                                )
                            }
                        />
                    ) : (
                        <>
                            <div className="table-responsive">
                                <table className="table-striped table-compact table">
                                    <thead>
                                        <tr>
                                            {columns.map((c) => (
                                                <th key={c.key} className={cn('whitespace-nowrap', isNumeric(c.type) && 'text-end!')}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSort(c.key)}
                                                        className={cn('inline-flex items-center gap-1 font-bold hover:text-primary', isNumeric(c.type) && 'flex-row-reverse')}
                                                    >
                                                        {c.label}
                                                        <SortIcon active={sort?.key === c.key ? sort.dir : null} />
                                                    </button>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={columns.length} className="py-8 text-center text-white-dark">
                                                    No rows match “{search}”.
                                                </td>
                                            </tr>
                                        ) : (
                                            pageRows.map((row, i) => (
                                                <tr key={i}>
                                                    {columns.map((c) => (
                                                        <td key={c.key} className={cn(isNumeric(c.type) && 'text-end!', c.type === 'text' && 'max-w-[320px]')}>
                                                            <FormattedCell value={row[c.key]} type={c.type} currency={currency} />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    {result.totals && !search && (
                                        <tfoot>
                                            <tr className="border-t-2 border-primary/30 bg-primary/5 font-extrabold dark:bg-primary/10">
                                                {columns.map((c) => (
                                                    <td key={c.key} className={cn('font-extrabold', isNumeric(c.type) && 'text-end!')}>
                                                        {result.totals![c.key] !== undefined && result.totals![c.key] !== null ? (
                                                            <FormattedCell value={result.totals![c.key]} type={c.type === 'badge' || c.type === 'date' ? 'text' : c.type} currency={currency} strong />
                                                        ) : null}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>

                            {pageSize > 0 && pages > 1 && (
                                <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                                    <span className="text-white-dark">
                                        Page {current} of {pages}
                                    </span>
                                    <div className="flex gap-1">
                                        <button type="button" className="btn btn-sm btn-outline-primary" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                                            Previous
                                        </button>
                                        <button type="button" className="btn btn-sm btn-outline-primary" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <div className="mt-6 hidden border-t border-dark/20 pt-3 text-[11px] text-white-dark print:block">
                        {meta.school} · {report.title} · Period: {meta.period} · Generated {meta.generated_at} by {meta.generated_by} · Amounts in {currency}
                    </div>
                </div>
            </div>
        </>
    );
}

function MetaItem({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
    return (
        <div>
            <div className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-white-dark uppercase">
                {icon && <CalendarRange className="h-3 w-3" />} {label}
            </div>
            <div className="text-sm font-bold text-black dark:text-white-light">{value}</div>
        </div>
    );
}

function SortIcon({ active }: { active: 'asc' | 'desc' | null }) {
    if (active === 'asc') return <ArrowUp className="h-3 w-3 text-primary" />;
    if (active === 'desc') return <ArrowDown className="h-3 w-3 text-primary" />;
    return <ArrowUpDown className="h-3 w-3 opacity-30" />;
}

function FilterControl({ def, value, parentValue, onChange }: { def: FilterDef; value: string; parentValue: string; onChange: (v: string) => void }) {
    const label = <span className="mb-1 block text-xs font-bold tracking-wide text-white-dark uppercase">{def.label}</span>;

    if (def.type === 'select') {
        const options = (def.options ?? []).filter((o) => !def.dependsOn || !parentValue || String(o.parent) === String(parentValue));
        return (
            <label className="block">
                {label}
                <SearchSelect value={value} onChange={(e) => onChange(e.target.value)} className="form-select">
                    {def.placeholder !== null && <option value="">{def.placeholder ?? 'All'}</option>}
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </SearchSelect>
            </label>
        );
    }

    if (def.type === 'date') {
        return (
            <label className="block">
                {label}
                <DatePicker value={value} min={def.min} max={def.max} onValueChange={onChange} />
            </label>
        );
    }

    return (
        <label className="block">
            {label}
            <input
                type={def.type === 'number' ? 'number' : 'text'}
                value={value}
                min={def.min}
                max={def.max}
                onChange={(e) => onChange(e.target.value)}
                className="form-input"
            />
        </label>
    );
}

function ReportChart({ spec, currency }: { spec: ChartSpec; currency: string }) {
    const fmt = (v: number) => (spec.format === 'money' ? money(v, currency) : spec.format === 'percent' ? `${num(v, 1)}%` : num(v, Number.isInteger(v) ? 0 : 1));
    const axisFmt = (v: number) => (spec.format === 'money' ? compact(v) : spec.format === 'percent' ? `${num(v, 0)}%` : num(v, Number.isInteger(v) ? 0 : 1));

    if (spec.type === 'donut' || spec.type === 'pie') {
        const series = spec.series as number[];
        const options: ApexOptions = {
            labels: spec.labels ?? [],
            legend: { position: 'bottom', horizontalAlign: 'center' },
            dataLabels: { enabled: true, formatter: (v: number) => `${v.toFixed(1)}%` },
            tooltip: { y: { formatter: fmt } },
            plotOptions: {
                pie: {
                    donut: {
                        size: '68%',
                        labels: {
                            show: true,
                            total: { show: true, label: 'Total', formatter: (w) => axisFmt(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)) },
                        },
                    },
                },
            },
        };
        return <Chart type={spec.type} series={series} options={options} height={340} />;
    }

    const series = spec.series as { name: string; data: number[] }[];
    const many = (spec.categories?.length ?? 0) > 12;
    const options: ApexOptions = {
        chart: { stacked: !!spec.stacked },
        xaxis: {
            categories: spec.categories ?? [],
            labels: { rotate: -35, hideOverlappingLabels: true, trim: true, formatter: spec.horizontal ? (v: string) => axisFmt(Number(v)) : undefined },
        },
        yaxis: { labels: { formatter: spec.horizontal ? undefined : axisFmt, maxWidth: 220 } },
        tooltip: { y: { formatter: fmt } },
        plotOptions: { bar: { horizontal: !!spec.horizontal, borderRadius: 4, columnWidth: many ? '70%' : '45%', barHeight: '65%' } },
        legend: { show: series.length > 1 },
    };
    const height = spec.horizontal ? Math.max(260, (spec.categories?.length ?? 0) * 30 + 60) : 330;
    return <Chart type={spec.type} series={series} options={options} height={height} />;
}

