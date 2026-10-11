import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { date, money } from '@/lib/utils';

type Line = { code?: string; name: string; amount: string; rate?: string; kind?: string };

type Props = {
    payslip: {
        id: number;
        basic_salary: string;
        allowances: string;
        gross_pay: string;
        paye: string;
        nssf_employee: string;
        other_deductions: string;
        total_deductions: string;
        net_pay: string;
        employer_contributions: string;
        breakdown: {
            unpaid_leave_days?: number;
            unpaid_leave_amount?: string;
            allowances?: Line[];
            deductions?: Line[];
            employer?: Line[];
            taxable_income?: string;
            paye_band?: { from: string; to: string | null; rate: string; base_tax: string } | null;
        };
    };
    run: { id: number; period: string; period_label: string; status: string; payment_date: string | null; rules_version: string | null };
    employee: {
        id: number;
        full_name: string;
        employee_no: string;
        designation: string | null;
        department: string | null;
        hire_date: string | null;
        bank_name: string | null;
        bank_account: string | null;
        nssf_no: string | null;
        tin: string | null;
    };
    ytd: { gross: string; paye: string; nssf: string; net: string };
    canViewRun: boolean;
};

function Row({ label, value, bold, muted }: { label: React.ReactNode; value: string | number; bold?: boolean; muted?: boolean }) {
    return (
        <div className={`flex justify-between border-b border-dashed border-white-light py-1.5 dark:border-[#1b2e4b] ${bold ? 'font-bold' : ''} ${muted ? 'text-white-dark' : ''}`}>
            <span>{label}</span>
            <span>{money(value, '', 2)}</span>
        </div>
    );
}

export default function PayslipPage({ payslip, run, employee, ytd, canViewRun }: Props) {
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const b = payslip.breakdown ?? {};
    const masked = employee.bank_account ? `•••• ${employee.bank_account.slice(-4)}` : '—';

    return (
        <>
            <PageHeader
                title={`Payslip · ${employee.full_name}`}
                breadcrumbs={[
                    { title: 'HR & Payroll' },
                    ...(canViewRun ? [{ title: 'Payroll', href: '/payroll' }, { title: run.period_label, href: `/payroll/${run.id}` }] : [{ title: run.period_label }]),
                    { title: 'Payslip' },
                ]}
                actions={
                    <>
                        {canViewRun && (
                            <Link href={`/payroll/${run.id}`} className="btn btn-outline-dark">
                                <ArrowLeft className="h-4 w-4" /> Back to run
                            </Link>
                        )}
                        <PrintButton label="Print payslip" />
                    </>
                }
            />

            <div className="panel mx-auto max-w-3xl print:max-w-none print:p-0 print:shadow-none">
                <Letterhead
                    title={`Payslip — ${run.period_label}`}
                    meta={
                        <>
                            <div>Pay date: {date(run.payment_date)}</div>
                            <div>
                                <StatusBadge status={run.status} />
                            </div>
                        </>
                    }
                />

                <div className="mb-6 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2 print:grid-cols-2">
                    {[
                        ['Employee', employee.full_name],
                        ['Employee no.', employee.employee_no],
                        ['Designation', employee.designation],
                        ['Department', employee.department],
                        ['Bank', `${employee.bank_name ?? '—'} ${masked}`],
                        ['Hire date', date(employee.hire_date)],
                        ['NSSF no.', employee.nssf_no],
                        ['TIN', employee.tin],
                    ].map(([k, v]) => (
                        <div key={k as string} className="flex justify-between gap-3 border-b border-white-light py-1 dark:border-[#1b2e4b]">
                            <span className="text-white-dark">{k}</span>
                            <span className="text-end font-semibold">{v || '—'}</span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-8 text-sm md:grid-cols-2 print:grid-cols-2">
                    <div>
                        <h6 className="mb-2 rounded bg-success-light px-2 py-1 font-bold text-success dark:bg-success-dark-light">Earnings</h6>
                        <Row label="Basic salary" value={payslip.basic_salary} />
                        {!!b.unpaid_leave_days && <Row label={`Less unpaid leave (${b.unpaid_leave_days} days)`} value={-Number(b.unpaid_leave_amount ?? 0)} muted />}
                        {(b.allowances ?? []).map((a, i) => (
                            <Row key={i} label={a.name} value={a.amount} />
                        ))}
                        <Row label="Gross pay" value={payslip.gross_pay} bold />
                    </div>
                    <div>
                        <h6 className="mb-2 rounded bg-danger-light px-2 py-1 font-bold text-danger dark:bg-danger-dark-light">Deductions</h6>
                        {(b.deductions ?? []).map((d, i) => (
                            <Row key={i} label={d.kind === 'paye' && b.taxable_income ? `${d.name} (on ${money(b.taxable_income, '')})` : d.name} value={d.amount} />
                        ))}
                        {(b.deductions ?? []).length === 0 && <p className="py-1.5 text-white-dark">No deductions</p>}
                        <Row label="Total deductions" value={payslip.total_deductions} bold />
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary p-4 text-white">
                    <span className="text-sm font-bold uppercase">Net pay</span>
                    <span className="text-2xl font-extrabold">{money(payslip.net_pay, cur, 2)}</span>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-8 text-sm md:grid-cols-2 print:grid-cols-2">
                    <div>
                        <h6 className="mb-2 font-bold">Employer contributions (not deducted)</h6>
                        {(b.employer ?? []).map((e, i) => (
                            <Row key={i} label={e.name} value={e.amount} muted />
                        ))}
                        <Row label="Total employer cost" value={payslip.employer_contributions} bold />
                    </div>
                    <div>
                        <h6 className="mb-2 font-bold">Year to date ({run.period.slice(0, 4)})</h6>
                        <Row label="Gross pay" value={ytd.gross} />
                        <Row label="PAYE" value={ytd.paye} />
                        <Row label="NSSF (employee)" value={ytd.nssf} />
                        <Row label="Net pay" value={ytd.net} bold />
                    </div>
                </div>

                <p className="mt-8 text-[10px] text-white-dark">
                    This is a computer-generated payslip. Calculated under rule pack {run.rules_version ?? '—'}. Please report any discrepancy to the HR/Payroll office within 7 days.
                </p>
            </div>
        </>
    );
}
