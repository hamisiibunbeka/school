<?php

namespace App\Reports;

use App\Models\User;

/**
 * Catalogue of standard reports (SRS 4.23 / 5.4). Accounting statements are
 * owned by the Accounting module and are listed here as links only.
 */
class ReportRegistry
{
    /** Category key => [label, icon, description] in catalogue order. */
    public const CATEGORIES = [
        'students' => ['Students & Admissions', 'graduation-cap', 'Registers, enrolment, admissions and emergency contacts.'],
        'attendance' => ['Attendance', 'calendar-check', 'Daily, class, learner and staff attendance.'],
        'academics' => ['Academics & Exams', 'book-open', 'Exam analysis, grade distribution and merit lists.'],
        'fees' => ['Fees & Finance', 'wallet', 'Collections, arrears, aging, billing, discounts and expenses.'],
        'accounting' => ['Accounting Statements', 'landmark', 'Statutory statements generated from the general ledger.'],
        'hr' => ['HR & Payroll', 'briefcase', 'Payroll, headcount and leave.'],
        'operations' => ['Operations', 'building', 'Boarding, transport, inventory and library.'],
    ];

    /** @var array<int, class-string<Report>> */
    private const REPORTS = [
        // Students & admissions
        Students\StudentRegister::class,
        Students\EnrolmentSummary::class,
        Students\AdmissionsPipeline::class,
        Students\NewAdmissions::class,
        Students\GuardianContacts::class,
        // Attendance
        Attendance\DailyAttendance::class,
        Attendance\StudentAttendance::class,
        Attendance\ChronicAbsentees::class,
        Attendance\StaffAttendance::class,
        // Academics
        Academics\ExamPerformance::class,
        Academics\GradeDistribution::class,
        Academics\TopPerformers::class,
        // Fees & finance
        Finance\FeeCollection::class,
        Finance\DailyCollections::class,
        Finance\OutstandingBalances::class,
        Finance\FeeAging::class,
        Finance\InvoicesIssued::class,
        Finance\Discounts::class,
        Finance\ExpensesByCategory::class,
        Finance\FinancialSummary::class,
        // HR & payroll
        Hr\PayrollSummary::class,
        Hr\Headcount::class,
        Hr\LeaveSummary::class,
        // Operations
        Operations\BoardingOccupancy::class,
        Operations\TransportManifest::class,
        Operations\TransportUtilisation::class,
        Operations\StockValuation::class,
        Operations\StockMovements::class,
        Operations\LibraryLoans::class,
    ];

    /** Accounting statements implemented by the Accounting module. */
    private const LINKS = [
        ['key' => 'trial-balance', 'title' => 'Trial Balance', 'description' => 'Debit and credit balances of every ledger account for a period.', 'icon' => 'scale', 'href' => '/accounting/trial-balance'],
        ['key' => 'income-statement', 'title' => 'Income Statement', 'description' => 'Income, direct costs and operating expenses with surplus/deficit.', 'icon' => 'trending-up', 'href' => '/accounting/income-statement'],
        ['key' => 'balance-sheet', 'title' => 'Balance Sheet', 'description' => 'Assets, liabilities and funds at a reporting date.', 'icon' => 'landmark', 'href' => '/accounting/balance-sheet'],
        ['key' => 'cash-flow', 'title' => 'Cash Flow Statement', 'description' => 'Cash movements from operating, investing and financing activities.', 'icon' => 'arrow-left-right', 'href' => '/accounting/cash-flow'],
        ['key' => 'general-ledger', 'title' => 'General Ledger', 'description' => 'Account-level posted transactions with running balances.', 'icon' => 'book-open', 'href' => '/accounting/ledger'],
    ];

    /** @return array<int, Report> */
    public function all(): array
    {
        return array_map(fn (string $class) => app($class), self::REPORTS);
    }

    public function find(string $key): ?Report
    {
        foreach ($this->all() as $report) {
            if ($report->key() === $key) {
                return $report;
            }
        }

        return null;
    }

    /**
     * Catalogue grouped by category, filtered to what the user may run.
     *
     * @return array<int, array<string, mixed>>
     */
    public function catalogue(User $user): array
    {
        $items = collect($this->all())
            ->filter(fn (Report $r) => $r->authorize($user))
            ->map(fn (Report $r) => [...$r->meta(), 'external' => false]);

        if ($user->can('accounting.view')) {
            $items = $items->concat(array_map(fn ($l) => [...$l, 'category' => 'accounting', 'external' => true], self::LINKS));
        }

        return collect(self::CATEGORIES)
            ->map(fn ($c, $key) => [
                'key' => $key,
                'label' => $c[0],
                'icon' => $c[1],
                'description' => $c[2],
                'reports' => $items->where('category', $key)->values()->all(),
            ])
            ->filter(fn ($c) => count($c['reports']) > 0)
            ->values()
            ->all();
    }
}
