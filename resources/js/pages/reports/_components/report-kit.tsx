import { usePage } from '@inertiajs/react';
import {
    AlertCircle,
    AlertTriangle,
    ArrowDown,
    ArrowLeftRight,
    ArrowUp,
    Award,
    BadgePercent,
    Banknote,
    BarChart3,
    BedDouble,
    BookOpen,
    Briefcase,
    Building2,
    Bus,
    Calculator,
    Calendar,
    CalendarCheck,
    Check,
    Clock,
    CreditCard,
    FileText,
    Filter,
    Fuel,
    Gauge,
    GraduationCap,
    HeartPulse,
    Hourglass,
    Landmark,
    Library,
    LineChart,
    List,
    LogOut,
    Map as MapIcon,
    MapPin,
    Package,
    Percent,
    Phone,
    PieChart,
    Plane,
    Receipt,
    Scale,
    Shield,
    Star,
    TrendingDown,
    TrendingUp,
    Trophy,
    User,
    UserCheck,
    UserPlus,
    Users,
    UserX,
    Wallet,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import StatusBadge from '@/components/ui/status-badge';
import { cn, date, money, num, titleCase } from '@/lib/utils';

/** Server-side icon names (kebab-case) → lucide components. */
const icons: Record<string, LucideIcon> = {
    'alert-circle': AlertCircle,
    'alert-triangle': AlertTriangle,
    'arrow-down': ArrowDown,
    'arrow-left-right': ArrowLeftRight,
    'arrow-up': ArrowUp,
    award: Award,
    'badge-percent': BadgePercent,
    banknote: Banknote,
    'bar-chart': BarChart3,
    bed: BedDouble,
    'book-open': BookOpen,
    briefcase: Briefcase,
    building: Building2,
    bus: Bus,
    calculator: Calculator,
    calendar: Calendar,
    'calendar-check': CalendarCheck,
    check: Check,
    clock: Clock,
    'credit-card': CreditCard,
    'file-text': FileText,
    filter: Filter,
    fuel: Fuel,
    gauge: Gauge,
    'graduation-cap': GraduationCap,
    'heart-pulse': HeartPulse,
    hourglass: Hourglass,
    landmark: Landmark,
    library: Library,
    'line-chart': LineChart,
    list: List,
    'log-out': LogOut,
    map: MapIcon,
    'map-pin': MapPin,
    package: Package,
    percent: Percent,
    phone: Phone,
    'pie-chart': PieChart,
    plane: Plane,
    receipt: Receipt,
    scale: Scale,
    shield: Shield,
    star: Star,
    'trending-down': TrendingDown,
    'trending-up': TrendingUp,
    trophy: Trophy,
    user: User,
    'user-check': UserCheck,
    'user-plus': UserPlus,
    users: Users,
    'user-x': UserX,
    wallet: Wallet,
    x: X,
};

export function reportIcon(name?: string | null): LucideIcon {
    return (name && icons[name]) || FileText;
}

export type ColumnType = 'text' | 'money' | 'number' | 'percent' | 'date' | 'badge';
export type ReportColumn = { key: string; label: string; type: ColumnType };
export type Cell = string | number | boolean | null | undefined;
export type ReportRow = Record<string, Cell>;

/** Category → accent colour classes for catalogue tiles. */
export const categoryTones: Record<string, string> = {
    students: 'bg-primary-light text-primary dark:bg-primary-dark-light',
    attendance: 'bg-success-light text-success dark:bg-success-dark-light',
    academics: 'bg-secondary-light text-secondary dark:bg-secondary-dark-light',
    fees: 'bg-warning-light text-warning dark:bg-warning-dark-light',
    accounting: 'bg-info-light text-info dark:bg-info-dark-light',
    hr: 'bg-danger-light text-danger dark:bg-danger-dark-light',
    operations: 'bg-dark-light text-dark dark:bg-dark-dark-light dark:text-white-light',
};

const badgeTones: Record<string, string> = {
    below: 'badge-soft-danger',
    ok: 'badge-soft-success',
    low: 'badge-soft-warning',
    out_of_stock: 'badge-soft-danger',
    marked: 'badge-soft-success',
    not_marked: 'badge-soft-warning',
    male: 'badge-soft-info',
    female: 'badge-soft-secondary',
    mixed: 'badge-soft-dark',
    day: 'badge-soft-info',
    boarding: 'badge-soft-secondary',
    cash: 'badge-soft-success',
    bank: 'badge-soft-primary',
    mobile_money: 'badge-soft-warning',
    cheque: 'badge-soft-info',
    card: 'badge-soft-secondary',
    issued: 'badge-soft-info',
    returned: 'badge-soft-success',
    lost: 'badge-soft-danger',
};

const badgeLabels: Record<string, string> = { below: 'Below threshold', ok: 'OK', not_marked: 'Not marked', out_of_stock: 'Out of stock' };

export function isNumeric(type: ColumnType) {
    return type === 'money' || type === 'number' || type === 'percent';
}

/** Text used for CSV-like output and client-side search. */
export function plainValue(value: Cell, type: ColumnType, currency: string): string {
    if (value === null || value === undefined || value === '') return '';
    switch (type) {
        case 'money':
            return money(value as number, currency);
        case 'number':
            return num(value as number, Number.isInteger(Number(value)) ? 0 : 1);
        case 'percent':
            return `${num(value as number, 1)}%`;
        case 'date':
            return date(String(value));
        case 'badge':
            return badgeLabels[String(value)] ?? titleCase(String(value));
        default:
            return String(value);
    }
}

/** Render a cell according to its column type. */
export function FormattedCell({ value, type, currency, strong }: { value: Cell; type: ColumnType; currency: string; strong?: boolean }) {
    if (value === null || value === undefined || value === '') {
        return <span className="text-white-dark">—</span>;
    }
    if (type === 'badge') {
        const v = String(value);
        if (badgeTones[v]) {
            return <span className={cn('badge', badgeTones[v])}>{badgeLabels[v] ?? titleCase(v)}</span>;
        }
        if (/^[A-F][+-]?$|^S$/.test(v)) {
            return <span className="badge badge-soft-primary min-w-8 text-center">{v}</span>;
        }
        return <StatusBadge status={v} />;
    }
    if (type === 'percent') {
        const n = Math.max(0, Math.min(100, Number(value)));
        const tone = n >= 85 ? 'bg-success' : n >= 60 ? 'bg-warning' : 'bg-danger';
        return (
            <div className="inline-flex min-w-[96px] flex-col items-end gap-1">
                <span className={cn('font-semibold', strong && 'font-extrabold')}>{num(value as number, 1)}%</span>
                <span className="h-1 w-full overflow-hidden rounded-full bg-white-light/60 dark:bg-dark/50 print:hidden">
                    <span className={cn('block h-full rounded-full', tone)} style={{ width: `${n}%` }} />
                </span>
            </div>
        );
    }
    const text = plainValue(value, type, currency);
    if (type === 'money') {
        const negative = Number(value) < 0;
        return <span className={cn('whitespace-nowrap tabular-nums', negative && 'text-danger', strong && 'font-extrabold')}>{text}</span>;
    }
    if (type === 'number') return <span className={cn('tabular-nums', strong && 'font-extrabold')}>{text}</span>;
    if (type === 'date') return <span className="whitespace-nowrap">{text}</span>;
    return <span className={cn(strong && 'font-extrabold')}>{text}</span>;
}

/** Per-user favourite reports, kept in localStorage (SRS: saved report filters/favourites). */
export function useFavourites() {
    const { auth } = usePage().props;
    const storageKey = `reports:favourites:${auth.user?.id ?? 'guest'}`;
    const [favourites, setFavourites] = useState<string[]>([]);

    useEffect(() => {
        try {
            setFavourites(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
        } catch {
            setFavourites([]);
        }
    }, [storageKey]);

    const toggle = useCallback(
        (key: string) => {
            setFavourites((prev) => {
                const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
                try {
                    localStorage.setItem(storageKey, JSON.stringify(next));
                } catch {
                    /* storage unavailable */
                }
                return next;
            });
        },
        [storageKey],
    );

    return { favourites, isFavourite: (key: string) => favourites.includes(key), toggle };
}

/** Per-user saved filter values per report (localStorage). */
export function useSavedFilters(reportKey: string) {
    const { auth } = usePage().props;
    const storageKey = `reports:filters:${auth.user?.id ?? 'guest'}:${reportKey}`;

    const read = (): Record<string, string> | null => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };
    const save = (values: Record<string, string>) => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(values));
        } catch {
            /* storage unavailable */
        }
    };
    const clear = () => {
        try {
            localStorage.removeItem(storageKey);
        } catch {
            /* storage unavailable */
        }
    };

    return { read, save, clear };
}

export function FavouriteStar({ active, onClick, className }: { active: boolean; onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
            }}
            title={active ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={active}
            className={cn('grid h-8 w-8 place-content-center rounded-full transition hover:bg-warning-light dark:hover:bg-warning-dark-light', className)}
        >
            <Star className={cn('h-4 w-4', active ? 'fill-warning text-warning' : 'text-white-dark')} />
        </button>
    );
}
