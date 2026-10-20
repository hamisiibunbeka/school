import { Link, router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, ArrowRight, BadgeCheck, Check, FileText, GraduationCap, Handshake, History, Pencil, Phone, ShieldAlert, Mail, UserPlus, Globe, Paperclip, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import EmptyState from '@/components/ui/empty-state';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, dateTime, money, titleCase, today } from '@/lib/utils';
import DeferralModal, { type DeferralTarget } from '@/pages/fees/_components/deferral-modal';
import type { Option } from '@/types';

type Application = {
    id: number;
    application_no: string;
    full_name: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    gender: string;
    date_of_birth: string | null;
    age: number | null;
    school_class_id: number | null;
    class: string | null;
    combination?: string | null;
    combination_name?: string | null;
    csee_index_no?: string | null;
    csee_division?: string | null;
    csee_points?: number | null;
    year: string | null;
    residence_type: string;
    previous_school: string | null;
    address: string | null;
    guardian_name: string;
    guardian_relationship: string;
    guardian_phone: string;
    guardian_email: string | null;
    medical_notes: string | null;
    notes: string | null;
    interview_date: string | null;
    assessment_score: string | null;
    status: string;
    source?: 'online' | 'office';
    guardian_occupation?: string | null;
    nationality?: string | null;
    documents?: { index: number; title: string; size: number | null; mime: string | null }[];
    decision_notes: string | null;
    decided_at: string | null;
    decider: string | null;
    created_at: string | null;
    student: { id: number; name: string; admission_no: string } | null;
};
type Duplicate = { id: number; name: string; admission_no: string; class: string | null; status: string; date_of_birth: string | null };
type Clearance = {
    state: 'awaiting' | 'paid' | 'deferred';
    required?: string;
    paid?: string;
    outstanding?: string;
    ready?: boolean;
    basis?: string;
    year?: string | null;
    schedule?: { name: string; percent: string; due_date: string; amount: string; cumulative: string; met: boolean }[];
    cleared_at: string | null;
    cleared_by: string | null;
    invoice: { id: number; invoice_no: string; total: string; balance: string; status: string } | null;
    agreement: { id: number; amount: string; paid: string; due_date: string; reason: string; terms: string | null; status: string; authorizer: string | null } | null;
};
type HistoryItem = { id: number; action: string; description: string | null; user: string | null; created_at: string | null };
type Props = {
    application: Application;
    transitions: string[];
    decisions: string[];
    duplicates: Duplicate[];
    classes: (Option & { streams: (Option & { combination?: string | null })[] })[];
    currentYear: string | null;
    history?: HistoryItem[];
    clearance: Clearance | null;
};

const STEPS = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'under_review', label: 'Review' },
    { key: 'interview', label: 'Interview' },
    { key: 'decision', label: 'Decision' },
    { key: 'fees', label: 'Fee clearance' },
    { key: 'enrolled', label: 'Enrolled' },
];

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
    under_review: { label: 'Start review', cls: 'btn-info' },
    interview: { label: 'Schedule interview', cls: 'btn-secondary' },
    accepted: { label: 'Accept', cls: 'btn-success' },
    waitlisted: { label: 'Waitlist', cls: 'btn-warning' },
    rejected: { label: 'Reject', cls: 'btn-outline-danger' },
    withdrawn: { label: 'Withdraw', cls: 'btn-outline-dark' },
};

function stepIndex(status: string): number {
    switch (status) {
        case 'submitted':
            return 0;
        case 'under_review':
            return 1;
        case 'interview':
            return 2;
        case 'accepted':
        case 'waitlisted':
        case 'rejected':
            return 3;
        case 'awaiting_fees':
            return 4;
        case 'enrolled':
            return 5;
        default:
            return -1;
    }
}

