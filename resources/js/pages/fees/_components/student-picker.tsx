import { LoaderCircle, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/avatar';
import { cn, money } from '@/lib/utils';

export type StudentHit = {
    id: number;
    full_name: string;
    admission_no: string;
    photo_url: string | null;
    class: string;
    status: string;
    balance: string;
};

/** Live student search (JSON from /fees/students/search) with balances in the dropdown. */
export default function StudentPicker({
    onSelect,
    currency = 'TZS',
    placeholder = 'Search student by name or admission number…',
    autoFocus,
    className,
    error,
}: {
    onSelect: (s: StudentHit) => void;
    currency?: string;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
    error?: string;
}) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<StudentHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const search = (value: string) => {
        setQ(value);
        if (timer.current) clearTimeout(timer.current);
        if (value.trim().length < 2) {
            setResults([]);
            setOpen(false);
            return;
        }
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/fees/students/search?q=${encodeURIComponent(value.trim())}`, { headers: { Accept: 'application/json' } });
                const data = (await res.json()) as StudentHit[];
                setResults(data);
                setActive(0);
                setOpen(true);
            } finally {
                setLoading(false);
            }
        }, 250);
    };

    const choose = (s: StudentHit) => {
        onSelect(s);
        setQ('');
        setResults([]);
        setOpen(false);
    };

    return (
        <div ref={box} className={cn('relative', error && 'has-error', className)}>
            <div className="relative">
                <input
                    value={q}
                    autoFocus={autoFocus}
                    onChange={(e) => search(e.target.value)}
                    onFocus={() => results.length && setOpen(true)}
                    onKeyDown={(e) => {
                        if (!open || !results.length) return;
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActive((a) => Math.min(a + 1, results.length - 1));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActive((a) => Math.max(a - 1, 0));
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            choose(results[active]);
                        } else if (e.key === 'Escape') setOpen(false);
                    }}
                    placeholder={placeholder}
                    className="form-input py-2.5 ps-10 pe-9 text-base"
                />
                <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white-dark" />
                {loading ? (
                    <LoaderCircle className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
                ) : (
                    q && (
                        <button type="button" onClick={() => search('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-white-dark hover:text-danger">
                            <X className="h-4 w-4" />
                        </button>
                    )
                )}
            </div>
            {error && <p className="form-error">{error}</p>}
            {open && (
                <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-white-light bg-white shadow-lg dark:border-[#1b2e4b] dark:bg-[#1b2e4b]">
                    {results.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-white-dark">No students found for “{q}”.</div>
                    ) : (
                        results.map((s, i) => (
                            <button
                                key={s.id}
                                type="button"
                                onMouseEnter={() => setActive(i)}
                                onClick={() => choose(s)}
                                className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-start', i === active && 'bg-primary-light dark:bg-primary-dark-light')}
                            >
                                <Avatar name={s.full_name} src={s.photo_url} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-bold text-black dark:text-white-light">{s.full_name}</div>
                                    <div className="truncate text-xs text-white-dark">
                                        {s.admission_no} · {s.class || 'No class'}
                                        {s.status !== 'active' && <span className="ms-1 text-warning">({s.status})</span>}
                                    </div>
                                </div>
                                <div className="text-end">
                                    <div className={cn('text-sm font-bold', Number(s.balance) > 0 ? 'text-danger' : 'text-success')}>{money(s.balance, currency)}</div>
                                    <div className="text-[10px] tracking-wide text-white-dark uppercase">Balance</div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
