import { router } from '@inertiajs/react';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import SearchSelect, { type SearchOption } from '@/components/ui/search-select';
import { cleanQuery, cn } from '@/lib/utils';
import type { Option } from '@/types';

/**
 * Keeps list filters in the URL query string. Changing a filter re-requests
 * the current page with preserveState so tables update without a reload.
 *
 *   const { filters, setFilter } = useFilters(props.filters);
 */
export function useFilters<T extends Record<string, string | number | null | undefined>>(initial: T, debounceKeys: (keyof T)[] = ['search']) {
    const [filters, setFilters] = useState<T>(initial);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const first = useRef(true);
    const pendingDebounce = useRef(false);

    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        const run = () =>
            router.get(window.location.pathname, cleanQuery(filters as Record<string, unknown>) as Record<string, string>, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        if (timer.current) clearTimeout(timer.current);
        if (pendingDebounce.current) {
            timer.current = setTimeout(run, 350);
        } else {
            run();
        }
        pendingDebounce.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(filters)]);

    const setFilter = (key: keyof T, value: T[keyof T]) => {
        pendingDebounce.current = debounceKeys.includes(key);
        setFilters((f) => ({ ...f, [key]: value, ...(key !== 'page' ? { page: undefined } : {}) }));
    };

    const reset = () => {
        const cleared = Object.fromEntries(Object.keys(filters).map((k) => [k, ''])) as T;
        setFilters(cleared);
    };

    return { filters, setFilter, reset };
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
    return (
        <div className={cn('relative w-full sm:w-64', className)}>
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="peer form-input ps-9 pe-8" />
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white-dark peer-focus:text-primary" />
            {value && (
                <button type="button" onClick={() => onChange('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-white-dark hover:text-danger">
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

export function FilterSelect({
    value,
    onChange,
    options,
    placeholder,
    className,
}: {
    value: string | number | null | undefined;
    onChange: (v: string) => void;
    options: (Option | string)[];
    placeholder: string;
    className?: string;
}) {
    const items: SearchOption[] = [
        { value: '', label: placeholder },
        ...options.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String(o.value), label: o.label })),
    ];

    return (
        <div className={cn('w-full sm:w-auto sm:min-w-[180px]', className)}>
            <SearchSelect value={value === null || value === undefined ? '' : String(value)} onValueChange={onChange} options={items} placeholder={placeholder} />
        </div>
    );
}

/** Wrapper row for search + filters + actions above a table. */
export function FilterBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
    return (
        <div className="no-print mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
