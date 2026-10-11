import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/ui/form';
import { cn } from '@/lib/utils';

export type StudentOption = { value: number; label: string; class?: string };

/** Async student search (active learners) backed by /attendance/students/search. */
export default function StudentPicker({
    value,
    onChange,
    label = 'Student',
    error,
    required,
}: {
    value: StudentOption | null;
    onChange: (s: StudentOption | null) => void;
    label?: string;
    error?: string;
    required?: boolean;
}) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<StudentOption[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!open) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/attendance/students/search?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
                setResults(res.ok ? await res.json() : []);
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [q, open]);

    if (value) {
        return (
            <Field label={label} error={error} required={required}>
                <div className="flex items-center justify-between gap-2 rounded-md border border-white-light px-3 py-2 dark:border-[#1b2e4b]">
                    <div className="min-w-0">
                        <div className="truncate font-semibold text-black dark:text-white-light">{value.label}</div>
                        {value.class && <div className="text-xs text-white-dark">{value.class}</div>}
                    </div>
                    <button type="button" className="text-white-dark hover:text-danger" onClick={() => onChange(null)} aria-label="Clear student">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </Field>
        );
    }

    return (
        <Field label={label} error={error} required={required}>
            <div className="relative">
                <input
                    className="peer form-input ps-9"
                    placeholder="Type a name or admission number…"
                    value={q}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    onChange={(e) => setQ(e.target.value)}
                />
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white-dark peer-focus:text-primary" />
                {open && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-white-light bg-white shadow-lg dark:border-[#1b2e4b] dark:bg-[#1b2e4b]">
                        {loading && results.length === 0 && <div className="px-3 py-2 text-sm text-white-dark">Searching…</div>}
                        {!loading && results.length === 0 && <div className="px-3 py-2 text-sm text-white-dark">No students found</div>}
                        {results.map((r) => (
                            <button
                                key={r.value}
                                type="button"
                                className={cn('block w-full px-3 py-2 text-start hover:bg-primary-light dark:hover:bg-primary-dark-light')}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onChange(r);
                                    setQ('');
                                    setOpen(false);
                                }}
                            >
                                <div className="text-sm font-semibold">{r.label}</div>
                                {r.class && <div className="text-xs text-white-dark">{r.class}</div>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Field>
    );
}
