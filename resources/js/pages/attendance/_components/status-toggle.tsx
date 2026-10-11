import { cn } from '@/lib/utils';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type StaffStatus = 'present' | 'absent' | 'late' | 'on_leave';

export const STATUS_META: Record<AttendanceStatus | 'on_leave', { label: string; short: string; tone: string; active: string }> = {
    present: { label: 'Present', short: 'P', tone: 'success', active: 'bg-success text-white border-success' },
    absent: { label: 'Absent', short: 'A', tone: 'danger', active: 'bg-danger text-white border-danger' },
    late: { label: 'Late', short: 'L', tone: 'warning', active: 'bg-warning text-white border-warning' },
    excused: { label: 'Excused', short: 'E', tone: 'info', active: 'bg-info text-white border-info' },
    on_leave: { label: 'On leave', short: 'OL', tone: 'secondary', active: 'bg-secondary text-white border-secondary' },
};

/** Large, tap-friendly segmented status picker used by the student and staff registers. */
export function StatusToggle<T extends string>({
    value,
    onChange,
    options = ['present', 'absent', 'late', 'excused'] as unknown as T[],
    disabled,
}: {
    value: T | null;
    onChange: (v: T) => void;
    options?: T[];
    disabled?: boolean;
}) {
    return (
        <div className="grid grid-cols-4 gap-1.5 md:flex" role="radiogroup">
            {options.map((o) => {
                const meta = STATUS_META[o as keyof typeof STATUS_META];
                const active = value === o;
                return (
                    <button
                        key={o}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => onChange(o)}
                        title={meta.label}
                        className={cn(
                            'min-h-11 rounded-md border px-2 text-sm font-bold transition md:min-w-[84px]',
                            active ? meta.active : 'border-white-light bg-white text-white-dark hover:border-primary hover:text-primary dark:border-[#1b2e4b] dark:bg-[#121c2c]',
                            disabled && 'cursor-not-allowed opacity-70',
                        )}
                    >
                        {meta.label}
                    </button>
                );
            })}
        </div>
    );
}
