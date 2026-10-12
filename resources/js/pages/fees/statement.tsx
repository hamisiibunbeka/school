import { Link, router, usePage } from '@inertiajs/react';
import { FilePlus2, UserRound, Wallet } from 'lucide-react';
import { useState } from 'react';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import { cn, date, money, titleCase, today } from '@/lib/utils';
import { PaymentInstructionsBox, type Instructions } from './_components/shared';
import { DateRangePicker } from '@/components/ui/date-picker';

type Entry = { date: string; type: 'invoice' | 'payment'; id: number; number: string; description: string; debit: string; credit: string; balance: string };

type Props = {
    student: {
        id: number;
        full_name: string;
        admission_no: string;
        photo_url: string | null;
        class: string;
        residence_type: string;
        status: string;
        guardian: { name: string; phone: string; address: string | null } | null;
    };
    entries: Entry[];
    summary: { opening: string; debits: string; credits: string; closing: string; outstanding: string; credit: string };
    filters: { from: string; to: string };
    instructions: Instructions;
};

export default function Statement({ student, entries, summary, filters, instructions }: Props) {
    const can = useCan();
    const cur = usePage().props.school?.currency ?? 'TZS';
    const [range, setRange] = useState(filters);
    const closing = Number(summary.closing);

    const apply = (r: { from: string; to: string }) => {
        setRange(r);
        router.get(`/fees/statements/${student.id}`, Object.fromEntries(Object.entries(r).filter(([, v]) => v)), { preserveState: true, preserveScroll: true, replace: true });
    };

    const balanceLabel = (v: number) => (v < 0 ? `${money(Math.abs(v), cur)} CR` : money(v, cur));

    return (
        <>
            <PageHeader
                title="Fee Statement"
                subtitle={`${student.full_name} · ${student.admission_no}`}
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Statements' }, { title: student.full_name }]}
                actions={
                    <>
                        {can('students.view') && (
                            <Link href={`/students/${student.id}`} className="btn btn-outline-dark">
                                <UserRound className="h-4 w-4" /> Profile
                            </Link>
                        )}
                        {can('fees.manage') && (
                            <>
                                <Link href={`/fees/invoices/create?student=${student.id}`} className="btn btn-outline-secondary">
                                    <FilePlus2 className="h-4 w-4" /> Invoice
                                </Link>
                                <Link href={`/fees/payments/create?student=${student.id}`} className="btn btn-success">
                                    <Wallet className="h-4 w-4" /> Collect payment
                                </Link>
                            </>
                        )}
                        <PrintButton label="Print statement" />
                    </>
                }
            />

            <div className="panel no-print mb-6 flex flex-wrap items-end gap-3">
                <div>
                    <label>Statement period</label>
                    <DateRangePicker from={range.from} to={range.to} placeholder="Full history" onChange={(from, to) => apply({ from, to })} />
                </div>
                {(range.from || range.to) && (
                    <button className="btn btn-outline-dark" onClick={() => apply({ from: '', to: '' })}>
                        Full history
                    </button>
                )}
                <div className="ms-auto grid grid-cols-2 gap-6 text-end sm:grid-cols-3">
                    <div>
                        <div className="text-xs font-bold text-white-dark uppercase">Charged</div>
                        <div className="text-lg font-extrabold">{money(summary.debits, cur)}</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-white-dark uppercase">Paid</div>
                        <div className="text-lg font-extrabold text-success">{money(summary.credits, cur)}</div>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-white-dark uppercase">Balance</div>
                        <div className={cn('text-lg font-extrabold', closing > 0 ? 'text-danger' : 'text-success')}>{balanceLabel(closing)}</div>
                    </div>
                </div>
            </div>

            <div className="panel mx-auto max-w-5xl print:max-w-none print:border-0 print:shadow-none">
                <Letterhead
                    title="Student Fee Statement"
                    meta={
                        <div className="space-y-0.5">
                            <div>Statement date: {date(today())}</div>
                            <div>
                                Period: {range.from ? date(range.from) : 'Start'} – {range.to ? date(range.to) : 'Today'}
                            </div>
                        </div>
                    }
                />

                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    <div>
                        <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">Student</div>
                        <div className="text-base font-bold text-black dark:text-white-light">{student.full_name}</div>
                        <div className="text-sm">Adm. No: {student.admission_no}</div>
                        <div className="text-sm">
                            {student.class || '—'} · {titleCase(student.residence_type)} · {titleCase(student.status)}
                        </div>
                    </div>
                    {student.guardian && (
                        <div className="sm:text-end">
                            <div className="mb-1 text-xs font-bold tracking-wide text-white-dark uppercase">Parent / Guardian</div>
                            <div className="font-semibold">{student.guardian.name}</div>
                            <div className="text-sm">{student.guardian.phone}</div>
                            {student.guardian.address && <div className="text-sm text-white-dark">{student.guardian.address}</div>}
                        </div>
                    )}
                </div>

                <div className="table-responsive mb-6">
                    <table className="table-compact table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Document</th>
                                <th>Description</th>
                                <th className="text-end!">Charges</th>
                                <th className="text-end!">Payments</th>
                                <th className="text-end!">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(range.from || Number(summary.opening) !== 0) && (
                                <tr className="bg-[#f8f9fa] dark:bg-[#0e1726]">
                                    <td>{range.from ? date(range.from) : '—'}</td>
                                    <td colSpan={4} className="font-semibold">
                                        Opening balance
                                    </td>
                                    <td className="text-end! font-bold">{balanceLabel(Number(summary.opening))}</td>
                                </tr>
                            )}
                            {entries.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-white-dark">
                                        No transactions in this period.
                                    </td>
                                </tr>
                            )}
                            {entries.map((e) => (
                                <tr key={`${e.type}-${e.id}`}>
                                    <td className="whitespace-nowrap">{date(e.date)}</td>
                                    <td>
                                        <Link href={e.type === 'invoice' ? `/fees/invoices/${e.id}` : `/fees/payments/${e.id}`} className={cn('font-semibold hover:underline', e.type === 'invoice' ? 'text-primary' : 'text-success')}>
                                            {e.number}
                                        </Link>
                                    </td>
                                    <td>{e.description}</td>
                                    <td className="text-end!">{Number(e.debit) > 0 ? money(e.debit, cur) : ''}</td>
                                    <td className="text-end! text-success">{Number(e.credit) > 0 ? money(e.credit, cur) : ''}</td>
                                    <td className={cn('text-end! font-semibold', Number(e.balance) > 0 ? 'text-danger' : 'text-success')}>{balanceLabel(Number(e.balance))}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-primary">
                                <td colSpan={3} className="font-extrabold">
                                    Totals / closing balance
                                </td>
                                <td className="text-end! font-bold">{money(summary.debits, cur)}</td>
                                <td className="text-end! font-bold text-success">{money(summary.credits, cur)}</td>
                                <td className={cn('text-end! text-base font-extrabold', closing > 0 ? 'text-danger' : 'text-success')}>{balanceLabel(closing)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {Number(summary.credit) > 0 && (
                    <p className="mb-4 text-sm text-info">Unapplied credit on account: {money(summary.credit, cur)} — it will be applied to the next invoice automatically.</p>
                )}

                {closing > 0 && <PaymentInstructionsBox instructions={instructions} reference={student.admission_no} />}

                <p className="mt-6 border-t border-white-light pt-3 text-xs text-white-dark dark:border-[#1b2e4b]">
                    Balances marked CR are credits in the student's favour. Please report any discrepancy to the bursar's office within 14 days.
                </p>
            </div>
        </>
    );
}
