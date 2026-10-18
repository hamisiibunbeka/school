import { Link, router, useForm, usePage } from '@inertiajs/react';
import {
    BedDouble,
    BookOpen,
    CalendarCheck,
    ClipboardList,
    Eye,
    FileText,
    HandHeart,
    History,
    IdCard,
    LoaderCircle,
    Mail,
    Paperclip,
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
import PersonDuties, { type PersonDuty } from '../duties/_components/person-duties';
import SponsorshipFields, { emptySponsorship, MAX_ATTACHMENT_MB, type SponsorOption, type SponsorshipInput } from './_components/sponsorship-fields';

type Sponsorship = {
    id: number;
    sponsor_id: number;
    coverage: string;
    percentage: string | null;
    covers: string | null;
    reference: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
    notes: string | null;
    attachment_name: string | null;
    attachment_size: number | null;
    sponsor: { id: number; name: string; type: string; contact_person: string | null; phone: string | null; email: string | null; address: string | null } | null;
};

type Guardian = {
    id: number;
    full_name: string;
    phone: string;
    email: string | null;
    occupation: string | null;
    user_id: number | null;
    pivot: { relationship: string; is_primary: boolean };
};
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
        sponsorships: Sponsorship[];
        documents: { id: number; title: string; mime_type: string | null; size: number | null; created_at: string; uploader: { name: string } | null }[];
        enrolments: {
            id: number;
            status: string;
            start_date: string | null;
            end_date: string | null;
            remarks: string | null;
            academic_year: { name: string } | null;
            school_class: { name: string } | null;
            stream: { name: string } | null;
        }[];
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
    care: {
        teachers: CarePerson[];
        dormitory: { name: string | null; room: string | null; bed: string | null; caretakers: CarePerson[] } | null;
    };
    duties: PersonDuty[];
    statuses: Option[];
    sponsors: SponsorOption[];
    sponsorTypes: Option[];
};

type CarePerson = { id: number; name: string; phone: string | null; role: string };

