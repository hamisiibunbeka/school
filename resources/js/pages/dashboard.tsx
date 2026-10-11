import { Link, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowRight,
    BedDouble,
    CalendarCheck,
    CalendarDays,
    ClipboardList,
    GraduationCap,
    Megaphone,
    Receipt,
    TrendingDown,
    UserPlus,
    Users,
    Wallet,
} from 'lucide-react';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import StatCard, { GradientStatCard } from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { cn, compact, date, money, num, titleCase } from '@/lib/utils';

type Props = {
    greeting: string;
    term: { id: number; name: string; start_date: string; end_date: string } | null;
    year: { id: number; name: string } | null;
    students?: { total: number; boarding: number; male: number; female: number; new_this_term: number; by_class: { name: string; male: number; female: number }[] };
    admissions?: { pending: number; accepted: number };
    attendance?: { marked: number; present: number; absent: number; rate: number | null; trend: { date: string; rate: number }[]; staff_present: number };
    staff?: { total: number; teaching: number; pending_leave: number; contracts_expiring: number };
    fees?: {
        billed: string;
        collected: string;
        outstanding: string;
        collection_rate: number | null;
        today: string;
        by_method: { method: string; total: string }[];
        recent: { id: number; receipt_no: string; amount: string; method: string; payment_date: string; student: string }[];
    };
    cashflow?: { month: string; income: number; expenses: number }[];
    expenses_month?: string;
    exams?: { latest: { id: number; name: string } | null; grades: { grade: string; total: number }[]; in_progress: number };
    alerts: { count: number; message: string; href: string; tone: string }[];
    events: { id: number; title: string; type: string; starts_at: string; location: string | null }[];
    announcements: { id: number; title: string; body: string; priority: string; created_at: string }[];
};

const alertTone: Record<string, string> = {
    danger: 'border-danger/30 bg-danger-light text-danger dark:bg-danger-dark-light',
    warning: 'border-warning/30 bg-warning-light text-warning dark:bg-warning-dark-light',
    info: 'border-info/30 bg-info-light text-info dark:bg-info-dark-light',
};

