<?php

namespace App\Http\Controllers\Library;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookLoan;
use App\Models\Employee;
use App\Models\Student;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Lending: issue (max 3 open, none overdue), renew, return with fine, mark lost. */
class LoanController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'status' => '', 'borrower' => ''], $request->only(['search', 'status', 'borrower']));
        $today = now()->toDateString();

        $loans = BookLoan::query()
            ->with(['book:id,title,author,isbn', 'student:id,first_name,middle_name,last_name,admission_no,school_class_id', 'student.schoolClass:id,name', 'employee:id,first_name,last_name,employee_no', 'issuer:id,name'])
            ->when($filters['status'] === 'overdue', fn ($q) => $q->overdue())
            ->when(in_array($filters['status'], ['issued', 'returned', 'lost'], true), fn ($q) => $q->where('status', $filters['status']))
            ->when($filters['borrower'] === 'student', fn ($q) => $q->whereNotNull('student_id'))
            ->when($filters['borrower'] === 'staff', fn ($q) => $q->whereNotNull('employee_id'))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q
                ->whereHas('book', fn ($b) => $b->where('title', 'like', "%{$s}%")->orWhere('isbn', 'like', "%{$s}%"))
                ->orWhereHas('student', fn ($st) => $st->search($s))
                ->orWhereHas('employee', fn ($e) => $e->where('first_name', 'like', "%{$s}%")->orWhere('last_name', 'like', "%{$s}%"))))
            ->orderByRaw("CASE WHEN status = 'issued' AND due_on < ? THEN 0 WHEN status = 'issued' THEN 1 ELSE 2 END", [$today])
            ->orderByDesc('issued_on')
            ->orderByDesc('id')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (BookLoan $l) => [
                'id' => $l->id,
                'book_id' => $l->book_id,
                'book' => $l->book?->title,
                'author' => $l->book?->author,
                'borrower' => $l->student?->full_name ?? $l->employee?->full_name,
                'borrower_ref' => $l->student ? trim($l->student->admission_no.' · '.($l->student->schoolClass?->name ?? '')) : ($l->employee ? "Staff · {$l->employee->employee_no}" : ''),
                'borrower_type' => $l->student_id ? 'student' : 'staff',
                'issued_on' => $l->issued_on?->toDateString(),
                'due_on' => $l->due_on?->toDateString(),
                'returned_on' => $l->returned_on?->toDateString(),
                'fine' => (string) $l->fine,
                'status' => $l->status,
                'is_overdue' => $l->is_overdue,
                'days_overdue' => $l->days_overdue,
                'suggested_fine' => $l->status === 'issued' ? $l->suggestedFine() : (string) $l->fine,
                'issued_by' => $l->issuer?->name,
            ]);

        return Inertia::render('library/loans', [
            'loans' => $loans,
            'filters' => $filters,
            'books' => Book::orderBy('title')->get(['id', 'title', 'author', 'copies_available', 'copies_total'])
                ->map(fn ($b) => ['value' => $b->id, 'label' => "{$b->title}".($b->author ? " — {$b->author}" : '')." ({$b->copies_available}/{$b->copies_total} available)", 'available' => (int) $b->copies_available]),
            'students' => Student::active()->orderBy('first_name')->get(['id', 'first_name', 'middle_name', 'last_name', 'admission_no'])
                ->map(fn ($s) => ['value' => $s->id, 'label' => "{$s->full_name} ({$s->admission_no})"]),
            'employees' => Employee::active()->orderBy('first_name')->get(['id', 'first_name', 'last_name', 'employee_no'])
                ->map(fn ($e) => ['value' => $e->id, 'label' => "{$e->full_name} ({$e->employee_no})"]),
            'defaults' => ['loan_days' => BookLoan::LOAN_DAYS, 'fine_per_day' => BookLoan::FINE_PER_DAY, 'max_open' => BookLoan::MAX_OPEN_LOANS],
            'stats' => [
                'issued' => BookLoan::open()->count(),
                'overdue' => BookLoan::overdue()->count(),
                'due_today' => BookLoan::open()->whereDate('due_on', $today)->count(),
                'returned_month' => BookLoan::where('status', 'returned')->where('returned_on', '>=', now()->startOfMonth()->toDateString())->count(),
                'fines_month' => (string) BookLoan::where('returned_on', '>=', now()->startOfMonth()->toDateString())->sum('fine'),
                'lost' => BookLoan::where('status', 'lost')->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $school = $this->tenancy()->schoolId();
        $data = $request->validate([
            'book_id' => ['required', Rule::exists('books', 'id')->where('school_id', $school)],
            'borrower_type' => ['required', Rule::in(['student', 'staff'])],
            'student_id' => ['required_if:borrower_type,student', 'nullable', Rule::exists('students', 'id')->where('school_id', $school)],
            'employee_id' => ['required_if:borrower_type,staff', 'nullable', Rule::exists('employees', 'id')->where('school_id', $school)],
            'issued_on' => ['required', 'date'],
            'due_on' => ['required', 'date', 'after_or_equal:issued_on'],
        ], ['student_id.required_if' => 'Select the student borrowing the book.', 'employee_id.required_if' => 'Select the staff member borrowing the book.']);

        $column = $data['borrower_type'] === 'student' ? 'student_id' : 'employee_id';
        $borrowerId = $data[$column];

        $loan = DB::transaction(function () use ($data, $column, $borrowerId) {
            $book = Book::whereKey($data['book_id'])->lockForUpdate()->firstOrFail();

            if ($book->copies_available < 1) {
                throw ValidationException::withMessages(['book_id' => "No copies of \"{$book->title}\" are available."]);
            }
            if (BookLoan::overdue()->where($column, $borrowerId)->exists()) {
                throw ValidationException::withMessages([$column => 'This borrower has overdue books. They must be returned first.']);
            }
            $open = BookLoan::open()->where($column, $borrowerId)->count();
            if ($open >= BookLoan::MAX_OPEN_LOANS) {
                throw ValidationException::withMessages([$column => "This borrower already has {$open} books out (limit ".BookLoan::MAX_OPEN_LOANS.').']);
            }
            if (BookLoan::open()->where($column, $borrowerId)->where('book_id', $book->id)->exists()) {
                throw ValidationException::withMessages(['book_id' => 'This borrower already has a copy of this book.']);
            }

            $loan = BookLoan::create([
                'book_id' => $book->id,
                $column => $borrowerId,
                'issued_on' => $data['issued_on'],
                'due_on' => $data['due_on'],
                'status' => 'issued',
                'issued_by' => auth()->id(),
            ]);
            $book->syncAvailability();

            return $loan;
        });

        $loan->load('book', 'student', 'employee');
        $who = $loan->student?->full_name ?? $loan->employee?->full_name;
        $this->audit('issued', $loan, "\"{$loan->book->title}\" issued to {$who}, due {$loan->due_on->toDateString()}", 'library');
        $this->toast('Book issued.');

        return back();
    }

    public function renew(BookLoan $loan): RedirectResponse
    {
        if ($loan->status !== 'issued') {
            $this->toast('Only books on loan can be renewed.', 'error');

            return back();
        }
        if ($loan->is_overdue) {
            $this->toast('Overdue books must be returned (and any fine settled) before renewal.', 'error');

            return back();
        }

        $old = $loan->due_on->toDateString();
        $loan->update(['due_on' => $loan->due_on->addDays(BookLoan::LOAN_DAYS)]);
        $this->audit('renewed', $loan, "Loan of \"{$loan->book?->title}\" renewed: due {$old} → {$loan->due_on->toDateString()}", 'library');
        $this->toast('Loan renewed for another '.BookLoan::LOAN_DAYS.' days.');

        return back();
    }

    public function markReturned(Request $request, BookLoan $loan): RedirectResponse
    {
        $data = $request->validate([
            'returned_on' => ['required', 'date', 'after_or_equal:'.$loan->issued_on->toDateString()],
            'fine' => ['required', 'numeric', 'min:0', 'max:1000000'],
        ]);

        if ($loan->status !== 'issued') {
            $this->toast('This loan is already closed.', 'error');

            return back();
        }

        DB::transaction(function () use ($loan, $data) {
            $loan->update(['status' => 'returned', 'returned_on' => $data['returned_on'], 'fine' => $data['fine']]);
            $loan->book?->syncAvailability();
        });

        $suggested = $loan->suggestedFine($data['returned_on']);
        $note = bccomp((string) $data['fine'], $suggested, 2) !== 0 ? " (fine adjusted from {$suggested})" : '';
        $this->audit('returned', $loan, "\"{$loan->book?->title}\" returned, fine TZS {$data['fine']}{$note}", 'library');
        $this->toast(bccomp((string) $data['fine'], '0', 2) > 0 ? 'Book returned. Fine of TZS '.number_format((float) $data['fine']).' recorded.' : 'Book returned.');

        return back();
    }

    public function markLost(Request $request, BookLoan $loan): RedirectResponse
    {
        $data = $request->validate([
            'fine' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        if ($loan->status !== 'issued') {
            $this->toast('Only books on loan can be marked lost.', 'error');

            return back();
        }

        DB::transaction(function () use ($loan, $data) {
            $loan->update(['status' => 'lost', 'fine' => $data['fine'], 'returned_on' => now()->toDateString()]);
            $book = Book::whereKey($loan->book_id)->lockForUpdate()->first();
            if ($book) {
                // The copy leaves the collection.
                $book->forceFill(['copies_total' => max(0, $book->copies_total - 1)])->save();
                $book->syncAvailability();
            }
        });

        $this->audit('lost', $loan, "\"{$loan->book?->title}\" marked lost, replacement charge TZS {$data['fine']}".(! empty($data['reason']) ? " — {$data['reason']}" : ''), 'library');
        $this->toast('Book marked as lost.', 'warning');

        return back();
    }
}
