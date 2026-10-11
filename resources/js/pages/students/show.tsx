import { Link, router, useForm, usePage } from '@inertiajs/react';
import {
    BookOpen,
    CalendarCheck,
    FileText,
    History,
    IdCard,
    LoaderCircle,
    Mail,
    Pencil,
    Phone,
    RefreshCw,
    ShieldAlert,
    Trash2,
    Upload,
    UserPlus,
    Users,
    Wallet,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import Chart from '@/components/ui/chart';
import EmptyState from '@/components/ui/empty-state';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { date, dateTime, money, titleCase } from '@/lib/utils';
import type { Option } from '@/types';

type Guardian = { id: number; full_name: string; phone: string; email: string | null; occupation: string | null; user_id: number | null; pivot: { relationship: string; is_primary: boolean } };
type Props = {
    student: {
        id: number;
        full_name: string;
        admission_no: string;
        photo_url: string | null;
        gender: string;
        date_of_birth: string | null;
        age: number | null;
        class: string;
        residence_type: string;
        status: string;
        admission_date: string | null;
        nationality: string | null;
        religion: string | null;
        birth_cert_no: string | null;
        address: string | null;
        previous_school: string | null;
        medical_notes: string | null;
        allergies: string | null;
        blood_group: string | null;
        guardians: Guardian[];
        documents: { id: number; title: string; mime_type: string | null; size: number | null; created_at: string; uploader: { name: string } | null }[];
        enrolments: { id: number; status: string; start_date: string | null; end_date: string | null; remarks: string | null; academic_year: { name: string } | null; school_class: { name: string } | null; stream: { name: string } | null }[];
    };
    attendance: { present: number; absent: number; late: number; excused: number };
    finance: {
        invoices: { id: number; invoice_no: string; issue_date: string; due_date: string | null; total: string; paid: string; balance: string; status: string }[];
        payments: { id: number; receipt_no: string; payment_date: string; amount: string; method: string; reference: string | null; status: string }[];
        billed: string;
        paid: string;
        balance: string;
    };
    results: { exam: string; exam_id: number; average: number; subjects: { subject: string; score: string | null; grade: string | null; is_absent: number }[] }[];
    discipline: { id: number; incident_date: string; type: string; title: string; action_taken: string | null; status: string }[];
    statuses: Option[];
};

export default function StudentShow({ student, attendance, finance, results, discipline, statuses }: Props) {
    const can = useCan();
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [tab, setTab] = useState('overview');
    const [statusOpen, setStatusOpen] = useState(false);
    const [guardianOpen, setGuardianOpen] = useState(false);
    const [docOpen, setDocOpen] = useState(false);

    const totalDays = attendance.present + attendance.absent + attendance.late + attendance.excused;
    const attendanceRate = totalDays ? Math.round(((attendance.present + attendance.late) / totalDays) * 100) : null;

    const tabs = [
        { key: 'overview', label: 'Overview', icon: BookOpen },
        { key: 'guardians', label: 'Guardians', icon: Users, count: student.guardians.length },
        { key: 'academics', label: 'Results', icon: FileText, count: results.length },
        { key: 'fees', label: 'Fees', icon: Wallet },
        { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
        { key: 'documents', label: 'Documents', icon: Upload, count: student.documents.length },
        { key: 'history', label: 'History & Conduct', icon: History },
    ];

    return (
        <>
            <PageHeader
                title={student.full_name}
                breadcrumbs={[{ title: 'Students', href: '/students' }, { title: student.admission_no }]}
                actions={
                    <>
                        <Link href={`/students/${student.id}/id-card`} className="btn btn-outline-dark">
                            <IdCard className="h-4 w-4" /> ID card
                        </Link>
                        {can('fees.manage') && (
                            <Link href={`/fees/payments/create?student=${student.id}`} className="btn btn-outline-success">
                                <Wallet className="h-4 w-4" /> Receive payment
                            </Link>
                        )}
                        {can('students.manage') && (
                            <>
                                <button type="button" className="btn btn-outline-warning" onClick={() => setStatusOpen(true)}>
                                    <RefreshCw className="h-4 w-4" /> Change status
                                </button>
                                <Link href={`/students/${student.id}/edit`} className="btn btn-primary">
                                    <Pencil className="h-4 w-4" /> Edit
                                </Link>
                            </>
                        )}
                    </>
                }
            />

            {/* Profile header card */}
            <div className="panel mb-6 overflow-hidden p-0">
                <div className="h-24 bg-gradient-to-r from-[#4361ee] via-[#805dca] to-[#ef1262]" />
                <div className="flex flex-col gap-5 px-6 pb-6 md:flex-row md:items-end">
                    <Avatar name={student.full_name} src={student.photo_url} className="-mt-12 h-28 w-28 border-4 border-white text-2xl shadow-lg dark:border-black" />
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-2xl font-extrabold text-black dark:text-white-light">{student.full_name}</h2>
                            <StatusBadge status={student.status} />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white-dark">
                            <span>
                                Adm. <strong className="text-black dark:text-white-light">{student.admission_no}</strong>
                            </span>
                            <span>
                                Class <strong className="text-black dark:text-white-light">{student.class || '—'}</strong>
                            </span>
                            <span>{titleCase(student.gender)}</span>
                            {student.age !== null && <span>{student.age} yrs</span>}
                            <span className="badge badge-soft-secondary">{titleCase(student.residence_type)}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg bg-primary-light px-4 py-2 dark:bg-primary-dark-light">
                            <div className="text-lg font-extrabold text-primary">{attendanceRate !== null ? `${attendanceRate}%` : '—'}</div>
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

            <Tabs tabs={tabs} active={tab} onChange={setTab} />

            {tab === 'overview' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="panel lg:col-span-2">
                        <h5 className="mb-4 text-lg font-bold">Bio-data</h5>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                            {[
                                ['Date of birth', date(student.date_of_birth)],
                                ['Birth certificate no.', student.birth_cert_no],
                                ['Nationality', student.nationality],
                                ['Religion', student.religion],
                                ['Admission date', date(student.admission_date)],
                                ['Previous school', student.previous_school],
                                ['Home address', student.address],
                            ].map(([k, v]) => (
                                <div key={k as string}>
                                    <dt className="text-xs font-bold text-white-dark uppercase">{k}</dt>
                                    <dd className="font-semibold text-black dark:text-white-light">{v || '—'}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <div className="panel">
                        <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                            <ShieldAlert className="h-5 w-5 text-danger" /> Health & welfare
                        </h5>
                        <dl className="space-y-3">
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Blood group</dt>
                                <dd className="font-semibold">{student.blood_group || '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Allergies</dt>
                                <dd className={student.allergies ? 'font-semibold text-danger' : 'font-semibold'}>{student.allergies || 'None recorded'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Medical notes</dt>
                                <dd className="text-sm">{student.medical_notes || '—'}</dd>
                            </div>
                        </dl>
                        <h5 className="mt-6 mb-3 text-base font-bold">Primary contact</h5>
                        {student.guardians[0] ? (
                            <div className="space-y-1 text-sm">
                                <div className="font-bold">
                                    {(student.guardians.find((g) => g.pivot.is_primary) ?? student.guardians[0]).full_name}{' '}
                                    <span className="text-white-dark">({(student.guardians.find((g) => g.pivot.is_primary) ?? student.guardians[0]).pivot.relationship})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-white-dark" /> {(student.guardians.find((g) => g.pivot.is_primary) ?? student.guardians[0]).phone}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-white-dark">No guardian linked.</p>
                        )}
                    </div>
                </div>
            )}

            {tab === 'guardians' && (
                <div className="panel">
                    <div className="mb-5 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Parents & guardians</h5>
                        {can('students.manage') && (
                            <button className="btn btn-primary btn-sm" onClick={() => setGuardianOpen(true)}>
                                <UserPlus className="h-4 w-4" /> Link guardian
                            </button>
                        )}
                    </div>
                    {student.guardians.length ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {student.guardians.map((g) => (
                                <div key={g.id} className="rounded-lg border border-white-light p-4 dark:border-[#1b2e4b]">
                                    <div className="flex items-center gap-3">
                                        <Avatar name={g.full_name} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-bold">{g.full_name}</div>
                                            <div className="text-xs text-white-dark">
                                                {g.pivot.relationship} {g.pivot.is_primary && <span className="badge badge-soft-primary ms-1">Primary</span>}
                                            </div>
                                        </div>
                                        {can('students.manage') && (
                                            <button
                                                className="text-danger hover:opacity-70"
                                                title="Unlink"
                                                onClick={async () => {
                                                    const { confirmed } = await confirm({ title: `Unlink ${g.full_name}?`, danger: true, confirmText: 'Unlink' });
                                                    if (confirmed) router.delete(`/students/${student.id}/guardians/${g.id}`, { preserveScroll: true });
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-3 space-y-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-white-dark" /> {g.phone}
                                        </div>
                                        {g.email && (
                                            <div className="flex items-center gap-2">
                                                <Mail className="h-4 w-4 text-white-dark" /> {g.email}
                                            </div>
                                        )}
                                        {g.occupation && <div className="text-white-dark">{g.occupation}</div>}
                                        <div className="pt-1">
                                            {g.user_id ? <span className="badge badge-soft-success">Portal access active</span> : <span className="badge badge-soft-dark">No portal access</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState title="No guardians linked" />
                    )}
                </div>
            )}

            {tab === 'academics' && (
                <div className="space-y-6">
                    {results.length > 1 && (
                        <div className="panel">
                            <h5 className="mb-4 text-lg font-bold">Performance trend</h5>
                            <Chart
                                type="line"
                                height={260}
                                series={[{ name: 'Average %', data: [...results].reverse().map((r) => r.average) }]}
                                options={{ xaxis: { categories: [...results].reverse().map((r) => r.exam) }, yaxis: { min: 0, max: 100 }, markers: { size: 5 } }}
                            />
                        </div>
                    )}
                    {results.length ? (
                        results.map((r) => (
                            <div key={r.exam_id} className="panel">
                                <div className="mb-4 flex items-center justify-between">
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
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {r.subjects.map((s) => (
                                                <tr key={s.subject}>
                                                    <td className="font-semibold">{s.subject}</td>
                                                    <td className="text-center!">{s.is_absent ? <span className="badge badge-soft-danger">ABS</span> : s.score ?? '—'}</td>
                                                    <td className="text-center! font-bold text-primary">{s.grade ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="panel">
                            <EmptyState title="No published results yet" description="Results appear here once an exam is approved and published." />
                        </div>
                    )}
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
                    <div className="panel">
                        <div className="mb-4 flex items-center justify-between">
                            <h5 className="text-lg font-bold">Invoices</h5>
                            {can('fees.view') && (
                                <Link href={`/fees/statements/${student.id}`} className="btn btn-outline-primary btn-sm">
                                    <FileText className="h-4 w-4" /> Fee statement
                                </Link>
                            )}
                        </div>
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
                                                <td>
                                                    <Link href={`/fees/invoices/${i.id}`} className="font-semibold text-primary hover:underline">
                                                        {i.invoice_no}
                                                    </Link>
                                                </td>
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
                        <h5 className="mb-4 text-lg font-bold">Payments</h5>
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
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {finance.payments.map((p) => (
                                            <tr key={p.id}>
                                                <td>
                                                    <Link href={`/fees/payments/${p.id}`} className="font-semibold text-primary hover:underline">
                                                        {p.receipt_no}
                                                    </Link>
                                                </td>
                                                <td>{date(p.payment_date)}</td>
                                                <td>{titleCase(p.method)}</td>
                                                <td>{p.reference ?? '—'}</td>
                                                <td className="text-end! font-bold">{money(p.amount, '')}</td>
                                                <td>
                                                    <StatusBadge status={p.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState title="No payments yet" />
                        )}
                    </div>
                </div>
            )}

            {tab === 'attendance' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Attendance summary</h5>
                        {totalDays ? (
                            <Chart
                                type="donut"
                                height={280}
                                series={[attendance.present, attendance.late, attendance.excused, attendance.absent]}
                                options={{ labels: ['Present', 'Late', 'Excused', 'Absent'], colors: ['#00ab55', '#e2a03f', '#2196f3', '#e7515a'], legend: { position: 'bottom' } }}
                            />
                        ) : (
                            <EmptyState title="No attendance recorded" />
                        )}
                    </div>
                    <div className="panel lg:col-span-2">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {(['present', 'late', 'excused', 'absent'] as const).map((k) => (
                                <div key={k} className="rounded-lg bg-[#f6f8fa] p-4 text-center dark:bg-[#1a2941]">
                                    <div className="text-2xl font-extrabold">{attendance[k]}</div>
                                    <StatusBadge status={k} />
                                </div>
                            ))}
                        </div>
                        <p className="mt-6 text-sm text-white-dark">
                            Overall attendance rate: <strong className="text-black dark:text-white-light">{attendanceRate !== null ? `${attendanceRate}%` : '—'}</strong> across {totalDays} recorded school days.
                        </p>
                    </div>
                </div>
            )}

            {tab === 'documents' && (
                <div className="panel">
                    <div className="mb-5 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Documents</h5>
                        {can('students.manage') && (
                            <button className="btn btn-primary btn-sm" onClick={() => setDocOpen(true)}>
                                <Upload className="h-4 w-4" /> Upload
                            </button>
                        )}
                    </div>
                    {student.documents.length ? (
                        <div className="table-responsive">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Type</th>
                                        <th>Size</th>
                                        <th>Uploaded</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {student.documents.map((d) => (
                                        <tr key={d.id}>
                                            <td className="font-semibold">{d.title}</td>
                                            <td>{d.mime_type ?? '—'}</td>
                                            <td>{d.size ? `${Math.round(d.size / 1024)} KB` : '—'}</td>
                                            <td>
                                                {dateTime(d.created_at)} {d.uploader && <span className="text-white-dark">by {d.uploader.name}</span>}
                                            </td>
                                            <td className="text-end!">
                                                {can('students.manage') && (
                                                    <button
                                                        className="text-danger"
                                                        onClick={async () => {
                                                            const { confirmed } = await confirm({ title: 'Delete document?', danger: true, confirmText: 'Delete' });
                                                            if (confirmed) router.delete(`/students/${student.id}/documents/${d.id}`, { preserveScroll: true });
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyState title="No documents uploaded" description="Birth certificates, transfer letters, medical forms and consent records." />
                    )}
                </div>
            )}

            {tab === 'history' && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Enrolment history</h5>
                        {student.enrolments.length ? (
                            <ol className="relative ms-3 border-s-2 border-primary/20">
                                {student.enrolments.map((e) => (
                                    <li key={e.id} className="mb-6 ms-5">
                                        <span className="absolute -start-[9px] mt-1 h-4 w-4 rounded-full border-2 border-white bg-primary dark:border-black" />
                                        <div className="font-bold">
                                            {e.academic_year?.name} · {e.school_class?.name} {e.stream?.name}
                                        </div>
                                        <div className="text-xs text-white-dark">
                                            {date(e.start_date)} → {e.end_date ? date(e.end_date) : 'present'}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <StatusBadge status={e.status} />
                                            {e.remarks && <span className="text-xs text-white-dark">{e.remarks}</span>}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <EmptyState title="No enrolment history" />
                        )}
                    </div>
                    <div className="panel">
                        <div className="mb-4 flex items-center justify-between">
                            <h5 className="text-lg font-bold">Conduct & awards</h5>
                            {can('attendance.manage') && (
                                <Link href={`/attendance/discipline?student=${student.id}`} className="text-sm font-bold text-primary hover:underline">
                                    Record incident
                                </Link>
                            )}
                        </div>
                        {discipline.length ? (
                            <ul className="space-y-3">
                                {discipline.map((d) => (
                                    <li key={d.id} className="rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold">{d.title}</span>
                                            <span className={`badge ${d.type === 'misconduct' ? 'badge-soft-danger' : 'badge-soft-success'}`}>{titleCase(d.type)}</span>
                                        </div>
                                        <div className="text-xs text-white-dark">
                                            {date(d.incident_date)} {d.action_taken && `· Action: ${d.action_taken}`}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <EmptyState title="Clean record" description="No conduct incidents or awards recorded." />
                        )}
                    </div>
                </div>
            )}

            <StatusModal open={statusOpen} onClose={() => setStatusOpen(false)} studentId={student.id} current={student.status} statuses={statuses} />
            <GuardianModal open={guardianOpen} onClose={() => setGuardianOpen(false)} studentId={student.id} />
            <DocumentModal open={docOpen} onClose={() => setDocOpen(false)} studentId={student.id} />
        </>
    );
}

function StatusModal({ open, onClose, studentId, current, statuses }: { open: boolean; onClose: () => void; studentId: number; current: string; statuses: Option[] }) {
    const form = useForm({ status: current, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/students/${studentId}/status`, { preserveScroll: true, onSuccess: () => onClose() });
    };
    return (
        <Modal open={open} onClose={onClose} title="Change student status">
            <form onSubmit={submit} className="space-y-4">
                <Select label="New status" value={form.data.status} onChange={(e) => form.setData('status', e.target.value)} options={statuses} error={form.errors.status} />
                <Input label="Effective date" type="date" value={form.data.effective_date} onChange={(e) => form.setData('effective_date', e.target.value)} />
                <Textarea label="Reason" required value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} error={form.errors.reason} placeholder="e.g. Transferred to Azania Secondary School" />
                <div className="flex justify-end gap-3">
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

function GuardianModal({ open, onClose, studentId }: { open: boolean; onClose: () => void; studentId: number }) {
    const form = useForm({ guardian_id: '', first_name: '', last_name: '', phone: '', email: '', relationship: 'Guardian', is_primary: false });
    const [results, setResults] = useState<Option[]>([]);

    const search = async (q: string) => {
        if (q.length < 2) return setResults([]);
        const res = await fetch(`/guardians/search?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
        setResults(await res.json());
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/students/${studentId}/guardians`, { preserveScroll: true, onSuccess: () => (form.reset(), onClose()) });
    };

    return (
        <Modal open={open} onClose={onClose} title="Link a guardian" size="lg">
            <form onSubmit={submit} className="space-y-4">
                <Input label="Search existing guardians" placeholder="Type a name or phone…" onChange={(e) => search(e.target.value)} />
                {results.length > 0 && (
                    <Select label="Select existing guardian" placeholder="— or create a new one below —" value={form.data.guardian_id} onChange={(e) => form.setData('guardian_id', e.target.value)} options={results} />
                )}
                {!form.data.guardian_id && (
                    <FormGrid>
                        <Input label="First name" value={form.data.first_name} onChange={(e) => form.setData('first_name', e.target.value)} error={form.errors.first_name} />
                        <Input label="Last name" value={form.data.last_name} onChange={(e) => form.setData('last_name', e.target.value)} error={form.errors.last_name} />
                        <Input label="Phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        <Input label="Email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                    </FormGrid>
                )}
                <FormGrid>
                    <Select label="Relationship" value={form.data.relationship} onChange={(e) => form.setData('relationship', e.target.value)} options={['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor']} />
                    <label className="mt-7 flex items-center gap-2">
                        <input type="checkbox" className="form-checkbox" checked={form.data.is_primary} onChange={(e) => form.setData('is_primary', e.target.checked)} /> Primary contact
                    </label>
                </FormGrid>
                <div className="flex justify-end gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        Link guardian
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function DocumentModal({ open, onClose, studentId }: { open: boolean; onClose: () => void; studentId: number }) {
    const form = useForm<{ title: string; file: File | null }>({ title: '', file: null });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(`/students/${studentId}/documents`, { forceFormData: true, preserveScroll: true, onSuccess: () => (form.reset(), onClose()) });
    };
    return (
        <Modal open={open} onClose={onClose} title="Upload document">
            <form onSubmit={submit} className="space-y-4">
                <Input label="Document title" required value={form.data.title} onChange={(e) => form.setData('title', e.target.value)} error={form.errors.title} placeholder="e.g. Birth certificate" />
                <Input label="File" type="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)} error={form.errors.file} help="PDF, image or Word document up to 5 MB" />
                <div className="flex justify-end gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Upload
                    </button>
                </div>
            </form>
        </Modal>
    );
}
