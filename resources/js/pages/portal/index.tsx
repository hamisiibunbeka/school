import { Link, usePage } from '@inertiajs/react';
import { CalendarDays, ChevronRight, ClipboardList, Megaphone, Wallet } from 'lucide-react';
import Avatar from '@/components/ui/avatar';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import { cn, money, titleCase } from '@/lib/utils';
import WardDetail, { AnnouncementList, EventList, PaymentInstructions, type AnnouncementItem, type Detail, type EventItem, type Instructions } from './_components/ward-detail';

type Ward = {
    id: number;
    full_name: string;
    first_name: string;
    admission_no: string;
    photo_url: string | null;
    gender: string;
    status: string;
    residence_type: string;
    class: string;
    attendance_rate: number | null;
    attendance_days: number;
    balance: string;
    latest_exam: { exam: string; average: number } | null;
    homework_due: number;
};
type Term = { id: number; name: string; start_date: string; end_date: string } | null;
type Props =
    | { mode: 'parent'; guardian: { id: number; full_name: string; phone: string; email: string | null }; wards: Ward[]; announcements: AnnouncementItem[]; events: EventItem[]; term: Term; paymentInstructions: Instructions }
    | { mode: 'student'; detail: Detail; term: Term }
    | { mode: 'none'; term: null };

export default function Portal(props: Props) {
    const { auth, school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const first = auth.user?.name.split(' ')[0] ?? '';

    if (props.mode === 'student') {
        return (
            <>
                <PageHeader title={`Karibu, ${first}`} subtitle={props.term ? `${props.term.name} · ${school?.name ?? ''}` : school?.name} breadcrumbs={[{ title: 'My Portal' }]} />
                <WardDetail detail={props.detail} self />
            </>
        );
    }

    if (props.mode === 'none') {
        return (
            <>
                <PageHeader title="My Portal" breadcrumbs={[{ title: 'My Portal' }]} />
                <div className="panel">
                    <EmptyState title="No linked learner" description="Your account is not linked to a guardian or student record in this school. Please contact the school office." />
                </div>
            </>
        );
    }

    const { wards, announcements, events, term, paymentInstructions } = props;
    const totalBalance = wards.reduce((s, w) => s + Number(w.balance), 0);

    return (
        <>
            <PageHeader title={`Karibu, ${first}`} subtitle={`Parent portal${term ? ` · ${term.name}` : ''} · ${school?.name ?? ''}`} breadcrumbs={[{ title: 'My Portal' }]} />

            {wards.length === 0 ? (
                <div className="panel mb-6">
                    <EmptyState title="No children linked yet" description="Ask the school office to link your account to your child's record." />
                </div>
            ) : (
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {wards.map((w) => (
                        <Link key={w.id} href={`/portal/children/${w.id}`} className="panel group block transition hover:-translate-y-0.5 hover:shadow-lg">
                            <div className="flex items-center gap-4">
                                <Avatar name={w.full_name} src={w.photo_url} className="h-14 w-14 text-base" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-lg font-extrabold text-black group-hover:text-primary dark:text-white-light">{w.full_name}</div>
                                    <div className="text-xs text-white-dark">
                                        {w.class || '—'} · {w.admission_no} · {titleCase(w.residence_type)}
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-white-dark group-hover:text-primary" />
                            </div>
                            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                                <div className="rounded-lg bg-primary-light p-2 dark:bg-primary-dark-light">
                                    <div className={cn('text-lg font-extrabold', w.attendance_rate !== null && w.attendance_rate < 80 ? 'text-danger' : 'text-primary')}>{w.attendance_rate !== null ? `${w.attendance_rate}%` : '—'}</div>
                                    <div className="text-[10px] font-bold text-white-dark uppercase">Attendance</div>
                                </div>
                                <div className="rounded-lg bg-success-light p-2 dark:bg-success-dark-light">
                                    <div className="text-lg font-extrabold text-success">{w.latest_exam ? `${w.latest_exam.average}%` : '—'}</div>
                                    <div className="truncate text-[10px] font-bold text-white-dark uppercase" title={w.latest_exam?.exam}>
                                        {w.latest_exam ? 'Latest exam' : 'No results'}
                                    </div>
                                </div>
                                <div className="rounded-lg bg-danger-light p-2 dark:bg-danger-dark-light">
                                    <div className={cn('text-lg font-extrabold', Number(w.balance) > 0 ? 'text-danger' : 'text-success')}>{money(w.balance, '')}</div>
                                    <div className="text-[10px] font-bold text-white-dark uppercase">Balance</div>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between text-xs text-white-dark">
                                <span className="flex items-center gap-1">
                                    <ClipboardList className="h-3.5 w-3.5" /> {w.homework_due} homework due
                                </span>
                                <span>{w.latest_exam?.exam ?? ''}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                        <Megaphone className="h-5 w-5 text-primary" /> School announcements
                    </h5>
                    <AnnouncementList items={announcements} />
                </div>
                <div className="space-y-6">
                    <div className="panel">
                        <h5 className="mb-1 flex items-center gap-2 text-lg font-bold">
                            <Wallet className="h-5 w-5 text-danger" /> Fees
                        </h5>
                        <p className="mb-4 text-sm text-white-dark">
                            Total outstanding: <strong className={totalBalance > 0 ? 'text-danger' : 'text-success'}>{money(totalBalance, cur)}</strong>
                        </p>
                        <PaymentInstructions instructions={paymentInstructions} />
                    </div>
                    <div className="panel">
                        <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                            <CalendarDays className="h-5 w-5 text-info" /> Upcoming events
                        </h5>
                        <EventList items={events} />
                    </div>
                </div>
            </div>
        </>
    );
}