function CareRow({ p }: { p: CarePerson }) {
    return (
        <div className="flex items-center gap-3">
            <Avatar name={p.name} className="h-9 w-9 text-xs" />
            <div className="min-w-0">
                <div className="truncate font-semibold text-black dark:text-white-light">{p.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-white-dark">
                    <span>{p.role}</span>
                    {p.phone && (
                        <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {p.phone}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

const coverageLabel = (sp: Pick<Sponsorship, 'coverage' | 'percentage'>) => (sp.coverage === 'partial' ? `${Number(sp.percentage)}% (partial)` : 'Full sponsorship');

export default function StudentShow({ student, attendance, finance, results, discipline, care, duties, statuses, sponsors, sponsorTypes }: Props) {
    const can = useCan();
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const [tab, setTab] = useState('overview');
    const [statusOpen, setStatusOpen] = useState(false);
    const [guardianOpen, setGuardianOpen] = useState(false);
    const [docOpen, setDocOpen] = useState(false);
    const [sponsorModal, setSponsorModal] = useState<Sponsorship | 'new' | null>(null);
    const activeSponsorships = student.sponsorships.filter((sp) => sp.status === 'active');

    const totalDays = attendance.present + attendance.absent + attendance.late + attendance.excused;
    const attendanceRate = totalDays ? Math.round(((attendance.present + attendance.late) / totalDays) * 100) : null;

    const tabs = [
        { key: 'overview', label: 'Overview', icon: BookOpen },
        { key: 'guardians', label: 'Guardians', icon: Users, count: student.guardians.length },
        { key: 'sponsorship', label: 'Sponsorship', icon: HandHeart, count: activeSponsorships.length },
        { key: 'academics', label: 'Results', icon: FileText, count: results.length },
        { key: 'fees', label: 'Fees', icon: Wallet },
        { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
        { key: 'duties', label: 'Duties', icon: ClipboardList, count: duties.filter((d) => d.status !== 'ended').length },
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
                            {activeSponsorships.map((sp) => (
                                <button
                                    key={sp.id}
                                    type="button"
                                    onClick={() => setTab('sponsorship')}
                                    className="badge badge-soft-success inline-flex items-center gap-1"
                                    title={coverageLabel(sp)}
                                >
                                    <HandHeart className="h-3 w-3" /> Sponsored by {sp.sponsor?.name}
                                </button>
                            ))}
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
                    <div className="panel">
                        <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                            <Users className="h-5 w-5 text-primary" /> Class teacher
                        </h5>
                        {care.teachers.length ? (
                            <div className="space-y-3">
                                {care.teachers.map((p) => (
                                    <CareRow key={`${p.role}-${p.id}`} p={p} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-white-dark">No class teacher assigned to {student.class || 'this class'} yet.</p>
                        )}
                    </div>
                    <div className="panel">
                        <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                            <BedDouble className="h-5 w-5 text-secondary" /> Boarding
                        </h5>
                        {care.dormitory ? (
                            <>
                                <div className="mb-3 text-sm">
                                    <span className="font-semibold text-black dark:text-white-light">{care.dormitory.name}</span>
                                    <span className="text-white-dark">
                                        {' '}
                                        · {care.dormitory.room}
                                        {care.dormitory.bed && `, bed ${care.dormitory.bed}`}
                                    </span>
                                </div>
                                {care.dormitory.caretakers.length ? (
                                    <div className="space-y-3">
                                        {care.dormitory.caretakers.map((p) => (
                                            <CareRow key={p.id} p={p} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-warning">No patron / matron assigned to this dormitory.</p>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-white-dark">{student.residence_type === 'boarding' ? 'Boarder without a bed allocation.' : 'Day scholar — no dormitory.'}</p>
                        )}
                    </div>
                    <div className="panel">
                        <div className="mb-4 flex items-center justify-between">
                            <h5 className="flex items-center gap-2 text-lg font-bold">
                                <ClipboardList className="h-5 w-5 text-warning" /> Duties
                            </h5>
                            <button type="button" className="text-sm font-bold text-primary hover:underline" onClick={() => setTab('duties')}>
                                All duties
                            </button>
                        </div>
                        <PersonDuties duties={duties} href="/students/duties" compact />
                    </div>
                </div>
            )}

            {tab === 'duties' && (
                <div className="panel">
                    <div className="mb-4 flex items-center justify-between">
                        <h5 className="text-lg font-bold">Duties after class</h5>
                        <Link href="/students/duties" className="text-sm font-bold text-primary hover:underline">
                            Duty roster
                        </Link>
                    </div>
                    <PersonDuties duties={duties} href="/students/duties" />
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
                                            {g.user_id ? (
                                                <span className="badge badge-soft-success">Portal access active</span>
                                            ) : (
                                                <span className="badge badge-soft-dark">No portal access</span>
                                            )}
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

            {tab === 'sponsorship' && (
                <div className="panel">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h5 className="text-lg font-bold">Sponsorship</h5>
                            <p className="text-xs text-white-dark">Who pays for or supports this student's education, current and past.</p>
                        </div>
                        {can('students.manage') && (
                            <button className="btn btn-primary btn-sm" onClick={() => setSponsorModal('new')}>
                                <HandHeart className="h-4 w-4" /> Add sponsor
                            </button>
                        )}
                    </div>
                    {student.sponsorships.length ? (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {student.sponsorships.map((sp) => (
                                <div
                                    key={sp.id}
                                    className={`rounded-lg border p-4 ${sp.status === 'active' ? 'border-success/40' : 'border-white-light opacity-75 dark:border-[#1b2e4b]'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <Avatar name={sp.sponsor?.name} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="truncate font-bold">{sp.sponsor?.name}</span>
                                                <StatusBadge status={sp.status} label={sp.status === 'active' ? 'Active' : 'Ended'} />
                                            </div>
                                            <div className="text-xs text-white-dark">{titleCase(sp.sponsor?.type ?? '')}</div>
                                        </div>
                                        {can('students.manage') && (
                                            <div className="flex gap-2">
                                                <button className="text-primary hover:opacity-70" title="Edit" onClick={() => setSponsorModal(sp)}>
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                {sp.status === 'active' && (
                                                    <button
                                                        className="text-warning hover:opacity-70"
                                                        title="End sponsorship"
                                                        onClick={async () => {
                                                            const { confirmed } = await confirm({
                                                                title: `End sponsorship by ${sp.sponsor?.name}?`,
                                                                text: 'It ends today and stays in the history.',
                                                                confirmText: 'End sponsorship',
                                                            });
                                                            if (confirmed)
                                                                router.post(
                                                                    `/sponsorships/${sp.id}/end`,
                                                                    { end_date: new Date().toISOString().slice(0, 10) },
                                                                    { preserveScroll: true },
                                                                );
                                                        }}
                                                    >
                                                        <RefreshCw className="h-4 w-4" />
                                                    </button>
                                                )}
                                                <button
                                                    className="text-danger hover:opacity-70"
                                                    title="Delete (entered by mistake)"
                                                    onClick={async () => {
                                                        const { confirmed } = await confirm({
                                                            title: 'Delete this sponsorship record?',
                                                            text: 'Use this only for entries made by mistake. To stop a real sponsorship, end it instead.',
                                                            danger: true,
                                                            confirmText: 'Delete',
                                                        });
                                                        if (confirmed) router.delete(`/sponsorships/${sp.id}`, { preserveScroll: true });
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                        {[
                                            ['Coverage', coverageLabel(sp)],
                                            ['Pays for', sp.covers],
                                            ['Period', `${sp.start_date ? date(sp.start_date) : '—'} → ${sp.end_date ? date(sp.end_date) : 'open-ended'}`],
                                            ['Agreement ref.', sp.reference],
                                            ['Contact person', sp.sponsor?.contact_person],
                                            ['Address', sp.sponsor?.address],
                                        ].map(([k, v]) => (
                                            <div key={k as string}>
                                                <dt className="text-xs font-bold text-white-dark uppercase">{k}</dt>
                                                <dd className="font-semibold">{v || '—'}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                    {sp.attachment_name && (
                                        <a
                                            href={`/sponsorships/${sp.id}/attachment`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border border-white-light px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-light dark:border-[#1b2e4b] dark:hover:bg-primary-dark-light"
                                        >
                                            <Paperclip className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{sp.attachment_name}</span>
                                        </a>
                                    )}
                                    {(sp.sponsor?.phone || sp.sponsor?.email) && (
                                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                                            {sp.sponsor?.phone && (
                                                <span className="flex items-center gap-2">
                                                    <Phone className="h-4 w-4 text-white-dark" /> {sp.sponsor.phone}
                                                </span>
                                            )}
                                            {sp.sponsor?.email && (
                                                <span className="flex items-center gap-2">
                                                    <Mail className="h-4 w-4 text-white-dark" /> {sp.sponsor.email}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            title="Not sponsored"
                            description="Fees and support come from the parents/guardians. Add a sponsor if an organisation or well-wisher supports this student."
                        />
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
                                                    <td className="text-center!">{s.is_absent ? <span className="badge badge-soft-danger">ABS</span> : (s.score ?? '—')}</td>
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
                            Overall attendance rate: <strong className="text-black dark:text-white-light">{attendanceRate !== null ? `${attendanceRate}%` : '—'}</strong> across{' '}
                            {totalDays} recorded school days.
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
                                            <td className="font-semibold">
                                                <a
                                                    href={`/students/${student.id}/documents/${d.id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                                                >
                                                    <Paperclip className="h-4 w-4 shrink-0" /> {d.title}
                                                </a>
                                            </td>
                                            <td>{d.mime_type ?? '—'}</td>
                                            <td>{d.size ? `${Math.round(d.size / 1024)} KB` : '—'}</td>
                                            <td>
                                                {dateTime(d.created_at)} {d.uploader && <span className="text-white-dark">by {d.uploader.name}</span>}
                                            </td>
                                            <td className="text-end! whitespace-nowrap">
                                                <a
                                                    href={`/students/${student.id}/documents/${d.id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="me-3 inline-block text-info hover:opacity-70"
                                                    title="View / download"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </a>
                                                {can('students.manage') && (
                                                    <button
                                                        className="text-danger"
                                                        title="Delete"
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
            <SponsorshipModal
                key={sponsorModal === null ? 'closed' : sponsorModal === 'new' ? 'new' : sponsorModal.id}
                sponsorship={sponsorModal}
                onClose={() => setSponsorModal(null)}
                studentId={student.id}
                sponsors={sponsors}
                sponsorTypes={sponsorTypes}
            />
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
                <Textarea
                    label="Reason"
                    required
                    value={form.data.reason}
                    onChange={(e) => form.setData('reason', e.target.value)}
                    error={form.errors.reason}
                    placeholder="e.g. Transferred to Azania Secondary School"
                />
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

function SponsorshipModal({
    sponsorship,
    onClose,
    studentId,
    sponsors,
    sponsorTypes,
}: {
    sponsorship: Sponsorship | 'new' | null;
    onClose: () => void;
    studentId: number;
    sponsors: SponsorOption[];
    sponsorTypes: Option[];
}) {
    const existing = sponsorship && sponsorship !== 'new' ? sponsorship : null;
    const initial: SponsorshipInput = existing
        ? {
              ...emptySponsorship(),
              sponsor_id: String(existing.sponsor_id),
              sponsor: {
                  name: existing.sponsor?.name ?? '',
                  type: existing.sponsor?.type ?? 'organization',
                  contact_person: existing.sponsor?.contact_person ?? '',
                  phone: existing.sponsor?.phone ?? '',
                  email: existing.sponsor?.email ?? '',
                  address: existing.sponsor?.address ?? '',
              },
              coverage: existing.coverage,
              percentage: existing.percentage ? String(Number(existing.percentage)) : '',
              covers: existing.covers ?? '',
              reference: existing.reference ?? '',
              start_date: existing.start_date?.slice(0, 10) ?? '',
              end_date: existing.end_date?.slice(0, 10) ?? '',
              notes: existing.notes ?? '',
          }
        : emptySponsorship();
    const form = useForm(initial);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        // Multipart so the optional attachment uploads; PUT is spoofed because browsers can't send files with PUT.
        const opts = { preserveScroll: true, forceFormData: true, onSuccess: onClose };
        if (existing) {
            form.transform((d) => ({ ...d, _method: 'put' }));
            form.post(`/sponsorships/${existing.id}`, opts);
        } else {
            form.transform((d) => d);
            form.post(`/students/${studentId}/sponsorships`, opts);
        }
    };

    return (
        <Modal open={sponsorship !== null} onClose={onClose} title={existing ? `Edit sponsorship — ${existing.sponsor?.name ?? ''}` : 'Add sponsor'} size="xl">
            <form onSubmit={submit} className="space-y-4">
                <SponsorshipFields
                    value={form.data}
                    onChange={(next) => form.setData(next)}
                    errors={form.errors as Record<string, string>}
                    sponsors={sponsors}
                    sponsorTypes={sponsorTypes}
                    lockSponsor={!!existing}
                    currentAttachment={existing?.attachment_name ? { name: existing.attachment_name, url: `/sponsorships/${existing.id}/attachment` } : null}
                />
                <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Save sponsorship
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
                    <Select
                        label="Select existing guardian"
                        placeholder="— or create a new one below —"
                        value={form.data.guardian_id}
                        onChange={(e) => form.setData('guardian_id', e.target.value)}
                        options={results}
                    />
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
                    <Select
                        label="Relationship"
                        value={form.data.relationship}
                        onChange={(e) => form.setData('relationship', e.target.value)}
                        options={['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor']}
                    />
                    <label className="mt-7 flex items-center gap-2">
                        <input type="checkbox" className="form-checkbox" checked={form.data.is_primary} onChange={(e) => form.setData('is_primary', e.target.checked)} /> Primary
                        contact
                    </label>
                </FormGrid>
                <div className="flex justify-center gap-3">
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
    const tooBig = !!form.data.file && form.data.file.size > MAX_ATTACHMENT_MB * 1048576;
    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (tooBig) return;
        form.post(`/students/${studentId}/documents`, { forceFormData: true, preserveScroll: true, onSuccess: () => (form.reset(), onClose()) });
    };
    return (
        <Modal open={open} onClose={onClose} title="Upload document">
            <form onSubmit={submit} className="space-y-4">
                <Input
                    label="Document title"
                    required
                    value={form.data.title}
                    onChange={(e) => form.setData('title', e.target.value)}
                    error={form.errors.title}
                    placeholder="e.g. Birth certificate"
                />
                <Input
                    label="File"
                    type="file"
                    required
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => form.setData('file', e.target.files?.[0] ?? null)}
                    error={
                        form.errors.file ?? (tooBig ? `This file is ${((form.data.file?.size ?? 0) / 1048576).toFixed(1)} MB — the limit is ${MAX_ATTACHMENT_MB} MB.` : undefined)
                    }
                    help={`PDF, image or Word document up to ${MAX_ATTACHMENT_MB} MB`}
                />
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing || tooBig}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Upload
                    </button>
                </div>
            </form>
        </Modal>
    );
}
