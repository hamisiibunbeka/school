import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { Option } from '@/types';

/**
 * Searchable single-select (type-ahead) for long option lists such as students.
 * Shared by the operations modules (boarding, transport, library, health).
 */
export default function SearchSelect<T extends Option>({
    label,
    options,
    value,
    onChange,
    placeholder = 'Search…',
    error,
    required,
    help,
    disabled,
    renderOption,
    wrapperClassName,
}: {
    label?: ReactNode;
    options: T[];
    value: string | number | null | undefined;
    onChange: (value: string, option: T | null) => void;
    placeholder?: string;
    error?: string;
    required?: boolean;
    help?: ReactNode;
    disabled?: boolean;
    renderOption?: (o: T) => ReactNode;
    wrapperClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find((o) => String(o.value) === String(value ?? '')) ?? null;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
        return list.slice(0, 60);
    }, [options, query]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const pick = (o: T | null) => {
        onChange(o ? String(o.value) : '', o);
        setOpen(false);
        setQuery('');
    };

    return (
        <Field label={label} error={error} required={required} help={help} className={wrapperClassName}>
            <div ref={ref} className="relative">
                <div className="relative">
                    <input
                        className="form-input pe-14"
                        disabled={disabled}
                        placeholder={selected ? selected.label : placeholder}
                        value={open ? query : (selected?.label ?? '')}
                        onFocus={() => {
                            setOpen(true);
                            setHighlight(0);
                        }}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOpen(true);
                            setHighlight(0);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setHighlight((h) => Math.max(h - 1, 0));
                            } else if (e.key === 'Enter' && open) {
                                e.preventDefault();
                                if (filtered[highlight]) pick(filtered[highlight]);
                            } else if (e.key === 'Escape') {
                                setOpen(false);
                            }
                        }}
                    />
                    <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-white-dark">
                        {selected && !disabled && (
                            <button type="button" className="hover:text-danger" onClick={() => pick(null)} aria-label="Clear">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        <ChevronDown className="h-4 w-4" />
                    </div>
                </div>
                {open && !disabled && (
                    <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-white-light bg-white py-1 shadow-lg dark:border-[#1b2e4b] dark:bg-[#1b2e4b]">
                        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-white-dark">No matches</li>}
                        {filtered.map((o, i) => (
                            <li key={o.value}>
                                <button
                                    type="button"
                                    onMouseEnter={() => setHighlight(i)}
                                    onClick={() => pick(o)}
                                    className={cn(
                                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm',
                                        i === highlight && 'bg-primary/10 text-primary',
                                    )}
                                >
                                    <span className="min-w-0 flex-1">{renderOption ? renderOption(o) : o.label}</span>
                                    {String(o.value) === String(value ?? '') && <Check className="h-4 w-4 shrink-0" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Field>
    );
}