export default function Dashboard(props: Props) {
    const { auth, school } = usePage().props;
    const can = useCan();
    const cur = school?.currency ?? 'TZS';
    const { students, attendance, staff, fees, cashflow, exams, admissions } = props;

    return (
        <>
            <PageHeader
                title="Dashboard"
                subtitle={
                    <>
                        {props.greeting}, <span className="font-bold text-primary">{auth.user?.name.split(' ')[0]}</span> — here is what is happening at {school?.name}
                        {props.term && (
                            <>
                                {' '}
                                · <span className="font-semibold">{props.term.name}</span> {props.year?.name}
                            </>
                        )}
                    </>
                }
                actions={
                    <>
                        {can('attendance.manage') && (
                            <Link href="/attendance" className="btn btn-outline-primary">
                                <CalendarCheck className="h-4 w-4" /> Take attendance
                            </Link>
                        )}
                        {can('fees.manage') && (
                            <Link href="/fees/payments/create" className="btn btn-primary">
                                <Wallet className="h-4 w-4" /> Collect fees
                            </Link>
                        )}
                    </>
                }
            />

            {/* Alerts */}
            {props.alerts.length > 0 && (
                <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {props.alerts.map((a) => (
                        <Link key={a.message} href={a.href} className={cn('flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-semibold transition hover:shadow-md', alertTone[a.tone])}>
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                            <span className="flex-1">
                                <strong className="text-base">{a.count}</strong> {a.message}
                            </span>
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    ))}
                </div>
            )}

            {/* KPI gradient cards */}
            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {students && (
                    <GradientStatCard
                        title="Enrolled Students"
                        value={num(students.total)}
                        icon={GraduationCap}
                        color="cyan"
                        footer={`${num(students.new_this_term)} new this term · ${num(students.boarding)} boarders`}
                    />
                )}
                {attendance && (
                    <GradientStatCard
                        title="Attendance Today"
                        value={attendance.rate !== null ? `${attendance.rate}%` : 'Not marked'}
                        icon={CalendarCheck}
                        color="violet"
                        footer={`${num(attendance.present)} present · ${num(attendance.absent)} absent`}
                    />
                )}
                {fees && (
                    <GradientStatCard
                        title="Fees Collected (Term)"
                        value={money(fees.collected, cur)}
                        icon={Wallet}
                        color="blue"
                        footer={`${fees.collection_rate ?? 0}% of ${money(fees.billed, cur)} billed`}
                    />
                )}
                {fees && (
                    <GradientStatCard title="Outstanding Fees" value={money(fees.outstanding, cur)} icon={Receipt} color="fuchsia" footer={`Today's collections: ${money(fees.today, cur)}`} />
                )}
                {!fees && staff && <GradientStatCard title="Active Staff" value={num(staff.total)} icon={Users} color="blue" footer={`${num(staff.teaching)} teaching staff`} />}
            </div>

            {/* Secondary stats */}
            <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {staff && <StatCard title="Staff present today" value={`${num(attendance?.staff_present ?? 0)} / ${num(staff.total)}`} icon={Users} tone="success" hint={`${staff.pending_leave} leave requests pending`} />}
                {admissions && <StatCard title="Pending applications" value={num(admissions.pending)} icon={UserPlus} tone="info" hint={`${admissions.accepted} accepted, awaiting enrolment`} />}
                {props.expenses_month !== undefined && <StatCard title="Expenses this month" value={money(props.expenses_month, cur)} icon={TrendingDown} tone="danger" />}
                {exams && <StatCard title="Exams in progress" value={num(exams.in_progress)} icon={ClipboardList} tone="secondary" hint={exams.latest ? `Last published: ${exams.latest.name}` : 'No results published yet'} />}
                {students && !staff && <StatCard title="Boarding students" value={num(students.boarding)} icon={BedDouble} tone="warning" />}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                {cashflow && (
                    <div className="panel xl:col-span-2">
                        <div className="mb-5 flex items-center justify-between">
                            <h5 className="text-lg font-bold dark:text-white-light">Collections vs Expenses</h5>
                            <span className="text-xs text-white-dark">Last 12 months · {cur}</span>
                        </div>
                        <Chart
                            type="area"
                            height={325}
                            series={[
                                { name: 'Fee collections', data: cashflow.map((c) => c.income) },
                                { name: 'Expenses', data: cashflow.map((c) => c.expenses) },
                            ]}
                            options={{
                                xaxis: { categories: cashflow.map((c) => c.month), axisBorder: { show: false }, axisTicks: { show: false } },
                                yaxis: { labels: { formatter: (v: number) => compact(v) } },
                                colors: ['#1b55e2', '#e7515a'],
                                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.05, stops: [45, 100] } },
                                tooltip: { y: { formatter: (v: number) => money(v, cur) } },
                            }}
                        />
                    </div>
                )}

                {students && (
                    <div className={cn('panel', !cashflow && 'xl:col-span-1')}>
                        <h5 className="mb-5 text-lg font-bold dark:text-white-light">Students by Gender</h5>
                        <Chart
                            type="donut"
                            height={300}
                            series={[students.male, students.female]}
                            options={{
                                labels: ['Boys', 'Girls'],
                                colors: ['#4361ee', '#e2a03f'],
                                legend: { position: 'bottom', horizontalAlign: 'center' },
                                stroke: { show: false },
                                plotOptions: {
                                    pie: {
                                        donut: {
                                            size: '68%',
                                            labels: { show: true, total: { show: true, label: 'Total', formatter: () => num(students.total) } },
                                        },
                                    },
                                },
                            }}
                        />
                    </div>
                )}

                {students && students.by_class.length > 0 && (
                    <div className={cn('panel', cashflow ? 'xl:col-span-2' : 'xl:col-span-2')}>
                        <h5 className="mb-5 text-lg font-bold dark:text-white-light">Enrolment by Class</h5>
                        <Chart
                            type="bar"
                            height={300}
                            series={[
                                { name: 'Boys', data: students.by_class.map((c) => Number(c.male)) },
                                { name: 'Girls', data: students.by_class.map((c) => Number(c.female)) },
                            ]}
                            options={{
                                chart: { stacked: true },
                                plotOptions: { bar: { borderRadius: 5, columnWidth: '42%' } },
                                xaxis: { categories: students.by_class.map((c) => c.name) },
                                colors: ['#4361ee', '#e2a03f'],
                            }}
                        />
                    </div>
                )}

                {attendance && (
                    <div className="panel">
                        <h5 className="mb-5 text-lg font-bold dark:text-white-light">Attendance Trend</h5>
                        {attendance.trend.length ? (
                            <Chart
                                type="line"
                                height={300}
                                series={[{ name: 'Attendance %', data: attendance.trend.map((t) => Number(t.rate)) }]}
                                options={{
                                    xaxis: { categories: attendance.trend.map((t) => date(t.date, { day: '2-digit', month: 'short' })) },
                                    yaxis: { min: 0, max: 100 },
                                    colors: ['#00ab55'],
                                    markers: { size: 4 },
                                }}
                            />
                        ) : (
                            <EmptyState title="No attendance yet" description="Daily registers will chart here." />
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {fees && (
                    <div className="panel xl:col-span-2">
                        <div className="mb-5 flex items-center justify-between">
                            <h5 className="text-lg font-bold dark:text-white-light">Recent Payments</h5>
                            <Link href="/fees/payments" className="text-sm font-bold text-primary hover:underline">
                                View all
                            </Link>
                        </div>
                        {fees.recent.length ? (
                            <div className="table-responsive">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Receipt</th>
                                            <th>Student</th>
                                            <th>Method</th>
                                            <th>Date</th>
                                            <th className="text-end!">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fees.recent.map((p) => (
                                            <tr key={p.id}>
                                                <td>
                                                    <Link href={`/fees/payments/${p.id}`} className="font-semibold text-primary hover:underline">
                                                        {p.receipt_no}
                                                    </Link>
                                                </td>
                                                <td className="font-semibold">{p.student}</td>
                                                <td>
                                                    <span className="badge badge-soft-info">{titleCase(p.method)}</span>
                                                </td>
                                                <td>{date(p.payment_date)}</td>
                                                <td className="text-end! font-bold text-success">{money(p.amount, cur)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState title="No payments recorded yet" />
                        )}
                    </div>
                )}

                {exams && exams.latest && exams.grades.length > 0 && (
                    <div className="panel">
                        <h5 className="mb-1 text-lg font-bold dark:text-white-light">Grade Distribution</h5>
                        <p className="mb-4 text-xs text-white-dark">{exams.latest.name}</p>
                        <Chart
                            type="bar"
                            height={260}
                            series={[{ name: 'Students', data: exams.grades.map((g) => Number(g.total)) }]}
                            options={{
                                xaxis: { categories: exams.grades.map((g) => g.grade) },
                                plotOptions: { bar: { borderRadius: 6, columnWidth: '45%', distributed: true } },
                                legend: { show: false },
                            }}
                        />
                    </div>
                )}

                <div className="panel">
                    <div className="mb-5 flex items-center justify-between">
                        <h5 className="text-lg font-bold dark:text-white-light">Upcoming Events</h5>
                        <CalendarDays className="h-5 w-5 text-white-dark" />
                    </div>
                    {props.events.length ? (
                        <ul className="space-y-4">
                            {props.events.map((e) => {
                                const d = new Date(e.starts_at);
                                return (
                                    <li key={e.id} className="flex items-center gap-3">
                                        <div className="grid h-12 w-12 shrink-0 place-content-center rounded-lg bg-primary-light text-center text-primary dark:bg-primary-dark-light">
                                            <div className="text-base leading-none font-extrabold">{d.getDate()}</div>
                                            <div className="text-[10px] font-bold uppercase">{d.toLocaleString('en', { month: 'short' })}</div>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-bold text-black dark:text-white-light">{e.title}</div>
                                            <div className="text-xs text-white-dark">
                                                {titleCase(e.type)}
                                                {e.location && ` · ${e.location}`}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <EmptyState title="No upcoming events" />
                    )}
                </div>

                <div className="panel">
                    <div className="mb-5 flex items-center justify-between">
                        <h5 className="text-lg font-bold dark:text-white-light">Announcements</h5>
                        <Megaphone className="h-5 w-5 text-white-dark" />
                    </div>
                    {props.announcements.length ? (
                        <ul className="space-y-4">
                            {props.announcements.map((a) => (
                                <li key={a.id} className="border-s-2 border-primary ps-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-black dark:text-white-light">{a.title}</span>
                                        {a.priority !== 'normal' && <span className="badge badge-soft-danger">{titleCase(a.priority)}</span>}
                                    </div>
                                    <p className="line-clamp-2 text-xs text-white-dark">{a.body}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <EmptyState title="No announcements" />
                    )}
                </div>
            </div>
        </>
    );
}
