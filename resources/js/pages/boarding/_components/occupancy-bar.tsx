import { cn } from '@/lib/utils';

/** Horizontal fill bar (occupancy, capacity usage, stock level). */
export default function OccupancyBar({ value, max, className, showLabel = true }: { value: number; max: number; className?: string; showLabel?: boolean }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    const tone = pct >= 100 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-success';
    return (
        <div className={cn('w-full', className)}>
            {showLabel && (
                <div className="mb-1 flex justify-between text-xs font-semibold">
                    <span className="text-white-dark">
                        {value} / {max}
                    </span>
                    <span className={cn(pct >= 100 ? 'text-danger' : pct >= 85 ? 'text-warning' : 'text-success')}>{pct}%</span>
                </div>
            )}
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
