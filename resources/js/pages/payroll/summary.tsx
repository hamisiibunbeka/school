import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import { date, dateTime, money, titleCase } from '@/lib/utils';

type Row = {
    id: number;
    employee: string;
    employee_no: string;
    designation: string | null;
    basic_salary: string;
    allowances: string;
    gross_pay: string;
    paye: string;
    nssf_employee: string;
    other_deductions: string;
    net_pay: string;
};

type Props = {
    run: {
        id: number;
        period: string;
        period_label: string;
        status: string;
        payment_date: string | null;
        total_gross: string;
        total_deductions: string;
        total_net: string;
        total_employer: string;
        creator: string | null;
        approver: string | null;
        approved_at: string | null;
        rules_version: string | null;
    };
    payslips: Row[];
    statutory: { code: string | null; name: string; kind: string; amount: string; count: number }[];
    byDepartment: { department: string; count: number; gross: string; deductions: string; net: string }[];
};

const cols = ['basic_salary', 'allowances', 'gross_pay', 'paye', 'nssf_employee', 'other_deductions', 'net_pay'] as const;

export default function PayrollSummary({ run, payslips, statutory, byDepartment }: Props) {
    const { school } = usePage().props;
    const cur = school?.currency ?? 'TZS';
    const total = (k: (typeof cols)[number]) => payslips.reduce((s, p) => s + Number(p[k]), 0);

    return (
        <>
            <PageHeader
                title={`Payroll Summary · ${run.period_label}`}
                breadcrumbs={[{ title: 'HR & Payroll' }, { title: 'Payroll', href: '/payroll' }, { title: run.period_label, href: `/payroll/${run.id}` }, { title: 'Summary' }]}
                actions={
                    <>
                        <Link href={`/payroll/${run.id}`} className="btn btn-outline-dark">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        <PrintButton label="Print summary" />
                    </>
                }
            />

            <div className="panel mx-auto max-w-6xl print:max-w-none print:p-0 print:shadow-none">
                <Letterhead
                    title={`Payroll Summary — ${run.period_label}`}
                    meta={
                        <>
                            <div>
                                Status: <StatusBadge status={run.status} />
                            </div>
                            <div>Pay date: {date(run.payment_date)}</div>
                            <div>Currency: {cur}</div>
                        </>
                    }
                />

                <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                        ['Gross pay', run.total_gross],
                        ['Total deductions', run.total_deductions],
                        ['Net pay', run.total_net],
                        ['Employer contributions', run.total_employer],
                    ].map(([label, v]) => (
                        <div key={label} className="rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                            <div className="text-[11px] font-bold text-white-dark uppercase">{label}</div>
                            <div className="text-lg font-extrabold">{money(v, '')}</div>
                        </div>
                    ))}
                </div>

                <div className="table-responsive mb-6">
                    <table className="table-compact table text-xs">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Employee</th>
                                <th className="text-end!">Basic</th>
                                <th className="text-end!">Allowances</th>
                                <th className="text-end!">Gross</th>
                                <th className="text-end!">PAYE</th>
                                <th className="text-end!">NSSF</th>
                                <th className="text-end!">Other ded.</th>
                                <th className="text-end!">Net pay</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payslips.map((p, i) => (
                                <tr key={p.id}>
                                    <td>{i + 1}</td>
                                    <td>
                                        <div className="font-semibold">{p.employee}</div>
                                        <div className="text-[10px] text-white-dark">
                                            {p.employee_no} · {p.designation}
                                        </div>
                                    </td>
                                    {cols.map((k) => (
                                        <td key={k} className={`text-end! ${k === 'net_pay' ? 'font-bold' : ''}`}>
                                            {money(p[k], '')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-bold">
                                <td colSpan={2}>Totals</td>
                                {cols.map((k) => (
                                    <td key={k} className="text-end!">
                                        {money(total(k), '')}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:grid-cols-2">
                    <div>
                        <h6 className="mb-2 font-bold">Statutory remittances & deductions</h6>
                        <table className="table-compact table text-xs">
                            <tbody>
                                {statutory.map((s) => (
                                    <tr key={`${s.kind}-${s.code ?? s.name}`}>
                                        <td>
                                            {s.name} <span className="text-white-dark">({titleCase(s.kind)})</span>
                                        </td>
                                        <td className="text-end! font-semibold">{money(s.amount, '')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <h6 className="mb-2 font-bold">By department</h6>
                        <table className="table-compact table text-xs">
                            <thead>
                                <tr>
                                    <th>Department</th>
                                    <th className="text-center!">Staff</th>
                                    <th className="text-end!">Gross</th>
                                    <th className="text-end!">Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byDepartment.map((d) => (
                                    <tr key={d.department}>
                                        <td>{d.department}</td>
                                        <td className="text-center!">{d.count}</td>
                                        <td className="text-end!">{money(d.gross, '')}</td>
                                        <td className="text-end!">{money(d.net, '')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-10 grid grid-cols-1 gap-8 text-sm sm:grid-cols-3 print:grid-cols-3">
                    {[
                        ['Prepared by', run.creator, null],
                        ['Approved by', run.approver, run.approved_at],
                        ['Received by (Bursar)', null, null],
                    ].map(([label, who, when]) => (
                        <div key={label as string}>
                            <div className="h-10 border-b border-dashed border-black/40 dark:border-white/30" />
                            <div className="mt-1 font-bold">{label}</div>
                            <div className="text-xs text-white-dark">
                                {who ?? 'Name & signature'}
                                {when && ` · ${dateTime(when)}`}
                            </div>
                        </div>
                    ))}
                </div>

                <p className="mt-8 text-[10px] text-white-dark">
                    Calculated under rule pack {run.rules_version ?? '—'}. Statutory rates are configurable and must be verified against current TRA / NSSF / WCF regulations. Generated {dateTime(new Date().toISOString())}.
                </p>
            </div>
        </>
    );
}
