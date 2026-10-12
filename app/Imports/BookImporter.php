<?php

namespace App\Imports;

use App\Models\Book;
use Illuminate\Support\Str;

class BookImporter extends Importer
{
    private array $isbns = [];

    private array $titles = [];

    public static function key(): string
    {
        return 'books';
    }

    public function title(): string
    {
        return 'Library Books';
    }

    public function permission(): string
    {
        return 'library.manage';
    }

    public function columns(): array
    {
        return [
            ['key' => 'title', 'label' => 'Title', 'required' => true, 'example' => 'Things Fall Apart'],
            ['key' => 'author', 'label' => 'Author', 'example' => 'Chinua Achebe'],
            ['key' => 'isbn', 'label' => 'ISBN', 'example' => '9780435905255'],
            ['key' => 'publisher', 'label' => 'Publisher', 'example' => 'Heinemann'],
            ['key' => 'category', 'label' => 'Category', 'example' => 'Literature'],
            ['key' => 'shelf', 'label' => 'Shelf', 'example' => 'L-03'],
            ['key' => 'copies', 'label' => 'Copies', 'example' => '5', 'help' => 'Number of copies (default 1).', 'aliases' => ['quantity', 'copies total']],
        ];
    }

    protected function prepare(): void
    {
        foreach (Book::all(['id', 'title', 'author', 'isbn']) as $b) {
            if ($b->isbn) {
                $this->isbns[preg_replace('/[^0-9X]/i', '', $b->isbn)] = true;
            }
            $this->titles[Str::lower($b->title.'|'.$b->author)] = true;
        }
    }

    protected function validateRow(array $row): array
    {
        $errors = [];
        $this->required($row, ['title'], $errors);
        $copies = $this->number($row['copies'] ?? '', 'Copies', $errors, 1);
        $isbn = preg_replace('/[^0-9X]/i', '', $row['isbn'] ?? '');

        $duplicate = null;
        if (($isbn && isset($this->isbns[$isbn])) || isset($this->titles[Str::lower(($row['title'] ?? '').'|'.($row['author'] ?? ''))])) {
            $duplicate = 'This book is already in the catalogue.';
        } elseif (($isbn && $this->seenBefore('isbn', $isbn)) || $this->seenBefore('title', ($row['title'] ?? '').'|'.($row['author'] ?? ''))) {
            $duplicate = 'Listed twice in this file.';
        }

        $n = $copies !== null ? (int) $copies : 1;

        return [$errors, [
            'title' => trim($row['title'] ?? ''),
            'author' => ($row['author'] ?? '') ?: null,
            'isbn' => ($row['isbn'] ?? '') ?: null,
            'publisher' => ($row['publisher'] ?? '') ?: null,
            'category' => ($row['category'] ?? '') ?: null,
            'shelf' => ($row['shelf'] ?? '') ?: null,
            'copies_total' => $n,
            'copies_available' => $n,
        ], $duplicate];
    }

    protected function persist(array $data): void
    {
        unset($data['__duplicate']);
        Book::create($data);
    }
}
