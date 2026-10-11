<?php

namespace App\Reports\Operations;

use App\Reports\Report;
use Illuminate\Support\Facades\DB;

class LibraryLoans extends Report
{
    public function key(): string
    {
        return 'library-loans';
    }

    public function title(): string
    {
        return 'Library Loans & Overdue Books';
    }

    public function description(): string
    {
        return 'Books issued in a period, current loans, overdue items and fines.';
    }

    public function category(): string
    {
        return 'operations';
    }

    public function icon(): string
    {
        return 'library';
    }

    public function permissions(): array
    {
        return ['library.view'];
    }

    public function filters(): array
    {
        return [
            ...$this->rangeFilters(),
            $this->selectFilter('status', 'Status', [
                ['value' => 'issued', 'label' => 'On loan'],
                ['value' => 'overdue', 'label' => 'Overdue'],
                ['value' => 'returned', 'label' => 'Returned'],
                ['value' => 'lost', 'label' => 'Lost'],
            ], 'issued', 'All loans'),
            $this->selectFilter('borrower', 'Borrower', [['value' => 'student', 'label' => 'Learners'], ['value' => 'staff', 'label' => 'Staff']], '', 'All borrowers'),
            $this->classFilter(),
        ];
    }

    public function run(array $f): array
    {
        $today = $this->today();

        $q = $this->table('book_loans')
            ->join('books', 'books.id', '=', 'book_loans.book_id')
            ->leftJoin('students', 'students.id', '=', 'book_loans.student_id')
            ->leftJoin('school_classes', 'school_classes.id', '=', 'students.school_class_id')
            ->leftJoin('employees', 'employees.id', '=', 'book_loans.employee_id')
            ->when($f['status'] === 'overdue', fn ($q) => $q->where('book_loans.status', 'issued')->whereDate('book_loans.due_on', '<', $today))
            ->when(in_array($f['status'], ['issued', 'returned', 'lost'], true), fn ($q) => $q->where('book_loans.status', $f['status']))
            ->when($f['borrower'] === 'student', fn ($q) => $q->whereNotNull('book_loans.student_id'))
            ->when($f['borrower'] === 'staff', fn ($q) => $q->whereNotNull('book_loans.employee_id'))
            ->when($f['class'], fn ($q, $v) => $q->where('students.school_class_id', $v));
        $this->dateRange($q, 'book_loans.issued_on', $f);

        $rows = $this->rows($q->orderBy('book_loans.due_on')->get([
            'books.title', DB::raw("COALESCE(books.author, '') as author"),
            DB::raw("COALESCE(TRIM(CONCAT(students.first_name, ' ', students.last_name)), CONCAT(employees.first_name, ' ', employees.last_name), '—') as borrower"),
            DB::raw("CASE WHEN book_loans.student_id IS NOT NULL THEN COALESCE(school_classes.name, 'Learner') ELSE 'Staff' END as class"),
            'book_loans.issued_on', 'book_loans.due_on', 'book_loans.returned_on',
            DB::raw("CASE WHEN book_loans.status = 'issued' AND book_loans.due_on < '$today' THEN DATEDIFF('$today', book_loans.due_on)
                          WHEN book_loans.returned_on IS NOT NULL AND book_loans.returned_on > book_loans.due_on THEN DATEDIFF(book_loans.returned_on, book_loans.due_on)
                          ELSE 0 END as days_overdue"),
            'book_loans.fine',
            DB::raw("CASE WHEN book_loans.status = 'issued' AND book_loans.due_on < '$today' THEN 'overdue' ELSE book_loans.status END as status"),
        ]));

        foreach ($rows as &$r) {
            $r['days_overdue'] = (int) $r['days_overdue'];
        }
        unset($r);

        $statusCounts = array_count_values(array_column($rows, 'status'));
        $overdueNow = $this->table('book_loans')->where('status', 'issued')->whereDate('due_on', '<', $today)->count();

        return [
            'columns' => [
                $this->col('title', 'Book'),
                $this->col('author', 'Author'),
                $this->col('borrower', 'Borrower'),
                $this->col('class', 'Class'),
                $this->col('issued_on', 'Issued', 'date'),
                $this->col('due_on', 'Due', 'date'),
                $this->col('returned_on', 'Returned', 'date'),
                $this->col('days_overdue', 'Days late', 'number'),
                $this->col('fine', 'Fine', 'money'),
                $this->col('status', 'Status', 'badge'),
            ],
            'rows' => $rows,
            'totals' => ['title' => 'Total', 'fine' => $this->sum($rows, 'fine')],
            'summary' => [
                $this->stat('Loans listed', count($rows), 'number', 'primary', 'library'),
                $this->stat('Currently on loan', $this->table('book_loans')->where('status', 'issued')->count(), 'number', 'info', 'book-open'),
                $this->stat('Overdue now', $overdueNow, 'number', 'danger', 'alert-triangle'),
                $this->stat('Fines', $this->sum($rows, 'fine'), 'money', 'warning', 'wallet'),
            ],
            'chart' => $statusCounts ? [
                'type' => 'donut',
                'labels' => array_map(fn ($s) => ucwords(str_replace('_', ' ', $s)), array_keys($statusCounts)),
                'series' => array_values($statusCounts),
            ] : null,
        ];
    }
}
