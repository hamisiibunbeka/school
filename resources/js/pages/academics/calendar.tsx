import { router, useForm } from '@inertiajs/react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, MapPin, Palmtree, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/filters';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cleanQuery, cn, date, num, titleCase, today } from '@/lib/utils';
import type { Option } from '@/types';

type CalEvent = {
    id: number;
    title: string;
    description: string | null;
    type: string;
    all_day: boolean;
    audience: string;
    location: string | null;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
};
type Props = {
    filters: { month: string; type: string; audience: string };
    events: CalEvent[];
    upcoming: CalEvent[];
    types: Option[];
    audiences: Option[];
    stats: { year: number; month: number; holidays: number; exams: number };
};

/** Colour per event type: [chip classes, dot class]. */
const TYPE_STYLE: Record<string, [string, string]> = {
    holiday: ['bg-danger text-white', 'bg-danger'],
    exam: ['bg-primary text-white', 'bg-primary'],
    meeting: ['bg-info text-white', 'bg-info'],
    sports: ['bg-success text-white', 'bg-success'],
    trip: ['bg-warning text-white', 'bg-warning'],
    event: ['bg-secondary text-white', 'bg-secondary'],
    deadline: ['bg-dark text-white', 'bg-dark'],
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const blank = { title: '', description: '', type: 'event', audience: 'all', location: '', all_day: true, start_date: '', end_date: '', start_time: '', end_time: '' };

export default function Calendar({ filters, events, upcoming, types, audiences, stats }: Props) {
    const can = useCan();
    const manage = can('academics.manage');
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<CalEvent | null>(null);
    const form = useForm(blank);

    const [y, m] = filters.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const days = useMemo(() => {
        const start = new Date(first);
        start.setDate(1 - ((first.getDay() + 6) % 7));
        const last = new Date(y, m, 0);
        const end = new Date(last);
        end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
        const out: Date[] = [];
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.month]);

    const eventsOn = (day: string) => events.filter((e) => e.start_date <= day && e.end_date >= day);

    const go = (next: Partial<Props['filters']>) => router.get('/academics/calendar', cleanQuery({ ...filters, ...next }) as Record<string, string>, { preserveScroll: true, preserveState: true, replace: true });

    const shift = (delta: number) => {
        const d = new Date(y, m - 1 + delta, 1);
        go({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
    };

    const openForm = (ev: CalEvent | null, day?: string) => {
        setEditing(ev);
        form.clearErrors();
        form.setData(
            ev
                ? {
                      title: ev.title,
                      description: ev.description ?? '',
                      type: ev.type,
                      audience: ev.audience,
                      location: ev.location ?? '',
                      all_day: ev.all_day,
                      start_date: ev.start_date,
                      end_date: ev.end_date,
                      start_time: ev.start_time ?? '',
                      end_time: ev.end_time ?? '',
                  }
                : { ...blank, start_date: day ?? today(), end_date: day ?? today() },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/academics/calendar/${editing.id}`, opts);
        else form.post('/academics/calendar', opts);
    };

    const remove = async () => {
        if (!editing) return;
        const { confirmed } = await confirm({ title: `Cancel “${editing.title}”?`, text: 'The event will be removed from the calendar.', confirmText: 'Remove event', danger: true });
        if (confirmed) router.delete(`/academics/calendar/${editing.id}`, { preserveScroll: true, onSuccess: () => setOpen(false) });
    };

    const todayIso = today();

    return (
        <>
            <PageHeader
                title="School Calendar"
                subtitle="Holidays, examinations, meetings, sports, trips and deadlines."
                breadcrumbs={[{ title: 'Academics' }, { title: 'School Calendar' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> Add event
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Events this year" value={num(stats.year)} icon={CalendarDays} tone="primary" />
                <StatCard title={`In ${first.toLocaleDateString('en-GB', { month: 'long' })}`} value={num(stats.month)} icon={Users} tone="info" />
                <StatCard title="Holidays this year" value={num(stats.holidays)} icon={Palmtree} tone="danger" />
                <StatCard title="Upcoming exams" value={num(stats.exams)} icon={ClipboardCheck} tone="success" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <div className="panel xl:col-span-3">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                            <button className="btn btn-outline-primary btn-sm px-2" onClick={() => shift(-1)} aria-label="Previous month">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button className="btn btn-outline-primary btn-sm px-2" onClick={() => shift(1)} aria-label="Next month">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            <button className="btn btn-outline-dark btn-sm" onClick={() => go({ month: todayIso.slice(0, 7) })}>
                                Today
                            </button>
                            <h5 className="ms-2 text-xl font-extrabold text-black dark:text-white-light">{monthLabel}</h5>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <FilterSelect value={filters.type} onChange={(v) => go({ type: v })} options={types} placeholder="All types" />
                            <FilterSelect value={filters.audience} onChange={(v) => go({ audience: v })} options={audiences.filter((a) => a.value !== 'all')} placeholder="Everyone" />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <div className="min-w-[640px]">
                            <div className="grid grid-cols-7 border-b border-white-light text-center text-xs font-bold tracking-wide text-white-dark uppercase dark:border-[#1b2e4b]">
                                {WEEKDAYS.map((d) => (
                                    <div key={d} className="py-2">
                                        {d}
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 border-s border-white-light dark:border-[#1b2e4b]">
                                {days.map((d) => {
                                    const key = iso(d);
                                    const inMonth = d.getMonth() === m - 1;
                                    const isToday = key === todayIso;
                                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                                    const list = eventsOn(key);
                                    return (
                                        <div
                                            key={key}
                                            onClick={() => manage && openForm(null, key)}
                                            className={cn(
                                                'group min-h-[104px] border-e border-b border-white-light p-1.5 transition dark:border-[#1b2e4b]',
                                                !inMonth && 'bg-[#fafafa] opacity-60 dark:bg-[#0e1726]',
                                                weekend && inMonth && 'bg-[#f9f9fc] dark:bg-[#111a2b]',
                                                manage && 'cursor-pointer hover:bg-primary-light/40 dark:hover:bg-primary-dark-light',
                                            )}
                                        >
                                            <div className="mb-1 flex items-center justify-between">
                                                <span className={cn('grid h-6 w-6 place-content-center rounded-full text-xs font-bold', isToday ? 'bg-primary text-white' : 'text-black dark:text-white-light')}>{d.getDate()}</span>
                                                {manage && <Plus className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100" />}
                                            </div>
                                            <div className="space-y-1">
                                                {list.slice(0, 3).map((ev) => (
                                                    <button
                                                        key={ev.id}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openForm(ev);
                                                        }}
                                                        title={ev.title}
                                                        className={cn('block w-full truncate rounded px-1.5 py-0.5 text-start text-[11px] font-semibold', TYPE_STYLE[ev.type]?.[0] ?? 'bg-primary text-white', ev.start_date !== key && 'opacity-80')}
                                                    >
                                                        {ev.start_time && ev.start_date === key ? `${ev.start_time} ` : ''}
                                                        {ev.title}
                                                    </button>
                                                ))}
                                                {list.length > 3 && <div className="px-1 text-[11px] font-semibold text-white-dark">+{list.length - 3} more</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3 text-xs">
                        {types.map((t) => (
                            <span key={t.value} className="flex items-center gap-1.5 font-semibold">
                                <span className={cn('h-2.5 w-2.5 rounded-full', TYPE_STYLE[String(t.value)]?.[1])} /> {t.label}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="panel h-max">
                    <h5 className="mb-4 text-lg font-bold">Coming up</h5>
                    {upcoming.length === 0 ? (
                        <EmptyState title="Nothing scheduled" />
                    ) : (
                        <div className="space-y-4">
                            {upcoming.map((ev) => {
                                const d = new Date(`${ev.start_date}T00:00:00`);
                                return (
                                    <button key={ev.id} type="button" onClick={() => openForm(ev)} className="flex w-full items-start gap-3 text-start">
                                        <div className={cn('flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5 text-white', TYPE_STYLE[ev.type]?.[1] ?? 'bg-primary')}>
                                            <span className="text-[10px] font-bold uppercase">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
                                            <span className="text-lg leading-none font-extrabold">{d.getDate()}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-bold text-black hover:text-primary dark:text-white-light">{ev.title}</div>
                                            <div className="text-xs text-white-dark">
                                                {ev.start_date !== ev.end_date ? `${date(ev.start_date)} – ${date(ev.end_date)}` : ev.all_day ? 'All day' : `${ev.start_time}${ev.end_time ? ` – ${ev.end_time}` : ''}`}
                                            </div>
                                            {ev.location && (
                                                <div className="flex items-center gap-1 truncate text-xs text-white-dark">
                                                    <MapPin className="h-3 w-3" /> {ev.location}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? (manage ? 'Edit event' : editing.title) : 'Add event'} size="lg">
                {!manage && editing ? (
                    <div className="space-y-3 text-sm">
                        <span className={cn('badge', TYPE_STYLE[editing.type]?.[0])}>{titleCase(editing.type)}</span>
                        <div>
                            {date(editing.start_date)}
                            {editing.end_date !== editing.start_date && ` – ${date(editing.end_date)}`} {editing.all_day ? '(all day)' : `${editing.start_time ?? ''}–${editing.end_time ?? ''}`}
                        </div>
                        {editing.location && <div>Location: {editing.location}</div>}
                        <div>Audience: {titleCase(editing.audience)}</div>
                        {editing.description && <p className="text-white-dark">{editing.description}</p>}
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-5">
                        <FormGrid>
                            <Input label="Title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={form.errors.title} wrapperClassName="sm:col-span-2" />
                            <Select label="Type" required options={types} value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} error={form.errors.type} />
                            <Select label="Audience" required options={audiences} value={form.data.audience} onChange={(e) => form.setData('audience', e.target.value)} error={form.errors.audience} />
                            <Input label="Starts on" type="date" required value={form.data.start_date} onChange={(e) => form.setData((d) => ({ ...d, start_date: e.target.value, end_date: d.end_date < e.target.value ? e.target.value : d.end_date }))} error={form.errors.start_date} />
                            <Input label="Ends on" type="date" value={form.data.end_date} onChange={(e) => form.setData('end_date', e.target.value)} error={form.errors.end_date} />
                            <div className="sm:col-span-2">
                                <Checkbox label="All-day event" checked={form.data.all_day} onChange={(e) => form.setData('all_day', e.target.checked)} />
                            </div>
                            {!form.data.all_day && (
                                <>
                                    <Input label="Start time" type="time" required value={form.data.start_time} onChange={(e) => form.setData('start_time', e.target.value)} error={form.errors.start_time} />
                                    <Input label="End time" type="time" value={form.data.end_time} onChange={(e) => form.setData('end_time', e.target.value)} error={form.errors.end_time} />
                                </>
                            )}
                            <Input label="Location" value={form.data.location} onChange={(e) => form.setData('location', e.target.value)} error={form.errors.location} wrapperClassName="sm:col-span-2" />
                            <Textarea label="Description" value={form.data.description} onChange={(e) => form.setData('description', e.target.value)} error={form.errors.description} wrapperClassName="sm:col-span-2" />
                        </FormGrid>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                {editing && (
                                    <button type="button" className="btn btn-outline-danger" onClick={remove}>
                                        <Trash2 className="h-4 w-4" /> Remove
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                                    Cancel
                                </button>
                                <button className="btn btn-primary" disabled={form.processing}>
                                    Save event
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
}
