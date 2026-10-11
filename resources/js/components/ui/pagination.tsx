import { Link } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/types';

export default function Pagination({ meta }: { meta: Paginated<unknown> }) {
    if (!meta || meta.total === 0) return null;

    return (
        <div className="no-print flex flex-col items-center justify-between gap-3 px-1 pt-4 sm:flex-row">
            <p className="text-xs font-semibold text-white-dark">
                Showing {meta.from ?? 0}–{meta.to ?? 0} of {meta.total.toLocaleString()} records
            </p>
            {meta.last_page > 1 && (
                <ul className="inline-flex items-center gap-1">
                    {meta.links.map((link, i) => {
                        const isPrev = i === 0;
                        const isNext = i === meta.links.length - 1;
                        const label = isPrev ? <ChevronLeft className="h-4 w-4" /> : isNext ? <ChevronRight className="h-4 w-4" /> : link.label;
                        const cls = cn(
                            'flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold transition',
                            link.active ? 'bg-primary text-white' : 'bg-white-light text-dark hover:bg-primary hover:text-white dark:bg-[#191e3a] dark:text-white-light',
                            !link.url && 'pointer-events-none opacity-40',
                        );
                        return (
                            <li key={i}>
                                {link.url ? (
                                    <Link href={link.url} preserveScroll preserveState className={cls}>
                                        {label}
                                    </Link>
                                ) : (
                                    <span className={cls}>{label}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
