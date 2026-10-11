<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\Payslip;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** Printable payslip. Visible to payroll viewers, HR managers and the employee themself. */
class PayslipController extends Controller
{
    public function show(Request $request, Payslip $payslip): Response
    {
        $payslip->load(['run', 'employee.department:id,name']);
        $user = $request->user();
        $isOwn = $payslip->employee?->user_id === $user->id;

        abort_unless($user->can('payroll.view') || $user->can('hr.manage') || $isOwn, 403);
        // Employees only see their payslips once the payroll is approved.
        abort_if($isOwn && ! $user->can('payroll.view') && $payslip->run?->status === 'draft', 403);

        $run = $payslip->run;
        $year = substr($run->period, 0, 4);

        $ytd = Payslip::query()
            ->join('payroll_runs', 'payroll_runs.id', '=', 'payslips.payroll_run_id')
            ->where('payslips.employee_id', $payslip->employee_id)
            ->where('payroll_runs.period', 'like', "{$year}-%")
            ->where('payroll_runs.period', '<=', $run->period)
            ->whereIn('payroll_runs.status', ['approved', 'paid'])
            ->selectRaw('COALESCE(SUM(payslips.gross_pay),0) as gross, COALESCE(SUM(payslips.paye),0) as paye, COALESCE(SUM(payslips.nssf_employee),0) as nssf, COALESCE(SUM(payslips.net_pay),0) as net')
            ->first();

        $employee = $payslip->employee;

        return Inertia::render('payroll/payslip', [
            'payslip' => [
                'id' => $payslip->id,
                'basic_salary' => (string) $payslip->basic_salary,
                'allowances' => (string) $payslip->allowances,
                'gross_pay' => (string) $payslip->gross_pay,
                'paye' => (string) $payslip->paye,
                'nssf_employee' => (string) $payslip->nssf_employee,
                'other_deductions' => (string) $payslip->other_deductions,
                'total_deductions' => (string) $payslip->total_deductions,
                'net_pay' => (string) $payslip->net_pay,
                'employer_contributions' => (string) $payslip->employer_contributions,
                'breakdown' => $payslip->breakdown ?? [],
            ],
            'run' => [
                'id' => $run->id,
                'period' => $run->period,
                'period_label' => $run->period_label,
                'status' => $run->status,
                'payment_date' => $run->payment_date?->toDateString(),
                'rules_version' => $run->rules_snapshot['version'] ?? null,
            ],
            'employee' => [
                'id' => $employee?->id,
                'full_name' => $employee?->full_name,
                'employee_no' => $employee?->employee_no,
                'designation' => $employee?->designation,
                'department' => $employee?->department?->name,
                'hire_date' => $employee?->hire_date?->toDateString(),
                'bank_name' => $payslip->breakdown['employee']['bank_name'] ?? $employee?->bank_name,
                'bank_account' => $payslip->breakdown['employee']['bank_account'] ?? $employee?->bank_account,
                'nssf_no' => $employee?->nssf_no,
                'tin' => $employee?->tin,
            ],
            'ytd' => [
                'gross' => (string) $ytd->gross,
                'paye' => (string) $ytd->paye,
                'nssf' => (string) $ytd->nssf,
                'net' => (string) $ytd->net,
            ],
            'canViewRun' => $user->can('payroll.view'),
        ]);
    }
}
