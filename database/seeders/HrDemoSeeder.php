<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\Journal;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollRun;
use App\Models\SalaryComponent;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;

/**
 * HR & payroll demo data for the demo school (runs inside its tenancy context):
 * allowances / loan deductions, ~25 leave requests this year and payroll runs
 * Jan–Sep (approved + paid, journals posted) with October left as a draft.
 * Staff attendance is seeded by the Attendance module.
 */
class HrDemoSeeder extends Seeder
{
    public function run(): void
    {
        mt_srand(4110);

        $hr = User::where('email', 'hr@mzenzi.test')->first();
        $admin = User::where('email', 'admin@mzenzi.test')->first();
        if (! $hr || ! $admin) {
            return;
        }

        Auth::setUser($hr);

        $this->seedComponents();
        $this->seedLeave($hr, $admin);
        $this->seedPayroll($hr, $admin);

        Auth::forgetUser();
    }

    private function seedComponents(): void
    {
        $acc = fn (string $code) => Account::byCode($code)?->id;

        $housing = SalaryComponent::firstOrCreate(['code' => 'HOUSING'], [
            'name' => 'Housing Allowance', 'type' => 'allowance', 'calculation' => 'percent_of_basic', 'value' => 10,
            'is_statutory' => false, 'applies_to_all' => false, 'account_id' => $acc('6100'), 'is_active' => true,
        ]);
        SalaryComponent::firstOrCreate(['code' => 'TRANSPORT'], [
            'name' => 'Transport Allowance', 'type' => 'allowance', 'calculation' => 'fixed', 'value' => 50000,
            'is_statutory' => false, 'applies_to_all' => true, 'account_id' => $acc('6100'), 'is_active' => true,
        ]);
        $responsibility = SalaryComponent::firstOrCreate(['code' => 'RESP'], [
            'name' => 'Responsibility Allowance', 'type' => 'allowance', 'calculation' => 'fixed', 'value' => 150000,
            'is_statutory' => false, 'applies_to_all' => false, 'account_id' => $acc('6100'), 'is_active' => true,
        ]);
        $loan = SalaryComponent::firstOrCreate(['code' => 'LOAN'], [
            'name' => 'Staff Loan Repayment', 'type' => 'deduction', 'calculation' => 'fixed', 'value' => 50000,
            'is_statutory' => false, 'applies_to_all' => false, 'account_id' => $acc('1310') ?? $acc('2200'), 'is_active' => true,
        ]);

        // Housing allowance for most teaching staff (teachers living off-campus).
        $teachers = Employee::where('category', 'teaching')->where('status', 'active')->orderBy('employee_no')->get();
        foreach ($teachers as $i => $t) {
            if ($i % 4 !== 3) {
                EmployeeSalaryComponent::firstOrCreate(['employee_id' => $t->id, 'salary_component_id' => $housing->id], ['amount' => null]);
            }
        }

        // Responsibility allowance for the principal and bursar.
        foreach (Employee::whereIn('email', ['principal@mzenzi.test', 'bursar@mzenzi.test'])->get() as $e) {
            EmployeeSalaryComponent::firstOrCreate(['employee_id' => $e->id, 'salary_component_id' => $responsibility->id], ['amount' => null]);
        }

        // Staff loan repayments for two support staff (override amounts).
        $support = Employee::where('category', 'non_teaching')->whereNull('user_id')->orderBy('employee_no')->limit(2)->get();
        foreach ($support->values() as $i => $e) {
            EmployeeSalaryComponent::firstOrCreate(['employee_id' => $e->id, 'salary_component_id' => $loan->id], ['amount' => $i === 0 ? 60000 : 45000]);
        }
    }

