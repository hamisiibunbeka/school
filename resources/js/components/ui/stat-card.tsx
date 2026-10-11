import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const gradients = {
    primary: 'from-[#4361ee] to-[#7b8ff7]',
    violet: 'from-violet-500 to-violet-400',
    cyan: 'from-cyan-500 to-cyan-400',
    blue: 'from-blue-500 to-blue-400',
    fuchsia: 'from-fuchsia-500 to-fuchsia-400',
    success: 'from-[#00ab55] to-[#3dd68c]',
    warning: 'from-[#e2a03f] to-[#f3c171]',
    danger: 'from-[#e7515a] to-[#f28a90]',
};

/** Gradient KPI card in the style of Vristo's sales/finance dashboards. */
export function GradientStatCard({
    title,
    value,
    icon: Icon,
    footer,
    color = 'primary',
}: {
    title: string;
    value: ReactNode;
    icon: LucideIcon;
    footer?: ReactNode;
    color?: keyof typeof gradients;
}) {
    return (
        <div className={cn('panel relative overflow-hidden bg-gradient-to-r text-white dark:bg-gradient-to-r', gradients[color])}>
            <Icon className="absolute -end-4 -bottom-4 h-24 w-24 opacity-15" />
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold opacity-90">{title}</div>
                <span className="grid h-9 w-9 place-content-center rounded-full bg-white/20">
                    <Icon className="h-5 w-5" />
                </span>
            </div>
            <div className="mt-4 text-2xl font-extrabold tracking-tight">{value}</div>
            {footer && <div className="mt-3 text-xs font-semibold opacity-90">{footer}</div>}
        </div>
    );
}

const tones = {
    primary: 'bg-primary-light text-primary dark:bg-primary-dark-light',
    secondary: 'bg-secondary-light text-secondary dark:bg-secondary-dark-light',
    success: 'bg-success-light text-success dark:bg-success-dark-light',
    danger: 'bg-danger-light text-danger dark:bg-danger-dark-light',
    warning: 'bg-warning-light text-warning dark:bg-warning-dark-light',
    info: 'bg-info-light text-info dark:bg-info-dark-light',
};

/** Compact white stat card with a soft coloured icon. */
export default function StatCard({
    title,
    value,
    icon: Icon,
    hint,
    tone = 'primary',
}: {
    title: string;
    value: ReactNode;
    icon: LucideIcon;
    hint?: ReactNode;
    tone?: keyof typeof tones;
}) {
    return (
        <div className="panel flex items-center gap-4">
            <span className={cn('grid h-12 w-12 shrink-0 place-content-center rounded-xl', tones[tone])}>
                <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
                <div className="truncate text-xs font-bold tracking-wide text-white-dark uppercase">{title}</div>
                <div className="truncate text-xl font-extrabold text-black dark:text-white-light">{value}</div>
                {hint && <div className="truncate text-xs text-white-dark">{hint}</div>}
            </div>
        </div>
    );
}
