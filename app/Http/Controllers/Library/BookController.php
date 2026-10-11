<?php

namespace App\Http\Controllers\Library;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookLoan;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class BookController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_merge(['search' => '', 'category' => '', 'availability' => ''], $request->only(['search', 'category', 'availability']));

        $books = Book::query()
            ->withCount(['openLoans', 'loans'])
            ->when($filters['category'], fn ($q, $c) => $q->where('category', $c))
            ->when($filters['availability'] === 'available', fn ($q) => $q->where('copies_available', '>', 0))
            ->when($filters['availability'] === 'out', fn ($q) => $q->where('copies_available', 0))
            ->when($filters['search'], fn ($q, $s) => $q->where(fn ($q) => $q->where('title', 'like', "%{$s}%")
                ->orWhere('author', 'like', "%{$s}%")->orWhere('isbn', 'like', "%{$s}%")->orWhere('publisher', 'like', "%{$s}%")->orWhere('shelf', 'like', "%{$s}%")))
            ->orderBy('title')
            ->paginate($this->perPage())
            ->withQueryString()
            ->through(fn (Book $b) => [
                'id' => $b->id,
                'title' => $b->title,
                'author' => $b->author,
                'isbn' => $b->isbn,
                'publisher' => $b->publisher,
                'category' => $b->category,
                'shelf' => $b->shelf,
                'copies_total' => (int) $b->copies_total,
                'copies_available' => (int) $b->copies_available,
                'on_loan' => (int) $b->open_loans_count,
                'times_borrowed' => (int) $b->loans_count,
            ]);

        $categories = Book::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category');

        return Inertia::render('library/books', [
            'books' => $books,
            'filters' => $filters,
            'categories' => collect(Book::CATEGORIES)->merge($categories)->unique()->sort()->values()->map(fn ($c) => ['value' => $c, 'label' => $c]),
            'stats' => [
                'titles' => Book::count(),
                'copies' => (int) Book::sum('copies_total'),
                'available' => (int) Book::sum('copies_available'),
                'on_loan' => BookLoan::open()->count(),
                'overdue' => BookLoan::overdue()->count(),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $book = Book::create($data + ['copies_available' => $data['copies_total']]);
        $this->audit('created', $book, "Book catalogued: {$book->title}", 'library');
        $this->toast('Book added to the catalogue.');

        return back();
    }

    public function update(Request $request, Book $book): RedirectResponse
    {
        $data = $this->validated($request, $book);
        $open = $book->openLoans()->count();
        if ($data['copies_total'] < $open) {
            return back()->withErrors(['copies_total' => "{$open} copies are currently on loan; total copies cannot be lower."]);
        }

        $book->update($data);
        $book->syncAvailability();
        $this->audit('updated', $book, "Book updated: {$book->title}", 'library');
        $this->toast('Book updated.');

        return back();
    }

    public function destroy(Book $book): RedirectResponse
    {
        if ($book->openLoans()->exists()) {
            $this->toast('Copies of this book are on loan. Record their return first.', 'error');

            return back();
        }

        $this->audit('deleted', $book, "Book removed: {$book->title}", 'library');
        $book->delete();
        $this->toast('Book removed from the catalogue.');

        return back();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Book $book = null): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'author' => ['nullable', 'string', 'max:150'],
            'isbn' => ['nullable', 'string', 'max:20', Rule::unique('books', 'isbn')->where('school_id', $this->tenancy()->schoolId())->ignore($book?->id)],
            'publisher' => ['nullable', 'string', 'max:150'],
            'category' => ['nullable', 'string', 'max:60'],
            'shelf' => ['nullable', 'string', 'max:30'],
            'copies_total' => ['required', 'integer', 'min:1', 'max:5000'],
        ]);
    }
}
