import { Link, router, useForm, usePage } from '@inertiajs/react';
import {
    BookOpen,
    BriefcaseBusiness,
    CalendarCheck,
    CalendarPlus,
    FileText,
    History,
    KeyRound,
    LoaderCircle,
    Mail,
    Pencil,
    Phone,
    Plane,
    RefreshCw,
    ShieldCheck,
    Trash2,
    Wallet,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import { Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, dateTime, money, num, titleCase, weekdayDate } from '@/lib/utils';
import type { Option } from '@/types';
import { LeaveModal } from '../_components/leave-modal';

type Employee = {
    id: number;
    employee_no: string;
    full_name: string;
    first_name: string;
    last_name: string;
    gender: string | null;
    date_of_birth: string | null;
    age: number | null;
    phone: string | null;
    email: string | null;
    national_id: string | null;
    address: string | null;
    emergency_contact: string | null;
    designation: string | null;
    department: string | null;
    category: string;
    employment_type: string;
    qualification: string | null;
    hire_date: string | null;
    contract_end_date: string | null;
    basic_salary?: string;
    bank_name: string | null;
    bank_account?: string | null;
    nssf_no: string | null;
    tin: string | null;
    status: string;
    login: { email: string; role: string | null; status: string } | null;
};

type Balance = { type_id: number; type: string; entitled: number; used: number; pending: number; remaining: number; is_paid: boolean };
type LeaveRow = { id: number; type: string | null; start_date: string; end_date: string; days: number; reason: string | null; status: string; approver: string | null; decision_note: string | null };
type PayslipRow = { id: number; period: string; status: string; payment_date: string | null; gross_pay: string; paye: string; nssf_employee: string; total_deductions: string; net_pay: string };

type Props = {
    employee: Employee;
    canSeeSalary: boolean;
    leave: { requests: LeaveRow[]; balances: Balance[]; year: number };
    leaveTypes: Option[];
    attendance: {
        present: number;
        absent: number;
        late: number;
        on_leave: number;
        monthly: { m: string; present: number; absent: number; late: number }[];
        recent: { id: number; date: string; status: string; check_in: string | null; check_out: string | null; remarks: string | null }[];
    };
    subjects: { id: number; subject: string; code: string | null; class: string; stream: string | null; periods_per_week: number | null }[];
    classTeacherOf: string[];
    payslips: PayslipRow[];
    components: { name: string; type: string; calculation: string; value: string; amount: string | null }[];
    statuses: Option[];
    roles: Option[];
    history: { id: number; action: string; description: string | null; created_at: string; user: string | null }[];
};

const monthLabel = (m: string) => date(`${m}-01`, { month: 'short', year: '2-digit' });

export default function EmployeeShow({ employee, canSeeSalary, leave, leaveTypes, attendance, subjects, classTeacherOf, payslips, components, statuses, roles, history }: Props) {
    const can = useCan();
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [tab, setTab] = useState('overview');
    const [statusOpen, setStatusOpen] = useState(false);
    const [loginOpen, setLoginOpen] = useState(false);
    const [leaveOpen, setLeaveOpen] = useState(false);

    const totalDays = attendance.present + attendance.absent + attendance.late + attendance.on_leave;
    const attendanceRate = totalDays ? Math.round(((attendance.present + attendance.late) / (totalDays - attendance.on_leave || 1)) * 100) : null;
    const annual = leave.balances.find((b) => b.type.toLowerCase().startsWith('annual'));
    const yearsOfService = employee.hire_date ? Math.floor((Date.now() - new Date(`${employee.hire_date}T00:00:00`).getTime()) / (365.25 * 86400000)) : null;

    const tabs = [
        { key: 'overview', label: 'Overview', icon: BookOpen },
        { key: 'employment', label: 'Employment & Salary', icon: BriefcaseBusiness },
        { key: 'leave', label: 'Leave', icon: Plane, count: leave.requests.length },
        ...(canSeeSalary ? [{ key: 'payslips', label: 'Payslips', icon: Wallet, count: payslips.length }] : []),
        { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
        { key: 'subjects', label: 'Teaching load', icon: FileText, count: subjects.length },
        { key: 'history', label: 'History', icon: History },
    ];

    return (
        <>
            <PageHeader
                title={employee.full_name}
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Employees', href: '/hr/employees' }, { title: employee.employee_no }]}
                actions={
                    <>
                        {can('hr.manage') && (
                            <>
                                <button type="button" className="btn btn-outline-info" onClick={() => setLeaveOpen(true)}>
                                    <CalendarPlus className="h-4 w-4" /> Apply leave
                                </button>
                                <button type="button" className="btn btn-outline-success" onClick={() => setLoginOpen(true)}>
                                    <KeyRound className="h-4 w-4" /> {employee.login ? 'Reset login' : 'Create login'}
                                </button>
                                <button type="button" className="btn btn-outline-warning" onClick={() => setStatusOpen(true)}>
                                    <RefreshCw className="h-4 w-4" /> Change status
                                </button>
                                <Link href={`/hr/employees/${employee.id}/edit`} className="btn btn-primary">
                                    <Pencil className="h-4 w-4" /> Edit
                                </Link>
                            </>
                        )}
                    </>
                }
            />

            <div className="panel mb-6 overflow-hidden p-0">
                <div className="h-24 bg-gradient-to-r from-[#4361ee] via-[#805dca] to-[#2196f3]" />
                <div className="flex flex-col gap-5 px-6 pb-6 md:flex-row md:items-end">
                    <Avatar name={employee.full_name} className="-mt-12 h-28 w-28 border-4 border-white text-2xl shadow-lg dark:border-black" />
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-2xl font-extrabold text-black dark:text-white-light">{employee.full_name}</h2>
                            <StatusBadge status={employee.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white-dark">
                            <span>
                                <strong className="text-black dark:text-white-light">{employee.designation ?? '—'}</strong>
                            </span>
                            <span>{employee.department ?? 'No department'}</span>
                            <span>No. {employee.employee_no}</span>
                            <span className={`badge ${employee.category === 'teaching' ? 'badge-soft-primary' : 'badge-soft-secondary'}`}>{titleCase(employee.category)}</span>
                            <span className="badge badge-soft-info">{titleCase(employee.employment_type)}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg bg-primary-light px-4 py-2 dark:bg-primary-dark-light">
                            <div className="text-lg font-extrabold text-primary">{attendanceRate !== null ? `${attendanceRate}%` : '—'}</div>
                            <div className="text-[11px] font-bold text-white-dark uppercase">Attendance</div>
                        </div>
                        <div className="rounded-lg bg-success-light px-4 py-2 dark:bg-success-dark-light">
                            <div className="text-lg font-extrabold text-success">{annual ? annual.remaining : '—'}</div>
                            <div className="text-[11px] font-bold text-white-dark uppercase">Annual left</div>
                        </div>
                        <div className="rounded-lg bg-info-light px-4 py-2 dark:bg-info-dark-light">
                            <div className="text-lg font-extrabold text-info">{yearsOfService ?? '—'}</div>
                            <div className="text-[11px] font-bold text-white-dark uppercase">Yrs service</div>
                        </div>
                    </div>
                </div>
            </div>

            <Tabs tabs={tabs} active={tab} onChange={setTab} />

            {tab === 'overview' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="panel lg:col-span-2">
                        <h5 className="mb-4 text-lg font-bold">Personal details</h5>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                            {[
                                ['Gender', titleCase(employee.gender)],
                                ['Date of birth', employee.date_of_birth ? `${date(employee.date_of_birth)}${employee.age ? ` (${employee.age} yrs)` : ''}` : null],
                                ['National ID', employee.national_id],
                                ['Qualification', employee.qualification],
                                ['Address', employee.address],
                                ['Emergency contact', employee.emergency_contact],
                            ].map(([k, v]) => (
                                <div key={k as string}>
                                    <dt className="text-xs font-bold text-white-dark uppercase">{k}</dt>
                                    <dd className="font-semibold text-black dark:text-white-light">{v || '—'}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <div className="space-y-6">
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Contact</h5>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-white-dark" /> {employee.phone ?? '—'}
                                </div>
                                <div className="flex items-center gap-2 break-all">
                                    <Mail className="h-4 w-4 shrink-0 text-white-dark" /> {employee.email ?? '—'}
                                </div>
                            </div>
                        </div>
                        <div className="panel">
                            <h5 className="mb-3 flex items-center gap-2 text-lg font-bold">
                                <ShieldCheck className="h-5 w-5 text-success" /> System access
                            </h5>
                            {employee.login ? (
                                <div className="space-y-1 text-sm">
                                    <div className="font-semibold break-all">{employee.login.email}</div>
                                    <div className="text-white-dark">Role: {employee.login.role ?? '—'}</div>
                                    <StatusBadge status={employee.login.status === 'active' ? 'active' : 'inactive'} label={titleCase(employee.login.status)} />
                                </div>
                            ) : (
                                <p className="text-sm text-white-dark">No system login. {can('hr.manage') && 'Use “Create login” to give this employee access.'}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'employment' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Employment terms</h5>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                            {[
                                ['Designation', employee.designation],
                                ['Department', employee.department],
                                ['Category', titleCase(employee.category)],
                                ['Employment type', titleCase(employee.employment_type)],
                                ['Hire date', date(employee.hire_date)],
                                ['Contract end', employee.contract_end_date ? date(employee.contract_end_date) : 'Open-ended'],
                                ['NSSF no.', employee.nssf_no],
                                ['TIN', employee.tin],
                            ].map(([k, v]) => (
                                <div key={k as string}>
                                    <dt className="text-xs font-bold text-white-dark uppercase">{k}</dt>
                                    <dd className="font-semibold text-black dark:text-white-light">{v || '—'}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Salary & bank</h5>
                        {canSeeSalary ? (
                            <>
                                <div className="mb-4 rounded-lg bg-primary-light p-4 dark:bg-primary-dark-light">
                                    <div className="text-xs font-bold text-white-dark uppercase">Basic salary (monthly)</div>
                                    <div className="text-2xl font-extrabold text-primary">{money(employee.basic_salary, cur)}</div>
                                </div>
                                <dl className="mb-4 grid grid-cols-2 gap-4">
                                    <div>
                                        <dt className="text-xs font-bold text-white-dark uppercase">Bank</dt>
                                        <dd className="font-semibold">{employee.bank_name ?? '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-bold text-white-dark uppercase">Account</dt>
                                        <dd className="font-semibold">{employee.bank_account ?? '—'}</dd>
                                    </div>
                                </dl>
                                <h6 className="mb-2 font-bold">Assigned components</h6>
                                {components.length ? (
                                    <ul className="divide-y divide-white-light text-sm dark:divide-[#1b2e4b]">
                                        {components.map((c, i) => (
                                            <li key={i} className="flex items-center justify-between py-2">
                                                <span>
                                                    <span className="font-semibold">{c.name}</span>{' '}
                                                    <span className={`badge ms-1 ${c.type === 'allowance' ? 'badge-soft-success' : c.type === 'deduction' ? 'badge-soft-danger' : 'badge-soft-info'}`}>{titleCase(c.type)}</span>
                                                </span>
                                                <span className="font-semibold">
                                                    {c.amount !== null ? money(c.amount, '') : c.calculation === 'percent_of_basic' ? `${Number(c.value)}% of basic` : money(c.value, '')}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-white-dark">Only components that apply to all staff (e.g. statutory) are used.</p>
                                )}
                                {can('payroll.manage') && (
                                    <Link href="/payroll/components" className="mt-3 inline-block text-sm font-bold text-primary hover:underline">
                                        Manage salary components →
                                    </Link>
                                )}
                            </>
                        ) : (
                            <EmptyState title="Confidential" description="Salary details are visible to HR managers and payroll staff only." />
                        )}
                    </div>
                </div>
            )}

            {tab === 'leave' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                        {leave.balances.map((b) => {
                            const pct = b.entitled ? Math.min(100, Math.round((b.used / b.entitled) * 100)) : 0;
                            return (
                                <div key={b.type_id} className="panel">
                                    <div className="text-xs font-bold text-white-dark uppercase">{b.type}</div>
                                    <div className="mt-1 text-2xl font-extrabold">
                                        {b.remaining}
                                        <span className="text-sm font-semibold text-white-dark"> / {b.entitled} days</span>
                                    </div>
                                    <div className="mt-2 h-1.5 w-full rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="mt-1 text-xs text-white-dark">
                                        {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="panel">
                        <div className="mb-4 flex items-center justify-between">
                            <h5 className="text-lg font-bold">Leave history</h5>
                            <span className="text-xs text-white-dark">Balances for {leave.year} · weekends excluded</span>
                        </div>
                        {leave.requests.length ? (
                            <div className="table-responsive">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Dates</th>
                                            <th className="text-center!">Days</th>
                                            <th>Reason</th>
                                            <th>Status</th>
                                            <th>Decided by</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leave.requests.map((l) => (
                                            <tr key={l.id}>
                                                <td className="font-semibold">{l.type}</td>
                                                <td className="whitespace-nowrap">
                                                    {date(l.start_date)} → {date(l.end_date)}
                                                </td>
                                                <td className="text-center! font-bold">{l.days}</td>
                                                <td className="max-w-xs text-sm">{l.reason ?? '—'}</td>
                                                <td>
                                                    <StatusBadge status={l.status} />
                                                </td>
                                                <td className="text-sm">
                                                    {l.approver ?? '—'}
                                                    {l.decision_note && <div className="text-xs text-white-dark">{l.decision_note}</div>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState title="No leave taken" description="Leave requests for this employee will appear here." />
                        )}
                    </div>
                </div>
            )}

            {tab === 'payslips' && canSeeSalary && (
                <div className="space-y-6">
                    {payslips.length > 1 && (
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Pay trend</h5>
                            <Chart
                                type="bar"
                                height={260}
                                series={[
                                    { name: 'Net pay', data: [...payslips].reverse().map((p) => Number(p.net_pay)) },
                                    { name: 'Deductions', data: [...payslips].reverse().map((p) => Number(p.total_deductions)) },
                                ]}
                                options={{
                                    chart: { stacked: true },
                                    xaxis: { categories: [...payslips].reverse().map((p) => monthLabel(p.period)) },
                                    yaxis: { labels: { formatter: (v: number) => num(v / 1000) + 'k' } },
                                    colors: ['#00ab55', '#e7515a'],
                                }}
                            />
                        </div>
                    )}
                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Payslips</h5>
                        {payslips.length ? (
                            <div className="table-responsive">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th className="text-end!">Gross</th>
                                            <th className="text-end!">PAYE</th>
                                            <th className="text-end!">NSSF</th>
                                            <th className="text-end!">Deductions</th>
                                            <th className="text-end!">Net pay</th>
                                            <th>Status</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payslips.map((p) => (
                                            <tr key={p.id}>
                                                <td className="font-semibold">{date(`${p.period}-01`, { month: 'long', year: 'numeric' })}</td>
                                                <td className="text-end!">{money(p.gross_pay, '')}</td>
                                                <td className="text-end!">{money(p.paye, '')}</td>
                                                <td className="text-end!">{money(p.nssf_employee, '')}</td>
                                                <td className="text-end! text-danger">{money(p.total_deductions, '')}</td>
                                                <td className="text-end! font-bold text-success">{money(p.net_pay, '')}</td>
                                                <td>
                                                    <StatusBadge status={p.status} />
                                                </td>
                                                <td className="text-end!">
                                                    <Link href={`/payroll/payslips/${p.id}`} className="text-sm font-bold text-primary hover:underline">
                                                        View
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState title="No payslips yet" description="Payslips appear once payroll has been run for this employee." />
                        )}
                    </div>
                </div>
            )}

            {tab === 'attendance' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        {(
                            [
                                ['Present', attendance.present, 'text-success'],
                                ['Late', attendance.late, 'text-warning'],
                                ['Absent', attendance.absent, 'text-danger'],
                                ['On leave', attendance.on_leave, 'text-info'],
                            ] as const
                        ).map(([label, value, cls]) => (
                            <div key={label} className="panel">
                                <div className="text-xs font-bold text-white-dark uppercase">{label}</div>
                                <div className={`text-2xl font-extrabold ${cls}`}>{num(value)}</div>
                                <div className="text-xs text-white-dark">days this year</div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <div className="panel lg:col-span-2">
                            <h5 className="mb-4 text-lg font-bold">Monthly attendance</h5>
                            {attendance.monthly.length ? (
                                <Chart
                                    type="bar"
                                    height={260}
                                    series={[
                                        { name: 'Present', data: attendance.monthly.map((m) => Number(m.present)) },
                                        { name: 'Absent', data: attendance.monthly.map((m) => Number(m.absent)) },
                                    ]}
                                    options={{ xaxis: { categories: attendance.monthly.map((m) => monthLabel(m.m)) }, colors: ['#00ab55', '#e7515a'] }}
                                />
                            ) : (
                                <EmptyState title="No attendance recorded" description="Staff attendance is captured under Attendance › Staff." />
                            )}
                        </div>
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Recent days</h5>
                            {attendance.recent.length ? (
                                <ul className="space-y-2 text-sm">
                                    {attendance.recent.map((r) => (
                                        <li key={r.id} className="flex items-center justify-between">
                                            <span>
                                                {weekdayDate(r.date, 'short')}
                                                {r.check_in && <span className="ms-2 text-xs text-white-dark">{r.check_in.slice(0, 5)}</span>}
                                            </span>
                                            <StatusBadge status={r.status} />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-white-dark">Nothing recorded yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'subjects' && (
                <div className="panel">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <h5 className="text-lg font-bold">Assigned subjects</h5>
                        {classTeacherOf.length > 0 && (
                            <div className="text-sm">
                                Class teacher of{' '}
                                {classTeacherOf.map((c) => (
                                    <span key={c} className="badge badge-soft-primary ms-1">
                                        {c}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    {subjects.length ? (
                        <>
                            <div className="table-responsive">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Subject</th>
                                            <th>Class</th>
                                            <th className="text-center!">Periods / week</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subjects.map((s) => (
                                            <tr key={s.id}>
                                                <td className="font-semibold">
                                                    {s.subject} {s.code && <span className="text-xs text-white-dark">({s.code})</span>}
                                                </td>
                                                <td>{[s.class, s.stream].filter(Boolean).join(' ')}</td>
                                                <td className="text-center!">{s.periods_per_week ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-3 text-sm text-white-dark">Total load: {num(subjects.reduce((s, r) => s + (r.periods_per_week ?? 0), 0))} periods per week</p>
                        </>
                    ) : (
                        <EmptyState title="No teaching allocations" description="Subject allocations are managed under Academics › Allocations." />
                    )}
                </div>
            )}

            {tab === 'history' && (
                <div className="panel">
                    <h5 className="mb-4 text-lg font-bold">Record history</h5>
                    {history.length ? (
                        <ol className="relative ms-3 border-s-2 border-primary/20">
                            {history.map((h) => (
                                <li key={h.id} className="mb-5 ms-5">
                                    <span className="absolute -start-[9px] mt-1 h-4 w-4 rounded-full border-2 border-white bg-primary dark:border-black" />
                                    <div className="font-semibold">{h.description ?? titleCase(h.action)}</div>
                                    <div className="text-xs text-white-dark">
                                        {dateTime(h.created_at)} {h.user && `· ${h.user}`}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <EmptyState title="No changes recorded" />
                    )}
                    {can('hr.manage') && employee.status !== 'terminated' && (
                        <div className="mt-6 border-t border-white-light pt-4 dark:border-[#1b2e4b]">
                            <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                onClick={async () => {
                                    const { confirmed } = await confirm({
                                        title: `Delete ${employee.full_name}?`,
                                        text: 'Only records without payroll history can be deleted. Otherwise change the status to Terminated.',
                                        danger: true,
                                        confirmText: 'Delete',
                                    });
                                    if (confirmed) router.delete(`/hr/employees/${employee.id}`);
                                }}
                            >
                                <Trash2 className="h-4 w-4" /> Delete record
                            </button>
                        </div>
                    )}
                </div>
            )}

            <StatusModal open={statusOpen} onClose={() => setStatusOpen(false)} employeeId={employee.id} current={employee.status} statuses={statuses} />
            <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} employee={employee} roles={roles} />
            <LeaveModal
                open={leaveOpen}
                onClose={() => setLeaveOpen(false)}
                employees={[{ value: employee.id, label: `${employee.full_name} (${employee.employee_no})` }]}
                leaveTypes={leaveTypes}
                defaultEmployeeId={employee.id}
                balances={() => leave.balances}
            />
        </>
    );
}

function StatusModal({ open, onClose, employeeId, current, statuses }: { open: boolean; onClose: () => void; employeeId: number; current: string; statuses: Option[] }) {
    const form = useForm({ status: current, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (form.data.status === 'terminated') {
            const { confirmed } = await confirm({ title: 'Terminate this employee?', text: 'Their system login will be disabled and they will be excluded from future payroll runs.', danger: true, confirmText: 'Terminate' });
            if (!confirmed) return;
        }
        form.post(`/hr/employees/${employeeId}/status`, { preserveScroll: true, onSuccess: () => (form.setData('reason', ''), onClose()) });
    };
    return (
        <Modal open={open} onClose={onClose} title="Change employment status">
            <form onSubmit={submit} className="space-y-4">
                <Select label="New status" value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} options={statuses} error={form.errors.status} />
                <Input label="Effective date" type="date" value={form.data.effective_date} onChange={(e) => form.setData('effective_date', e.target.value)} error={form.errors.effective_date} />
                <Textarea label="Reason" required value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} error={form.errors.reason} placeholder="e.g. Contract ended / disciplinary hearing pending" />
                <p className="text-xs text-white-dark">The change and reason are recorded in the audit trail. Suspended or terminated staff lose system access.</p>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Update status
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function LoginModal({ open, onClose, employee, roles }: { open: boolean; onClose: () => void; employee: Employee; roles: Option[] }) {
    const form = useForm({ email: employee.login?.email ?? employee.email ?? '', role_id: '' });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/hr/employees/${employee.id}/login`, { preserveScroll: true, onSuccess: () => onClose() });
    };
    return (
        <Modal open={open} onClose={onClose} title={employee.login ? 'Reset system login' : 'Create system login'}>
            <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-white-dark">
                    {employee.login ? 'A new temporary password will be generated' : 'A login will be created'} for{' '}
                    <strong className="text-black dark:text-white-light">{employee.full_name}</strong>. The temporary password is shown once after saving — share it securely.
                </p>
                <Input label="Login email" type="email" required value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                <Select label="Role" required placeholder="Select role…" value={form.data.role_id} onChange={(e) => form.setData('role_id', e.target.value)} options={roles} error={form.errors.role_id} />
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-success" disabled={form.processing}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} {employee.login ? 'Reset password' : 'Create login'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
