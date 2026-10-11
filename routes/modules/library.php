<?php

use App\Http\Controllers\Library\BookController;
use App\Http\Controllers\Library\LoanController;
use Illuminate\Support\Facades\Route;

// Library management (SRS 4.16)
Route::middleware('can:library.manage')->prefix('library')->name('library.')->group(function () {
    Route::post('books', [BookController::class, 'store'])->name('books.store');
    Route::put('books/{book}', [BookController::class, 'update'])->name('books.update');
    Route::delete('books/{book}', [BookController::class, 'destroy'])->name('books.destroy');

    Route::post('loans', [LoanController::class, 'store'])->name('loans.store');
    Route::post('loans/{loan}/return', [LoanController::class, 'markReturned'])->name('loans.return');
    Route::post('loans/{loan}/renew', [LoanController::class, 'renew'])->name('loans.renew');
    Route::post('loans/{loan}/lost', [LoanController::class, 'markLost'])->name('loans.lost');
});

Route::middleware('can:library.view')->prefix('library')->name('library.')->group(function () {
    Route::get('/', fn () => to_route('library.books.index'));
    Route::get('books', [BookController::class, 'index'])->name('books.index');
    Route::get('loans', [LoanController::class, 'index'])->name('loans.index');
});
