import { Link } from '@inertiajs/react';
import { MapPin } from 'lucide-react';
import EmptyState from '@/components/ui/empty-state';
import { date } from '@/lib/utils';

export type PersonDuty = {
    id: number;
    duty: string | null;
    time: string | null;
    location: string | null;
    days: number[] | null;
    start_date: string;
    end_date: string;
    role: string | null;
    status: 'current' | 'upcoming' | 'ended';
    done: number;
    missed: number;
};

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon–Fri", "Sat, Sun" or "Every day". */
export function daysLabel(days: number[] | null | undefined): string {
    if (!days || days.length === 0 || days.length === 7) return 'Every day';
    const sorted = [...days].sort((a, b) => a - b);
    const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (consecutive && sorted.length > 2) return `${WEEKDAYS[sorted[0] - 1]}–${WEEKDAYS[sorted[sorted.length - 1] - 1]}`;
    return sorted.map((d) => WEEKDAYS[d - 1]).join(', ');
}

export const dutyStatusTone: Record<string, string> = { current: 'badge-soft-success', upcoming: 'badge-soft-info', ended: 'badge-soft-dark' };

/** Duties of one staff member or student, as shown on their profile. */
export default function PersonDuties({ duties, href, compact = false }: { duties: PersonDuty[]; href: string; compact?: boolean }) {
    const list = compact ? duties.filter((d) => d.status !== 'ended').slice(0, 4) : duties;

    if (list.length === 0) {
        return compact ? (
            <p className="text-sm text-white-dark">No current or upcoming duty.</p>
        ) : (
            <EmptyState
                title="No duties yet"
                description="Duties rostered from the duty roster appear here."
                action={
                    <Link href={href} className="btn btn-primary btn-sm">
                        Open duty roster
                    </Link>
                }
            />
        );
    }

    if (compact) {
        return (
            <ul className="space-y-2">
                {list.map((d) => (
                    <li key={d.id} className="rounded-md border border-white-light p-2.5 text-sm dark:border-[#1b2e4b]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">
                                {d.duty}
                                {d.role && <span className="text-white-dark"> · {d.role}</span>}
                            </span>
                            <span className={`badge ${dutyStatusTone[d.status]}`}>{d.status === 'current' ? 'On duty' : 'Upcoming'}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-white-dark">
                            {date(d.start_date)} → {date(d.end_date)} · {daysLabel(d.days)}
                            {d.time && ` · ${d.time}`}
                        </div>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className="table-responsive">
            <table className="table">
                <thead>
                    <tr>
                        <th>Duty</th>
                        <th>When</th>
                        <th>Period</th>
                        <th className="text-center!">Done</th>
                        <th className="text-center!">Missed</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {list.map((d) => (
                        <tr key={d.id}>
                            <td>
                                <div className="font-semibold">{d.duty}</div>
                                <div className="flex flex-wrap items-center gap-x-2 text-xs text-white-dark">
                                    {d.role && <span>{d.role}</span>}
                                    {d.location && (
                                        <span className="inline-flex items-center gap-0.5">
                                            <MapPin className="h-3 w-3" /> {d.location}
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="text-sm whitespace-nowrap">
                                {daysLabel(d.days)}
                                {d.time && <div className="text-xs text-white-dark">{d.time}</div>}
                            </td>
                            <td className="text-sm whitespace-nowrap">
                                {date(d.start_date)} → {date(d.end_date)}
                            </td>
                            <td className="text-center! font-semibold text-success">{d.done || '—'}</td>
                            <td className={`text-center! font-semibold ${d.missed ? 'text-danger' : ''}`}>{d.missed || '—'}</td>
                            <td>
                                <span className={`badge ${dutyStatusTone[d.status]}`}>{d.status === 'current' ? 'On duty' : d.status === 'upcoming' ? 'Upcoming' : 'Ended'}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
