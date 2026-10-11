<?php

use App\Http\Controllers\Fees\ArrearsController;
use App\Http\Controllers\Fees\FeeCategoryController;
use App\Http\Controllers\Fees\FeeDiscountController;
use App\Http\Controllers\Fees\FeeStructureController;
use App\Http\Controllers\Fees\InvoiceController;
use App\Http\Controllers\Fees\PaymentController;
use App\Http\Controllers\Fees\StatementController;
use Illuminate\Support\Facades\Route;

// Fees, billing & student finance (SRS 4.9, 5.1 AR, workflow "Fees")
Route::middleware('can:fees.manage')->group(function () {
    Route::post('fees/categories', [FeeCategoryController::class, 'store'])->name('fees.categories.store');
    Route::put('fees/categories/{category}', [FeeCategoryController::class, 'update'])->name('fees.categories.update');
    Route::delete('fees/categories/{category}', [FeeCategoryController::class, 'destroy'])->name('fees.categories.destroy');

    Route::post('fees/structures', [FeeStructureController::class, 'store'])->name('fees.structures.store');
    Route::post('fees/structures/copy', [FeeStructureController::class, 'copy'])->name('fees.structures.copy');
    Route::put('fees/structures/{structure}', [FeeStructureController::class, 'update'])->name('fees.structures.update');
    Route::delete('fees/structures/{structure}', [FeeStructureController::class, 'destroy'])->name('fees.structures.destroy');

    Route::post('fees/discounts', [FeeDiscountController::class, 'store'])->name('fees.discounts.store');
    Route::put('fees/discounts/{discount}', [FeeDiscountController::class, 'update'])->name('fees.discounts.update');
    Route::delete('fees/discounts/{discount}', [FeeDiscountController::class, 'destroy'])->name('fees.discounts.destroy');

    Route::get('fees/invoices/create', [InvoiceController::class, 'create'])->name('fees.invoices.create');
    Route::get('fees/invoices/preview', [InvoiceController::class, 'preview'])->name('fees.invoices.preview');
    Route::post('fees/invoices/generate', [InvoiceController::class, 'generate'])->name('fees.invoices.generate');
    Route::post('fees/invoices', [InvoiceController::class, 'store'])->name('fees.invoices.store');
    Route::post('fees/invoices/{invoice}/cancel', [InvoiceController::class, 'cancel'])->name('fees.invoices.cancel');

    Route::get('fees/payments/create', [PaymentController::class, 'create'])->name('fees.payments.create');
    Route::post('fees/payments', [PaymentController::class, 'store'])->name('fees.payments.store');
    Route::post('fees/payments/{payment}/void', [PaymentController::class, 'void'])->name('fees.payments.void');

    Route::post('fees/arrears/remind', [ArrearsController::class, 'remind'])->name('fees.arrears.remind');
});

Route::middleware('can:fees.view')->group(function () {
    Route::get('fees', fn () => to_route('fees.payments.index'))->name('fees.index');
    Route::get('fees/categories', [FeeCategoryController::class, 'index'])->name('fees.categories.index');
    Route::get('fees/structures', [FeeStructureController::class, 'index'])->name('fees.structures.index');
    Route::get('fees/discounts', [FeeDiscountController::class, 'index'])->name('fees.discounts.index');

    Route::get('fees/students/search', [PaymentController::class, 'searchStudents'])->name('fees.students.search');

    Route::get('fees/invoices', [InvoiceController::class, 'index'])->name('fees.invoices.index');
    Route::get('fees/invoices/export', [InvoiceController::class, 'export'])->name('fees.invoices.export');
    Route::get('fees/invoices/{invoice}', [InvoiceController::class, 'show'])->name('fees.invoices.show');

    Route::get('fees/payments', [PaymentController::class, 'index'])->name('fees.payments.index');
    Route::get('fees/payments/export', [PaymentController::class, 'export'])->name('fees.payments.export');
    Route::get('fees/payments/{payment}', [PaymentController::class, 'show'])->name('fees.payments.show');

    Route::get('fees/arrears', [ArrearsController::class, 'index'])->name('fees.arrears.index');
    Route::get('fees/arrears/export', [ArrearsController::class, 'export'])->name('fees.arrears.export');

    Route::get('fees/statements/{student}', [StatementController::class, 'show'])->name('fees.statements.show');
});
