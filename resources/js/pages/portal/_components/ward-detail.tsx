import { usePage } from '@inertiajs/react';
import { BookOpen, CalendarCheck, CalendarDays, ClipboardList, FileText, Megaphone, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import Avatar from '@/components/ui/avatar';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { cn, date, dateTime, money, titleCase } from '@/lib/utils';

export type Instructions = {
    text: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_no: string | null;
    mobile_money_provider: string | null;
    mobile_money_paybill: string | null;
    mobile_money_account: string | null;
};
export type AnnouncementItem = { id: number; title: string; body: string; priority: string; audience: string; class: string | null; publish_at: string | null };
export type EventItem = { id: number; title: string; description: string | null; type: string; starts_at: string; ends_at: string | null; all_day: number | boolean; location: string | null };

export type Detail = {
    student: { id: number; full_name: string; first_name: string; admission_no: string; photo_url: string | null; gender: string; status: string; residence_type: string; class: string };
    finance: {
        invoices: { id: number; invoice_no: string; issue_date: string; due_date: string | null; total: string; paid: string; balance: string; status: string }[];
        payments: { id: number; receipt_no: string; payment_date: string; amount: string; method: string; reference: string | null }[];
        billed: string;
        paid: string;
        balance: string;
        instructions: Instructions;
    };
    attendance: { present: number; absent: number; late: number; excused: number; total: number; rate: number | null; records: { date: string; status: string; remarks: string | null }[] };
    results: { exam_id: number; exam: string; type: string; published_at: string | null; average: number; subjects: { subject: string; score: string | null; grade: string | null; points: string | null; is_absent: boolean; remarks: string | null }[] }[];
    timetable: { id: number; day_of_week: number; start_time: string; end_time: string; room: string | null; subject: string; subject_code: string | null; teacher: string | null }[];
    homework: { id: number; title: string; instructions: string | null; due_date: string | null; max_score: string | null; status: string; subject: string; teacher: string | null }[];
    events: EventItem[];
    announcements: AnnouncementItem[];
};

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const statusColor: Record<string, string> = { present: 'bg-success text-white', late: 'bg-warning text-white', excused: 'bg-info text-white', absent: 'bg-danger text-white' };

export function PaymentInstructions({ instructions }: { instructions: Instructions }) {
    const has = instructions.text || instructions.bank_account_no || instructions.mobile_money_paybill;
    if (!has) return <p className="text-sm text-white-dark">Contact the school bursar for payment details.</p>;
    return (
        <div className="space-y-3 text-sm">
            {instructions.bank_account_no && (
                <div className="rounded-md bg-primary-light p-3 dark:bg-primary-dark-light">
                    <div className="text-xs font-bold text-primary uppercase">Bank</div>
                    <div className="font-semibold">{instructions.bank_name}</div>
                    <div>
                        {instructions.bank_account_name} · <span className="font-mono font-bold">{instructions.bank_account_no}</span>
                    </div>
                </div>
            )}
            {instructions.mobile_money_paybill && (
                <div className="rounded-md bg-success-light p-3 dark:bg-success-dark-light">
                    <div className="text-xs font-bold text-success uppercase">{instructions.mobile_money_provider || 'Mobile money'}</div>
                    <div>
                        Paybill / Lipa namba: <span className="font-mono font-bold">{instructions.mobile_money_paybill}</span>
                    </div>
                    {instructions.mobile_money_account && <div className="text-xs">Account: {instructions.mobile_money_account}</div>}
                </div>
            )}
            {instructions.text && <p className="whitespace-pre-line text-white-dark">{instructions.text}</p>}
        </div>
    );
}

export function AnnouncementList({ items }: { items: AnnouncementItem[] }) {
    if (!items.length) return <p className="text-sm text-white-dark">No current announcements.</p>;
    return (
        <ul className="space-y-4">
            {items.map((a) => (
                <li key={a.id} className={cn('border-s-4 ps-3', a.priority === 'urgent' ? 'border-danger' : a.priority === 'important' ? 'border-warning' : 'border-primary')}>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{a.title}</span>
                        {a.priority !== 'normal' && <span className={cn('badge', a.priority === 'urgent' ? 'badge-soft-danger' : 'badge-soft-warning')}>{titleCase(a.priority)}</span>}
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-line text-white-dark">{a.body}</p>
                    <div className="mt-1 text-[11px] text-white-dark">{dateTime(a.publish_at)}</div>
                </li>
            ))}
        </ul>
    );
}

export function EventList({ items }: { items: EventItem[] }) {
    if (!items.length) return <p className="text-sm text-white-dark">No upcoming events.</p>;
    return (
        <ul className="space-y-3">
            {items.map((e) => {
                const d = new Date(e.starts_at.replace(' ', 'T'));
                return (
                    <li key={e.id} className="flex gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-content-center rounded-lg bg-primary-light text-center text-primary dark:bg-primary-dark-light">
                            <div className="text-[10px] font-bold uppercase">{d.toLocaleDateString('en-GB', { month: 'short' })}</div>
                            <div className="text-lg leading-none font-extrabold">{d.getDate()}</div>
                        </div>
                        <div className="min-w-0">
                            <div className="font-semibold">{e.title}</div>
                            <div className="text-xs text-white-dark">
                                {titleCase(e.type)} {e.location && `· ${e.location}`} {!e.all_day && `· ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function AttendanceCalendar({ records }: { records: Detail['attendance']['records'] }) {
    const byDate = useMemo(() => Object.fromEntries(records.map((r) => [r.date.slice(0, 10), r.status])), [records]);
    const months = useMemo(() => {
        const keys = Array.from(new Set(records.map((r) => r.date.slice(0, 7))));
        return keys.slice(-3).reverse();
    }, [records]);

    if (!months.length) return <EmptyState title="No attendance recorded this term" />;

    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {months.map((ym) => {
                const [y, m] = ym.split('-').map(Number);
                const first = new Date(y, m - 1, 1);
                const days = new Date(y, m, 0).getDate();
                const offset = (first.getDay() + 6) % 7; // Monday first
                return (
                    <div key={ym}>
                        <div className="mb-2 font-bold">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
                        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                                <div key={i} className="font-bold text-white-dark">
                                    {d}
                                </div>
                            ))}
                            {Array.from({ length: offset }).map((_, i) => (
                                <div key={`o${i}`} />
                            ))}
                            {Array.from({ length: days }).map((_, i) => {
                                const key = `${ym}-${String(i + 1).padStart(2, '0')}`;
                                const st = byDate[key];
                                return (
                                    <div key={key} title={st ? titleCase(st) : undefined} className={cn('grid aspect-square place-content-center rounded-md', st ? statusColor[st] : 'bg-[#f6f8fa] text-white-dark dark:bg-[#1a2941]')}>
                                        {i + 1}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function WardDetail({ detail, self = false }: { detail: Detail; self?: boolean }) {
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [tab, setTab] = useState('overview');
    const { student, finance, attendance, results, timetable, homework, events, announcements } = detail;
    const upcoming = homework.filter((h) => h.due_date && h.due_date >= new Date().toISOString().slice(0, 10));

    const slotsByDay = useMemo(() => {
        const map: Record<number, Detail['timetable']> = {};
        timetable.forEach((s) => (map[s.day_of_week] ??= []).push(s));
        return map;
    }, [timetable]);

    return (
        <>
            <div className="panel mb-6 overflow-hidden p-0">
                <div className="h-20 bg-gradient-to-r from-[#4361ee] via-[#805dca] to-[#2196f3]" />
                <div className="flex flex-col gap-5 px-6 pb-6 md:flex-row md:items-end">
                    <Avatar name={student.full_name} src={student.photo_url} className="-mt-10 h-24 w-24 border-4 border-white text-xl shadow-lg dark:border-black" />
                    <div className="flex-1">
                        <h2 className="text-2xl font-extrabold text-black dark:text-white-light">{student.full_name}</h2>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white-dark">
                            <span>
                                Adm. <strong className="text-black dark:text-white-light">{student.admission_no}</strong>
                            </span>
                            <span>
                                Class <strong className="text-black dark:text-white-light">{student.class || '—'}</strong>
                            </span>
                            <span className="badge badge-soft-secondary">{titleCase(student.residence_type)}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg bg-primary-light px-4 py-2 dark:bg-primary-dark-light">
                            <div className="text-lg font-extrabold text-primary">{attendance.rate !== null ? `${attendance.rate}%` : '—'}</div>
                            <div className="text-[11px] font-bold text-white-dark uppercase">Attendance</div>
                        </div>
                        <div className="rounded-lg bg-success-light px-4 py-2 dark:bg-success-dark-light">
                            <div className="text-lg font-extrabold text-success">{results[0]?.average ?? '—'}</div>
                            <div className="text-[11px] font-bold text-white-dark uppercase">Last avg</div>
                        </div>
                        <div className="rounded-lg bg-danger-light px-4 py-2 dark:bg-danger-dark-light">
                            <div className="text-lg font-extrabold text-danger">{money(finance.balance, '')}</div>
                            <div className="text-[11px] font-bold text-white-dark uppercase">Balance</div>
                        </div>
                    </div>
                </div>
            </div>

            <Tabs
                tabs={[
                    { key: 'overview', label: 'Overview', icon: BookOpen },
                    { key: 'fees', label: 'Fees', icon: Wallet },
                    { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
                    { key: 'results', label: 'Results', icon: FileText, count: results.length },
                    { key: 'timetable', label: 'Timetable', icon: CalendarDays },
                    { key: 'homework', label: 'Homework', icon: ClipboardList, count: upcoming.length },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'overview' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="panel lg:col-span-2">
                        <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                            <Megaphone className="h-5 w-5 text-primary" /> Announcements
                        </h5>
                        <AnnouncementList items={announcements} />
                    </div>
                    <div className="space-y-6">
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Homework due</h5>
                            {upcoming.length ? (
                                <ul className="space-y-3">
                                    {upcoming.slice(0, 5).map((h) => (
                                        <li key={h.id}>
                                            <div className="font-semibold">{h.title}</div>
                                            <div className="text-xs text-white-dark">
                                                {h.subject} · due {date(h.due_date)}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-white-dark">Nothing due. </p>
                            )}
                        </div>
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Upcoming events</h5>
                            <EventList items={events} />
                        </div>
                    </div>
                </div>
            )}

            {tab === 'fees' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="panel">
                            <div className="text-xs font-bold text-white-dark uppercase">Total billed</div>
                            <div className="text-xl font-extrabold">{money(finance.billed, cur)}</div>
                        </div>
                        <div className="panel">
                            <div className="text-xs font-bold text-white-dark uppercase">Total paid</div>
                            <div className="text-xl font-extrabold text-success">{money(finance.paid, cur)}</div>
                        </div>
                        <div className="panel">
                            <div className="text-xs font-bold text-white-dark uppercase">Outstanding balance</div>
                            <div className="text-xl font-extrabold text-danger">{money(finance.balance, cur)}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className="space-y-6 xl:col-span-2">
                            <div className="panel">
                                <h5 className="mb-4 text-lg font-bold">Invoices</h5>
                                {finance.invoices.length ? (
                                    <div className="table-responsive">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Invoice</th>
                                                    <th>Issued</th>
                                                    <th>Due</th>
                                                    <th className="text-end!">Total</th>
                                                    <th className="text-end!">Paid</th>
                                                    <th className="text-end!">Balance</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {finance.invoices.map((i) => (
                                                    <tr key={i.id}>
                                                        <td className="font-semibold">{i.invoice_no}</td>
                                                        <td>{date(i.issue_date)}</td>
                                                        <td>{date(i.due_date)}</td>
                                                        <td className="text-end!">{money(i.total, '')}</td>
                                                        <td className="text-end! text-success">{money(i.paid, '')}</td>
                                                        <td className="text-end! font-bold text-danger">{money(i.balance, '')}</td>
                                                        <td>
                                                            <StatusBadge status={i.status} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState title="No invoices yet" />
                                )}
                            </div>
                            <div className="panel">
                                <h5 className="mb-4 text-lg font-bold">Payments received</h5>
                                {finance.payments.length ? (
                                    <div className="table-responsive">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Receipt</th>
                                                    <th>Date</th>
                                                    <th>Method</th>
                                                    <th>Reference</th>
                                                    <th className="text-end!">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {finance.payments.map((p) => (
                                                    <tr key={p.id}>
                                                        <td className="font-semibold">{p.receipt_no}</td>
                                                        <td>{date(p.payment_date)}</td>
                                                        <td>{titleCase(p.method)}</td>
                                                        <td>{p.reference ?? '—'}</td>
                                                        <td className="text-end! font-bold">{money(p.amount, '')}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState title="No payments recorded" />
                                )}
                            </div>
                        </div>
                        <div className="panel h-fit">
                            <h5 className="mb-4 text-lg font-bold">How to pay</h5>
                            <PaymentInstructions instructions={finance.instructions} />
                            <p className="mt-4 text-xs text-white-dark">
                                Use admission number <strong>{student.admission_no}</strong> as the payment reference.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'attendance' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {(['present', 'late', 'excused', 'absent'] as const).map((k) => (
                            <div key={k} className="panel text-center">
                                <div className="text-2xl font-extrabold">{attendance[k]}</div>
                                <StatusBadge status={k} />
                            </div>
                        ))}
                    </div>
                    <div className="panel">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h5 className="text-lg font-bold">This term</h5>
                            <div className="flex flex-wrap gap-3 text-xs">
                                {Object.entries(statusColor).map(([k, c]) => (
                                    <span key={k} className="flex items-center gap-1">
                                        <span className={cn('h-3 w-3 rounded', c)} /> {titleCase(k)}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <AttendanceCalendar records={attendance.records} />
                    </div>
                </div>
            )}

            {tab === 'results' && (
                <div className="space-y-6">
                    {results.length > 1 && (
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Performance trend</h5>
                            <Chart
                                type="line"
                                height={240}
                                series={[{ name: 'Average %', data: [...results].reverse().map((r) => r.average) }]}
                                options={{ xaxis: { categories: [...results].reverse().map((r) => r.exam) }, yaxis: { min: 0, max: 100 }, markers: { size: 5 } }}
                            />
                        </div>
                    )}
                    {results.length ? (
                        results.map((r) => (
                            <div key={r.exam_id} className="panel">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                    <h5 className="text-lg font-bold">{r.exam}</h5>
                                    <span className="badge badge-soft-primary text-sm">Average {r.average}%</span>
                                </div>
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Subject</th>
                                                <th className="text-center!">Score</th>
                                                <th className="text-center!">Grade</th>
                                                <th>Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {r.subjects.map((s) => (
                                                <tr key={s.subject}>
                                                    <td className="font-semibold">{s.subject}</td>
                                                    <td className="text-center!">{s.is_absent ? <span className="badge badge-soft-danger">ABS</span> : (s.score ?? '—')}</td>
                                                    <td className="text-center! font-bold text-primary">{s.grade ?? '—'}</td>
                                                    <td className="text-white-dark">{s.remarks ?? ''}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="panel">
                            <EmptyState title="No published results yet" description="Results appear once the school approves and publishes an exam." />
                        </div>
                    )}
                </div>
            )}

            {tab === 'timetable' && (
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Class timetable — {student.class}</h5>
                    {timetable.length ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                            {[1, 2, 3, 4, 5, 6].filter((d) => slotsByDay[d]?.length || d <= 5).map((d) => (
                                <div key={d} className="rounded-lg border border-white-light dark:border-[#1b2e4b]">
                                    <div className="border-b border-white-light bg-[#f6f8fa] px-3 py-2 text-sm font-bold dark:border-[#1b2e4b] dark:bg-[#1a2941]">{DAYS[d]}</div>
                                    <ul className="divide-y divide-white-light p-2 dark:divide-[#1b2e4b]">
                                        {(slotsByDay[d] ?? []).map((s) => (
                                            <li key={s.id} className="px-1 py-2">
                                                <div className="text-[11px] font-bold text-primary">
                                                    {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                                                </div>
                                                <div className="text-sm font-semibold">{s.subject}</div>
                                                <div className="text-[11px] text-white-dark">
                                                    {s.teacher ?? ''} {s.room && `· ${s.room}`}
                                                </div>
                                            </li>
                                        ))}
                                        {!(slotsByDay[d] ?? []).length && <li className="px-1 py-2 text-xs text-white-dark">No lessons</li>}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="Timetable not published yet" />
                    )}
                </div>
            )}

            {tab === 'homework' && (
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Homework & assignments</h5>
                    {homework.length ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {homework.map((h) => {
                                const overdue = h.due_date && h.due_date < new Date().toISOString().slice(0, 10);
                                return (
                                    <div key={h.id} className="rounded-lg border border-white-light p-4 dark:border-[#1b2e4b]">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-bold">{h.title}</div>
                                                <div className="text-xs text-white-dark">
                                                    {h.subject} {h.teacher && `· ${h.teacher}`}
                                                </div>
                                            </div>
                                            <span className={cn('badge', overdue ? 'badge-soft-dark' : 'badge-soft-warning')}>{h.due_date ? `Due ${date(h.due_date)}` : 'No due date'}</span>
                                        </div>
                                        {h.instructions && <p className="mt-2 text-sm whitespace-pre-line text-white-dark">{h.instructions}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState title="No homework assigned" description={self ? 'Assignments from your teachers will appear here.' : undefined} />
                    )}
                </div>
            )}
        </>
    );
}