    private function seedLeave(User $hr, User $admin): void
    {
        if (LeaveRequest::exists()) {
            return;
        }

        $types = LeaveType::pluck('id', 'name');
        $unpaid = LeaveType::firstOrCreate(['name' => 'Unpaid Leave'], ['days_per_year' => 0, 'is_paid' => false]);
        $types['Unpaid Leave'] = $unpaid->id;

        $employees = Employee::where('status', 'active')->orderBy('employee_no')->get();
        $hrEmployee = $employees->firstWhere('user_id', $hr->id);
        $today = CarbonImmutable::parse(now()->toDateString());
        $year = $today->year;

        $reasons = [
            'Annual Leave' => ['Family visit to Moshi', 'Annual rest', 'Travel to Mwanza for family event', 'Personal time off', 'Upcountry visit to Mbeya'],
            'Sick Leave' => ['Malaria treatment', 'Medical review at KCMC', 'Recovering from flu', 'Doctor-advised rest'],
            'Maternity Leave' => ['Maternity leave'],
            'Paternity Leave' => ['Birth of child'],
            'Compassionate Leave' => ['Bereavement in the family', 'Attending funeral in Tanga'],
            'Unpaid Leave' => ['Personal business (unpaid)'],
        ];

        // [employee index, type, start (Y-m-d), weekdays, status]
        $plan = [
            [3, 'Annual Leave', "$year-01-12", 5, 'approved'],
            [7, 'Sick Leave', "$year-01-26", 2, 'approved'],
            [12, 'Compassionate Leave', "$year-02-09", 3, 'approved'],
            [5, 'Annual Leave', "$year-02-16", 4, 'rejected'],
            [15, 'Sick Leave', "$year-03-04", 3, 'approved'],
            [9, 'Annual Leave', "$year-03-23", 5, 'approved'],
            [20, 'Paternity Leave', "$year-04-07", 3, 'approved'],
            [2, 'Sick Leave', "$year-04-20", 1, 'approved'],
            [14, 'Annual Leave', "$year-05-04", 5, 'cancelled'],
            [18, 'Annual Leave', "$year-06-15", 10, 'approved'],
            [6, 'Maternity Leave', "$year-06-01", 60, 'approved'],
            [11, 'Sick Leave', "$year-06-22", 2, 'approved'],
            [4, 'Annual Leave', "$year-07-06", 8, 'approved'],
            [22, 'Unpaid Leave', "$year-08-10", 4, 'approved'],
            [8, 'Annual Leave', "$year-08-17", 5, 'approved'],
            [16, 'Compassionate Leave', "$year-08-24", 2, 'rejected'],
            [13, 'Sick Leave', "$year-09-07", 2, 'approved'],
            [19, 'Annual Leave', "$year-09-14", 5, 'approved'],
            [1, 'Annual Leave', $today->subDays(2)->toDateString(), 6, 'approved'],   // on leave today
            [10, 'Sick Leave', $today->subDays(1)->toDateString(), 3, 'approved'],    // on leave today
            [17, 'Annual Leave', $today->addDays(9)->toDateString(), 5, 'pending'],
            [21, 'Annual Leave', $today->addDays(16)->toDateString(), 7, 'pending'],
            [0, 'Compassionate Leave', $today->addDays(3)->toDateString(), 2, 'pending'],
            [23, 'Sick Leave', $today->addDays(1)->toDateString(), 2, 'pending'],
            [-1, 'Annual Leave', $today->addDays(30)->toDateString(), 5, 'pending'], // HR officer's own request
        ];

        foreach ($plan as [$idx, $typeName, $start, $weekdays, $status]) {
            $employee = $idx === -1 ? $hrEmployee : $employees[$idx % $employees->count()];

            // Gender-specific leave goes to the next employee of the right gender.
            $gender = ['Maternity Leave' => 'female', 'Paternity Leave' => 'male'][$typeName] ?? null;
            if ($gender && $employee && $employee->gender !== $gender) {
                $employee = $employees->slice($idx)->firstWhere('gender', $gender) ?? $employees->firstWhere('gender', $gender);
            }
            if (! $employee || ! isset($types[$typeName])) {
                continue;
            }

            $startDate = CarbonImmutable::parse($start);
            while ($startDate->isWeekend()) {
                $startDate = $startDate->addDay();
            }
            $end = $startDate;
            $counted = 1;
            while ($counted < $weekdays) {
                $end = $end->addDay();
                if (! $end->isWeekend()) {
                    $counted++;
                }
            }

            $applied = $startDate->subDays(mt_rand(5, 14))->setTime(mt_rand(8, 15), mt_rand(0, 59));
            if ($applied->gt(now())) {
                $applied = now()->subHours(mt_rand(2, 30));
            }

            // The HR officer cannot approve their own leave; the administrator does.
            $approver = $employee->user_id === $hr->id ? $admin : $hr;
            $decided = in_array($status, ['approved', 'rejected'], true);

            $leave = LeaveRequest::create([
                'employee_id' => $employee->id,
                'leave_type_id' => $types[$typeName],
                'start_date' => $startDate->toDateString(),
                'end_date' => $end->toDateString(),
                'days' => LeaveRequest::workingDays($startDate->toDateString(), $end->toDateString()),
                'reason' => $reasons[$typeName][mt_rand(0, count($reasons[$typeName]) - 1)],
                'status' => $status,
                'approved_by' => $decided ? $approver->id : null,
                'approved_at' => $decided ? $applied->addDays(mt_rand(1, 3)) : null,
                'decision_note' => $status === 'rejected' ? 'Clashes with end-of-term examinations; please reschedule.' : null,
            ]);
            $leave->forceFill(['created_at' => $applied, 'updated_at' => $applied])->save();
        }
    }

    private function seedPayroll(User $hr, User $admin): void
    {
        /** @var PayrollService $service */
        $service = app(PayrollService::class);
        $bank = Account::byCode('1200') ?? Account::bySubType('bank');
        $year = now()->year;
        $currentMonth = (int) now()->format('n');

        for ($m = 1; $m <= $currentMonth; $m++) {
            $period = sprintf('%d-%02d', $year, $m);
            if (PayrollRun::where('period', $period)->exists()) {
                continue;
            }

            $payDate = CarbonImmutable::create($year, $m, 25);
            while ($payDate->isWeekend()) {
                $payDate = $payDate->subDay();
            }

            $run = $service->createRun($period, $payDate->toDateString(), null, $hr);
            $prepared = $payDate->subDays(5)->setTime(10, 15);
            $run->forceFill(['created_at' => $prepared, 'updated_at' => $prepared])->save();

            if ($m === $currentMonth) {
                $run->forceFill(['notes' => 'Draft for review — awaiting approval.'])->save();

                continue; // current month stays in draft
            }

            $service->approve($run, $admin);
            $approved = $payDate->subDays(2)->setTime(14, 30);
            $run->forceFill(['approved_at' => $approved])->save();

            if ($bank) {
                $service->markPaid($run, $bank, $payDate->toDateString(), $admin);
                $run->forceFill(['paid_at' => $payDate->setTime(11, 0)])->save();
                Journal::whereKey($run->fresh()->payment_journal_id)->update(['created_by' => $admin->id, 'approved_by' => $admin->id]);
            }
        }
    }
}