export default function AdmissionShow({ application: a, transitions, decisions, duplicates, classes, currentYear, history = [], clearance }: Props) {
    const can = useCan();
    const manage = can('admissions.manage');
    const cur = usePage().props.school?.currency ?? 'TZS';
    const [deferring, setDeferring] = useState<DeferralTarget | null>(null);
    const clearanceError = (usePage().props.errors as Record<string, string>).clearance;

    const verifyFees = async () => {
        const { confirmed } = await confirm({
            title: `Clear ${a.full_name}?`,
            text: `${money(clearance?.paid, cur)} received against ${money(clearance?.required, cur)} required. The student is enrolled and appears in the student directory.`,
            confirmText: 'Verify & enrol',
        });
        if (confirmed) router.post(`/fees/clearance/${a.id}/verify`, {}, { preserveScroll: true });
    };
    const [target, setTarget] = useState<string | null>(null);
    const [enrolOpen, setEnrolOpen] = useState(false);
    const move = useForm({ status: '', decision_notes: '', interview_date: '', assessment_score: '' });
    // Form Five: preselect the stream that teaches the applicant's combination.
    const comboStream = a.combination ? classes.find((c) => c.value === a.school_class_id)?.streams.find((s) => s.combination === a.combination) : undefined;
    const enrol = useForm({
        school_class_id: a.school_class_id ? String(a.school_class_id) : '',
        stream_id: comboStream ? String(comboStream.value) : '',
        admission_no: '',
        admission_date: today(),
        confirm_duplicate: false,
    });
    const streams = classes.find((c) => String(c.value) === enrol.data.school_class_id)?.streams ?? [];
    const current = stepIndex(a.status);
    const closed = ['rejected', 'withdrawn'].includes(a.status);

    const openMove = (status: string) => {
        move.clearErrors();
        move.setData({ status, decision_notes: '', interview_date: a.interview_date ?? '', assessment_score: a.assessment_score ? String(Number(a.assessment_score)) : '' });
        setTarget(status);
    };

    const submitMove = (e: FormEvent) => {
        e.preventDefault();
        move.post(`/admissions/${a.id}/transition`, { preserveScroll: true, onSuccess: () => setTarget(null) });
    };

    const submitEnrol = (e: FormEvent) => {
        e.preventDefault();
        enrol.post(`/admissions/${a.id}/enrol`, { preserveScroll: true, onSuccess: () => setEnrolOpen(false) });
    };

    const needsNotes = target ? decisions.includes(target) : false;

    return (
        <>
            <PageHeader
                title={a.full_name}
                subtitle={`Application ${a.application_no}`}
                breadcrumbs={[{ title: 'Admissions', href: '/admissions' }, { title: a.application_no }]}
                actions={
                    <>
                        {a.combination && ['accepted', 'awaiting_fees', 'enrolled'].includes(a.status) && (
                            <Link href={`/admissions/joining-instructions/print?application=${a.id}`} className="btn btn-outline-primary">
                                <FileText className="h-4 w-4" /> Joining instruction
                            </Link>
                        )}
                        {['accepted', 'awaiting_fees', 'enrolled'].includes(a.status) && (
                            <Link href={`/admissions/${a.id}/letter`} className="btn btn-outline-dark">
                                <FileText className="h-4 w-4" /> Admission letter
                            </Link>
                        )}
                        {manage && !['awaiting_fees', 'enrolled', 'withdrawn', 'rejected'].includes(a.status) && (
                            <Link href={`/admissions/${a.id}/edit`} className="btn btn-outline-primary">
                                <Pencil className="h-4 w-4" /> Edit
                            </Link>
                        )}
                        {a.student && a.status === 'enrolled' && (
                            <Link href={`/students/${a.student.id}`} className="btn btn-primary">
                                <GraduationCap className="h-4 w-4" /> View student
                            </Link>
                        )}
                    </>
                }
            />

            {/* Header + workflow */}
            <div className="panel mb-6 overflow-hidden p-0">
                <div className="h-20 bg-gradient-to-r from-[#4361ee] via-[#805dca] to-[#ef1262]" />
                <div className="flex flex-col gap-5 px-6 pb-6 md:flex-row md:items-end">
                    <Avatar name={a.full_name} className="-mt-10 h-24 w-24 border-4 border-white text-2xl shadow-lg dark:border-black" />
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-2xl font-extrabold text-black dark:text-white-light">{a.full_name}</h2>
                            <StatusBadge status={a.status} />
                            {a.source === 'online' && (
                                <span className="badge badge-soft-info inline-flex items-center gap-1">
                                    <Globe className="h-3.5 w-3.5" /> Online application
                                </span>
                            )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white-dark">
                            <span>
                                Applying for <strong className="text-black dark:text-white-light">{a.class ?? '—'}</strong> {a.year && `· ${a.year}`}
                                {a.combination && (
                                    <span className="badge badge-soft-secondary ms-2" title={a.combination_name ?? ''}>
                                        {a.combination}
                                    </span>
                                )}
                            </span>
                            <span>{titleCase(a.gender)}</span>
                            {a.age !== null && <span>{a.age} yrs</span>}
                            <span className="badge badge-soft-secondary">{titleCase(a.residence_type)}</span>
                            <span>Applied {date(a.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="border-t border-white-light px-6 py-5 dark:border-[#1b2e4b]">
                    <div className="flex items-center overflow-x-auto pb-1">
                        {STEPS.map((s, i) => {
                            const done = current > i || (current === i && a.status === 'enrolled');
                            const active = current === i && a.status !== 'enrolled';
                            const label =
                                s.key === 'decision' && current === 3
                                    ? titleCase(a.status)
                                    : s.key === 'decision' && current > 3
                                      ? 'Accepted'
                                      : s.label;
                            return (
                                <div key={s.key} className="flex min-w-[110px] flex-1 items-center">
                                    <div className="flex flex-col items-center gap-1.5">
                                        <span
                                            className={cn(
                                                'grid h-9 w-9 place-content-center rounded-full border-2 text-sm font-bold',
                                                done && 'border-success bg-success text-white',
                                                active &&
                                                    (a.status === 'rejected'
                                                        ? 'border-danger bg-danger text-white'
                                                        : a.status === 'waitlisted'
                                                          ? 'border-warning bg-warning text-white'
                                                          : 'border-primary bg-primary text-white'),
                                                !done && !active && 'border-white-light text-white-dark dark:border-[#1b2e4b]',
                                            )}
                                        >
                                            {done ? <Check className="h-4 w-4" /> : i + 1}
                                        </span>
                                        <span className={cn('text-xs font-bold whitespace-nowrap', active || done ? 'text-black dark:text-white-light' : 'text-white-dark')}>
                                            {label}
                                        </span>
                                    </div>
                                    {i < STEPS.length - 1 && <div className={cn('mx-2 mb-5 h-0.5 flex-1', current > i ? 'bg-success' : 'bg-white-light dark:bg-[#1b2e4b]')} />}
                                </div>
                            );
                        })}
                    </div>
                    {a.status === 'withdrawn' && <p className="mt-3 text-sm font-semibold text-white-dark">This application was withdrawn.</p>}

                    {manage && (transitions.length > 0 || a.status === 'accepted') && (
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            <span className="me-2 text-xs font-bold text-white-dark uppercase">Next step</span>
                            {a.status === 'accepted' && (
                                <button className="btn btn-primary" onClick={() => setEnrolOpen(true)}>
                                    <UserPlus className="h-4 w-4" /> Enrol as student
                                </button>
                            )}
                            {transitions.map((t) => (
                                <button key={t} className={cn('btn', ACTION_LABEL[t]?.cls ?? 'btn-outline-primary')} onClick={() => openMove(t)}>
                                    {ACTION_LABEL[t]?.label ?? titleCase(t)} {t !== 'withdrawn' && t !== 'rejected' && <ArrowRight className="h-4 w-4" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {a.status === 'accepted' && duplicates.length > 0 && (
                <div className="mb-6 flex items-start gap-3 rounded-md border border-warning/40 bg-warning-light p-4 text-warning dark:bg-warning-dark-light">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="text-sm">
                        <div className="font-bold">Possible duplicate student record</div>
                        <div className="mt-1 text-black dark:text-white-light">
                            {duplicates.map((d) => (
                                <div key={d.id}>
                                    <Link href={`/students/${d.id}`} className="font-semibold text-primary hover:underline">
                                        {d.name} ({d.admission_no})
                                    </Link>{' '}
                                    · {d.class ?? 'no class'} · born {date(d.date_of_birth)} · {titleCase(d.status)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    {clearance && (
                        <div className={cn('panel border-s-4', clearance.state === 'awaiting' ? 'border-warning' : clearance.state === 'deferred' ? 'border-secondary' : 'border-success')}>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h5 className="flex items-center gap-2 text-lg font-bold">
                                    <Wallet className="h-5 w-5 text-primary" /> Fee clearance
                                </h5>
                                {clearance.state === 'awaiting' ? (
                                    <StatusBadge status="awaiting_fees" label={clearance.ready ? 'Paid — awaiting verification' : 'Awaiting payment'} tone={clearance.ready ? 'success' : 'warning'} />
                                ) : (
                                    <StatusBadge status={clearance.state} label={clearance.state === 'deferred' ? 'Enrolled on payment agreement' : 'Cleared by finance'} tone={clearance.state === 'deferred' ? 'secondary' : 'success'} />
                                )}
                            </div>

                            {clearance.state === 'awaiting' && (
                                <>
                                    <p className="mb-4 text-sm text-white-dark">
                                        {a.full_name} is admitted as <strong className="text-black dark:text-white-light">{a.student?.admission_no}</strong> but stays out of the student
                                        directory until finance verifies the payment below, or a head authorizes a payment agreement.
                                    </p>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <div className="rounded-lg bg-primary-light p-4 dark:bg-primary-dark-light">
                                            <div className="text-xs font-bold text-white-dark uppercase">Required to clear</div>
                                            <div className="text-lg font-extrabold text-primary">{money(clearance.required, cur)}</div>
                                            <div className="text-[11px] text-white-dark">{clearance.basis}</div>
                                        </div>
                                        <div className="rounded-lg bg-success-light p-4 dark:bg-success-dark-light">
                                            <div className="text-xs font-bold text-white-dark uppercase">Paid</div>
                                            <div className="text-lg font-extrabold text-success">{money(clearance.paid, cur)}</div>
                                        </div>
                                        <div className={cn('rounded-lg p-4', clearance.ready ? 'bg-success-light dark:bg-success-dark-light' : 'bg-danger-light dark:bg-danger-dark-light')}>
                                            <div className="text-xs font-bold text-white-dark uppercase">Outstanding</div>
                                            <div className={cn('text-lg font-extrabold', clearance.ready ? 'text-success' : 'text-danger')}>{money(clearance.outstanding, cur)}</div>
                                        </div>
                                    </div>
                                    {(clearance.schedule ?? []).length > 0 && (
                                        <div className="table-responsive mt-4">
                                            <table className="table table-compact">
                                                <thead>
                                                    <tr>
                                                        <th>Installment ({clearance.year})</th>
                                                        <th>Due by</th>
                                                        <th className="text-end!">Amount</th>
                                                        <th className="text-end!">Cumulative</th>
                                                        <th />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(clearance.schedule ?? []).map((st) => (
                                                        <tr key={st.name}>
                                                            <td className="font-semibold">
                                                                {st.name} <span className="text-xs text-white-dark">({Number(st.percent)}%)</span>
                                                            </td>
                                                            <td>{date(st.due_date)}</td>
                                                            <td className="text-end!">{money(st.amount, cur)}</td>
                                                            <td className="text-end!">{money(st.cumulative, cur)}</td>
                                                            <td className="text-end!">{st.met ? <Check className="ms-auto h-4 w-4 text-success" /> : null}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {clearanceError && <p className="form-error mt-3">{clearanceError}</p>}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {can('fees.manage') && a.student && !clearance.ready && (
                                            <Link href={`/fees/payments/create?student=${a.student.id}`} className="btn btn-outline-primary">
                                                <Wallet className="h-4 w-4" /> Receive payment
                                            </Link>
                                        )}
                                        {can('fees.manage') && (
                                            <button className="btn btn-success" disabled={!clearance.ready} onClick={verifyFees}>
                                                <BadgeCheck className="h-4 w-4" /> Verify &amp; enrol
                                            </button>
                                        )}
                                        {can('fees.defer') && !clearance.ready && (
                                            <button
                                                className="btn btn-outline-secondary"
                                                onClick={() => setDeferring({ id: a.id, full_name: a.full_name, guardian_name: a.guardian_name, outstanding: clearance.outstanding ?? '0' })}
                                            >
                                                <Handshake className="h-4 w-4" /> Authorize deferral
                                            </button>
                                        )}
                                        {!can('fees.manage') && !can('fees.defer') && <p className="text-xs text-white-dark">Finance verifies payment from Fees → Admission Clearance.</p>}
                                    </div>
                                </>
                            )}

                            {clearance.state !== 'awaiting' && (
                                <p className="text-sm text-white-dark">
                                    {clearance.state === 'deferred' ? 'Payment agreement authorized' : 'Payment verified'} by{' '}
                                    <strong className="text-black dark:text-white-light">{clearance.cleared_by ?? '—'}</strong> · {dateTime(clearance.cleared_at)}
                                </p>
                            )}

                            {clearance.agreement && (
                                <div className="mt-4 rounded-md bg-secondary-light p-3 text-sm dark:bg-secondary-dark-light">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="font-bold text-secondary">
                                            {money(clearance.agreement.amount, cur)} agreed by {date(clearance.agreement.due_date)}
                                        </div>
                                        <StatusBadge status={clearance.agreement.status} />
                                    </div>
                                    <div className="mt-1 text-black dark:text-white-light">“{clearance.agreement.reason}”</div>
                                    {clearance.agreement.terms && <div className="mt-1 text-xs text-white-dark italic">Terms: {clearance.agreement.terms}</div>}
                                    <div className="mt-1 text-xs text-white-dark">
                                        Paid since agreement: {money(clearance.agreement.paid, cur)} · authorized by {clearance.agreement.authorizer ?? '—'}
                                    </div>
                                </div>
                            )}

                            {clearance.invoice && (
                                <div className="mt-3 text-xs text-white-dark">
                                    Admission invoice{' '}
                                    <Link href={`/fees/invoices/${clearance.invoice.id}`} className="font-semibold text-primary hover:underline">
                                        {clearance.invoice.invoice_no}
                                    </Link>{' '}
                                    · {money(clearance.invoice.total, cur)} · balance {money(clearance.invoice.balance, cur)} · <StatusBadge status={clearance.invoice.status} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Applicant details</h5>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                            {[
                                ['First name', a.first_name],
                                ['Middle name', a.middle_name],
                                ['Last name', a.last_name],
                                ['Date of birth', date(a.date_of_birth)],
                                ['Previous school', a.previous_school],
                                ...(a.combination
                                    ? [
                                          ['Combination', `${a.combination} — ${a.combination_name ?? ''}`],
                                          [
                                              'CSEE result',
                                              [a.csee_index_no, a.csee_division && `Division ${a.csee_division}`, a.csee_points && `${a.csee_points} points`]
                                                  .filter(Boolean)
                                                  .join(' · ') || null,
                                          ],
                                      ]
                                    : []),
                                ['Home address', a.address],
                                ['Intake', `${a.class ?? '—'} · ${a.year ?? '—'}`],
                                ['Residence', titleCase(a.residence_type)],
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-xs font-bold text-white-dark uppercase">{k}</dt>
                                    <dd className="font-semibold text-black dark:text-white-light">{v || '—'}</dd>
                                </div>
                            ))}
                        </dl>
                        {a.notes && (
                            <div className="mt-5 rounded-md bg-[#f6f8fa] p-3 text-sm dark:bg-[#1a2941]">
                                <div className="mb-1 text-xs font-bold text-white-dark uppercase">Office notes</div>
                                {a.notes}
                            </div>
                        )}
                    </div>

                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Assessment & decision</h5>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="rounded-lg bg-secondary-light p-4 dark:bg-secondary-dark-light">
                                <div className="text-xs font-bold text-white-dark uppercase">Interview date</div>
                                <div className="text-lg font-extrabold text-secondary">{date(a.interview_date)}</div>
                            </div>
                            <div className="rounded-lg bg-primary-light p-4 dark:bg-primary-dark-light">
                                <div className="text-xs font-bold text-white-dark uppercase">Assessment score</div>
                                <div className="text-lg font-extrabold text-primary">{a.assessment_score ? `${Number(a.assessment_score)}%` : '—'}</div>
                            </div>
                            <div className="rounded-lg bg-success-light p-4 dark:bg-success-dark-light">
                                <div className="text-xs font-bold text-white-dark uppercase">Last action</div>
                                <div className="text-sm font-extrabold text-success">{a.decider ?? '—'}</div>
                                <div className="text-xs text-white-dark">{dateTime(a.decided_at)}</div>
                            </div>
                        </div>
                        {a.decision_notes && (
                            <div className="mt-4 rounded-md border-s-4 border-primary bg-[#f6f8fa] p-3 text-sm dark:bg-[#1a2941]">
                                <div className="mb-1 text-xs font-bold text-white-dark uppercase">Decision notes</div>
                                {a.decision_notes}
                            </div>
                        )}
                        {a.student && a.status === 'enrolled' && (
                            <div className="mt-4 flex items-center gap-2 rounded-md bg-primary-light p-3 text-sm dark:bg-primary-dark-light">
                                <GraduationCap className="h-4 w-4 text-primary" /> Enrolled as{' '}
                                <Link href={`/students/${a.student.id}`} className="font-bold text-primary hover:underline">
                                    {a.student.name} · {a.student.admission_no}
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="panel">
                        <h5 className="mb-4 text-lg font-bold">Parent / guardian</h5>
                        <div className="flex items-center gap-3">
                            <Avatar name={a.guardian_name} />
                            <div>
                                <div className="font-bold">{a.guardian_name}</div>
                                <div className="text-xs text-white-dark">{a.guardian_relationship}</div>
                            </div>
                        </div>
                        <div className="mt-3 space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-white-dark" /> {a.guardian_phone}
                            </div>
                            {a.guardian_email && (
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-white-dark" /> {a.guardian_email}
                                </div>
                            )}
                        </div>
                        <h5 className="mt-6 mb-2 flex items-center gap-2 text-base font-bold">
                            <ShieldAlert className="h-4 w-4 text-danger" /> Health & welfare
                        </h5>
                        <p className="text-sm">{a.medical_notes || <span className="text-white-dark">Nothing recorded.</span>}</p>
                    </div>

                    {(a.documents ?? []).length > 0 && (
                        <div className="panel">
                            <h5 className="mb-3 flex items-center gap-2 text-lg font-bold">
                                <Paperclip className="h-5 w-5 text-primary" /> Uploaded documents
                            </h5>
                            <ul className="space-y-2">
                                {(a.documents ?? []).map((d) => (
                                    <li key={d.index}>
                                        <a
                                            href={`/admissions/${a.id}/documents/${d.index}`}
                                            className="flex items-center gap-3 rounded-md border border-white-light px-3 py-2 text-sm transition hover:border-primary hover:text-primary dark:border-[#1b2e4b]"
                                        >
                                            <FileText className="h-4 w-4 shrink-0" />
                                            <span className="flex-1 truncate font-semibold">{d.title}</span>
                                            {d.size ? <span className="text-xs text-white-dark">{Math.max(1, Math.round(d.size / 1024))} KB</span> : null}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs text-white-dark">Stored privately — every download is recorded in the audit trail.</p>
                        </div>
                    )}

                    <div className="panel">
                        <h5 className="mb-4 flex items-center gap-2 text-lg font-bold">
                            <History className="h-5 w-5" /> Audit trail
                        </h5>
                        {history.length === 0 ? (
                            <EmptyState title="No history yet" />
                        ) : (
                            <ol className="relative space-y-4 border-s border-white-light ps-5 dark:border-[#1b2e4b]">
                                {history.map((h) => (
                                    <li key={h.id} className="relative">
                                        <span
                                            className={cn(
                                                'absolute -start-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-black',
                                                h.action === 'enrolled' ? 'bg-primary' : h.action === 'status_changed' ? 'bg-secondary' : 'bg-success',
                                            )}
                                        />
                                        <div className="text-sm font-semibold text-black dark:text-white-light">{h.description}</div>
                                        <div className="text-xs text-white-dark">
                                            {h.user ?? 'System'} · {dateTime(h.created_at)}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {closed && <p className="mt-4 text-xs text-white-dark">This application is closed. No further workflow actions are available.</p>}
                    </div>
                </div>
            </div>

            <Modal open={!!target} onClose={() => setTarget(null)} title={`${ACTION_LABEL[target ?? '']?.label ?? 'Update'} · ${a.full_name}`}>
                <form onSubmit={submitMove} className="space-y-5">
                    {target === 'interview' && (
                        <FormGrid>
                            <Input
                                label="Interview / assessment date"
                                type="date"
                                required
                                value={move.data.interview_date}
                                onChange={(e) => move.setData('interview_date', e.target.value)}
                                error={move.errors.interview_date}
                            />
                            <Input
                                label="Assessment score (%)"
                                type="number"
                                min={0}
                                max={100}
                                step="0.5"
                                value={move.data.assessment_score}
                                onChange={(e) => move.setData('assessment_score', e.target.value)}
                                error={move.errors.assessment_score}
                                help="Can be added later"
                            />
                        </FormGrid>
                    )}
                    {target && ['accepted', 'waitlisted', 'rejected'].includes(target) && (
                        <Input
                            label="Assessment score (%)"
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={move.data.assessment_score}
                            onChange={(e) => move.setData('assessment_score', e.target.value)}
                            error={move.errors.assessment_score}
                        />
                    )}
                    <Textarea
                        label={needsNotes ? 'Decision notes' : 'Notes (optional)'}
                        required={needsNotes}
                        rows={4}
                        value={move.data.decision_notes}
                        onChange={(e) => move.setData('decision_notes', e.target.value)}
                        error={move.errors.decision_notes || move.errors.status}
                        placeholder={target === 'rejected' ? 'Reason for rejection…' : target === 'withdrawn' ? 'Reason for withdrawal…' : 'Basis for this decision…'}
                    />
                    <p className="text-xs text-white-dark">This action is recorded in the audit trail with your name and the time.</p>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setTarget(null)}>
                            Cancel
                        </button>
                        <button className={cn('btn', target === 'rejected' ? 'btn-danger' : 'btn-primary')} disabled={move.processing}>
                            Confirm
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={enrolOpen} onClose={() => setEnrolOpen(false)} title={`Enrol ${a.full_name}`} size="lg">
                <form onSubmit={submitEnrol} className="space-y-5">
                    <p className="text-sm text-white-dark">
                        Creates the student record from this application, links {a.guardian_name} as primary guardian (re-using an existing guardian with phone {a.guardian_phone})
                        and bills the current term&apos;s fees for {currentYear ?? 'the current year'}. The learner goes to finance for fee clearance and joins the student directory once
                        the first installment is verified, or a head authorizes a payment agreement.
                    </p>
                    <FormGrid>
                        <Select
                            label="Class"
                            required
                            placeholder="Select…"
                            options={classes}
                            value={enrol.data.school_class_id}
                            onChange={(e) => enrol.setData((d) => ({ ...d, school_class_id: e.target.value, stream_id: '' }))}
                            error={enrol.errors.school_class_id}
                        />
                        <Select
                            label="Stream"
                            placeholder={streams.length ? 'Select stream…' : 'No streams'}
                            options={streams}
                            value={enrol.data.stream_id}
                            onChange={(e) => enrol.setData('stream_id', e.target.value)}
                            error={enrol.errors.stream_id}
                        />
                        <Input
                            label="Admission number"
                            placeholder="Auto-generated if blank"
                            value={enrol.data.admission_no}
                            onChange={(e) => enrol.setData('admission_no', e.target.value)}
                            error={enrol.errors.admission_no}
                        />
                        <Input
                            label="Admission date"
                            type="date"
                            required
                            value={enrol.data.admission_date}
                            onChange={(e) => enrol.setData('admission_date', e.target.value)}
                            error={enrol.errors.admission_date}
                        />
                    </FormGrid>
                    {duplicates.length > 0 && (
                        <div className="rounded-md border border-warning/40 bg-warning-light p-3 text-sm dark:bg-warning-dark-light">
                            <div className="mb-2 flex items-center gap-2 font-bold text-warning">
                                <AlertTriangle className="h-4 w-4" /> {duplicates.length} existing student(s) share this name and date of birth
                            </div>
                            <Checkbox
                                label="I have checked — this is a different learner"
                                checked={enrol.data.confirm_duplicate}
                                onChange={(e) => enrol.setData('confirm_duplicate', e.target.checked)}
                            />
                            {enrol.errors.confirm_duplicate && <p className="form-error mt-1">{enrol.errors.confirm_duplicate}</p>}
                        </div>
                    )}
                    {(enrol.errors as Record<string, string>).status && <p className="form-error">{(enrol.errors as Record<string, string>).status}</p>}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setEnrolOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={enrol.processing}>
                            <UserPlus className="h-4 w-4" /> Admit &amp; send to finance
                        </button>
                    </div>
                </form>
            </Modal>

            <DeferralModal target={deferring} onClose={() => setDeferring(null)} />
        </>
    );
}
