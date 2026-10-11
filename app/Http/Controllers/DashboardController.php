<?php

namespace App\Http\Controllers;

use App\Models\AcademicYear;
use App\Models\Term;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Role-aware school dashboard (SRS 4.1). Each block is only computed when
 * the user may see the underlying module; values come from approved records.
 */
class DashboardController extends Controller
{
    public function __invoke(Request $request): Response|\Illuminate\Http\RedirectResponse
    {
        $user = $request->user();

        if ($user->isParent() || $user->isStudent()) {
            return redirect('/portal');
        }

        $schoolId = $this->tenancy()->schoolId();
        $table = fn (string $name) => DB::table($name)->where("$name.school_id", $schoolId);
        $today = now()->toDateString();
        $term = Term::current();
        $year = AcademicYear::current();

        $data = [
            'term' => $term?->only(['id', 'name', 'start_date', 'end_date']),
            'year' => $year?->only(['id', 'name']),
            'greeting' => $this->greeting(),
        ];

        if ($user->can('students.view')) {
            $active = $table('students')->whereNull('deleted_at')->where('status', 'active');

            $data['students'] = [
                'total' => (clone $active)->count(),
                'boarding' => (clone $active)->where('residence_type', 'boarding')->count(),
                'male' => (clone $active)->where('gender', 'male')->count(),
                'female' => (clone $active)->where('gender', 'female')->count(),
                'new_this_term' => $term ? (clone $active)->whereDate('admission_date', '>=', $term->start_date)->count() : 0,
                'by_class' => $table('students')
                    ->join('school_classes', 'school_classes.id', '=', 'students.school_class_id')
                    ->whereNull('students.deleted_at')->where('students.status', 'active')
                    ->groupBy('school_classes.id', 'school_classes.name', 'school_classes.level')
                    ->orderBy('school_classes.level')
                    ->selectRaw("school_classes.name as name, SUM(students.gender = 'male') as male, SUM(students.gender = 'female') as female")
                    ->get(),
            ];
        }

        if ($user->can('admissions.view')) {
            $data['admissions'] = [
                'pending' => $table('admission_applications')->whereIn('status', ['submitted', 'under_review', 'interview'])->count(),
                'accepted' => $table('admission_applications')->where('status', 'accepted')->count(),
            ];
        }

        if ($user->can('attendance.view')) {
            $todayRows = $table('attendance_records')->whereDate('date', $today);
            $marked = (clone $todayRows)->count();
            $present = (clone $todayRows)->whereIn('status', ['present', 'late'])->count();

            $trend = $table('attendance_records')
                ->whereDate('date', '>=', now()->subDays(20)->toDateString())
                ->groupBy('date')->orderBy('date')
                ->selectRaw("date, ROUND(100 * SUM(status IN ('present','late')) / COUNT(*), 1) as rate")
                ->get();

            $data['attendance'] = [
                'marked' => $marked,
                'present' => $present,
                'absent' => (clone $todayRows)->where('status', 'absent')->count(),
                'rate' => $marked ? round(100 * $present / $marked, 1) : null,
                'trend' => $trend,
                'staff_present' => $table('staff_attendances')->whereDate('date', $today)->whereIn('status', ['present', 'late'])->count(),
            ];
        }

        if ($user->can('hr.view')) {
            $data['staff'] = [
                'total' => $table('employees')->where('status', 'active')->count(),
                'teaching' => $table('employees')->where('status', 'active')->where('category', 'teaching')->count(),
                'pending_leave' => $table('leave_requests')->where('status', 'pending')->count(),
                'contracts_expiring' => $table('employees')->where('status', 'active')
                    ->whereBetween('contract_end_date', [$today, now()->addDays(60)->toDateString()])->count(),
            ];
        }

        if ($user->can('fees.view')) {
            $invoices = $table('invoices')->whereNotIn('status', ['cancelled', 'draft'])
                ->when($term, fn ($q) => $q->where('term_id', $term->id));

            $billed = (string) (clone $invoices)->sum('total');
            $collected = (string) $table('payments')->where('status', 'posted')
                ->when($term, fn ($q) => $q->whereBetween('payment_date', [$term->start_date->toDateString(), $term->end_date->toDateString()]))
                ->sum('amount');
            $outstanding = (string) $table('invoices')->whereNotIn('status', ['cancelled', 'draft'])->sum('balance');

            $data['fees'] = [
                'billed' => $billed,
                'collected' => $collected,
                'outstanding' => $outstanding,
                'collection_rate' => bccomp($billed, '0', 2) > 0 ? round(100 * (float) (clone $invoices)->sum('paid') / (float) $billed, 1) : null,
                'today' => (string) $table('payments')->where('status', 'posted')->whereDate('payment_date', $today)->sum('amount'),
                'by_method' => $table('payments')->where('status', 'posted')
                    ->when($term, fn ($q) => $q->whereBetween('payment_date', [$term->start_date->toDateString(), $term->end_date->toDateString()]))
                    ->groupBy('method')->selectRaw('method, SUM(amount) as total')->get(),
                'recent' => $table('payments')
                    ->join('students', 'students.id', '=', 'payments.student_id')
                    ->where('payments.status', 'posted')
                    ->latest('payments.created_at')->limit(6)
                    ->get(['payments.id', 'payments.receipt_no', 'payments.amount', 'payments.method', 'payments.payment_date',
                        DB::raw("CONCAT(students.first_name, ' ', students.last_name) as student")]),
            ];
        }

        if ($user->can(['fees.view']) || $user->can('accounting.view')) {
            $months = collect(range(11, 0))->map(fn ($i) => now()->startOfMonth()->subMonths($i));
            $from = $months->first()->toDateString();

            $income = $table('payments')->where('status', 'posted')->whereDate('payment_date', '>=', $from)
                ->groupByRaw("DATE_FORMAT(payment_date, '%Y-%m')")
                ->selectRaw("DATE_FORMAT(payment_date, '%Y-%m') as ym, SUM(amount) as total")->pluck('total', 'ym');
            $expenses = $table('expenses')->whereIn('status', ['approved', 'paid'])->whereDate('date', '>=', $from)
                ->groupByRaw("DATE_FORMAT(date, '%Y-%m')")
                ->selectRaw("DATE_FORMAT(date, '%Y-%m') as ym, SUM(amount) as total")->pluck('total', 'ym');

            $data['cashflow'] = $months->map(fn ($m) => [
                'month' => $m->format('M y'),
                'income' => (float) ($income[$m->format('Y-m')] ?? 0),
                'expenses' => (float) ($expenses[$m->format('Y-m')] ?? 0),
            ])->values();

            $data['expenses_month'] = (string) $table('expenses')->whereIn('status', ['approved', 'paid'])
                ->whereDate('date', '>=', now()->startOfMonth()->toDateString())->sum('amount');
        }

        if ($user->can('exams.view')) {
            $latestExam = $table('exams')->where('status', 'published')->latest('published_at')->first(['id', 'name']);
            $data['exams'] = [
                'latest' => $latestExam,
                'grades' => $latestExam
                    ? $table('exam_marks')->where('exam_id', $latestExam->id)->whereNotNull('grade')
                        ->groupBy('grade')->orderBy('grade')->selectRaw('grade, COUNT(*) as total')->get()
                    : [],
                'in_progress' => $table('exams')->whereIn('status', ['marks_entry', 'moderation'])->count(),
            ];
        }

        $data['alerts'] = array_values(array_filter([
            $user->can('inventory.view') ? $this->alert($table('inventory_items')->where('is_active', true)->whereColumn('quantity', '<=', 'reorder_level')->count(), 'items at or below re-order level', '/inventory/items?stock=low', 'warning') : null,
            $user->can('admissions.view') ? $this->alert($data['admissions']['pending'] ?? 0, 'admission applications awaiting a decision', '/admissions?status=submitted', 'info') : null,
            $user->can('hr.view') ? $this->alert($data['staff']['pending_leave'] ?? 0, 'staff leave requests pending approval', '/hr/leave?status=pending', 'info') : null,
            $user->can('fees.view') ? $this->alert($table('invoices')->whereIn('status', ['unpaid', 'partial'])->whereDate('due_date', '<', $today)->count(), 'invoices are past their due date', '/fees/arrears', 'danger') : null,
            $user->can('accounting.view') ? $this->alert($table('expenses')->where('status', 'pending')->count(), 'expense vouchers awaiting approval', '/accounting/expenses?status=pending', 'warning') : null,
            $user->can('library.view') ? $this->alert($table('book_loans')->where('status', 'issued')->whereDate('due_on', '<', $today)->count(), 'library books are overdue', '/library/loans?status=overdue', 'warning') : null,
            $user->can('transport.view') ? $this->alert($table('vehicles')->where('status', 'active')->where(fn ($q) => $q->whereDate('insurance_expiry', '<', now()->addDays(30)->toDateString())->orWhereDate('inspection_expiry', '<', now()->addDays(30)->toDateString()))->count(), 'vehicles have insurance/inspection expiring within 30 days', '/transport/vehicles', 'danger') : null,
        ]));

        $data['events'] = $table('events')->whereDate('starts_at', '>=', $today)->orderBy('starts_at')->limit(5)
            ->get(['id', 'title', 'type', 'starts_at', 'location']);

        $data['announcements'] = $table('announcements')
            ->where(fn ($q) => $q->whereNull('publish_at')->orWhere('publish_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()))
            ->latest()->limit(4)->get(['id', 'title', 'body', 'priority', 'created_at']);

        return Inertia::render('dashboard', $data);
    }

    /** @return array{count:int, message:string, href:string, tone:string}|null */
    private function alert(int $count, string $message, string $href, string $tone): ?array
    {
        return $count > 0 ? compact('count', 'message', 'href', 'tone') : null;
    }

    private function greeting(): string
    {
        $hour = (int) now()->setTimezone($this->tenancy()->school()?->timezone ?? 'Africa/Dar_es_Salaam')->format('G');

        return $hour < 12 ? 'Good morning' : ($hour < 17 ? 'Good afternoon' : 'Good evening');
    }
}
