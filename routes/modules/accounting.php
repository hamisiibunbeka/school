<?php

use App\Http\Controllers\Accounting\AccountController;
use App\Http\Controllers\Accounting\BudgetController;
use App\Http\Controllers\Accounting\ExpenseController;
use App\Http\Controllers\Accounting\FiscalYearController;
use App\Http\Controllers\Accounting\JournalController;
use App\Http\Controllers\Accounting\ReconciliationController;
use App\Http\Controllers\Accounting\ReportController;
use App\Http\Controllers\Accounting\TransferController;
use Illuminate\Support\Facades\Route;

// Professional accounting (SRS 4.10, 5, 13)
Route::prefix('accounting')->name('accounting.')->group(function () {
    Route::middleware('can:accounting.manage')->group(function () {
        Route::post('accounts', [AccountController::class, 'store'])->name('accounts.store');
        Route::put('accounts/{account}', [AccountController::class, 'update'])->name('accounts.update');
        Route::delete('accounts/{account}', [AccountController::class, 'destroy'])->name('accounts.destroy');
        Route::post('accounts/{account}/toggle', [AccountController::class, 'toggle'])->name('accounts.toggle');

        Route::get('journals/create', [JournalController::class, 'create'])->name('journals.create');
        Route::post('journals', [JournalController::class, 'store'])->name('journals.store');
        Route::get('journals/{journal}/edit', [JournalController::class, 'edit'])->name('journals.edit');
        Route::put('journals/{journal}', [JournalController::class, 'update'])->name('journals.update');
        Route::delete('journals/{journal}', [JournalController::class, 'destroy'])->name('journals.destroy');
        Route::post('journals/{journal}/submit', [JournalController::class, 'submit'])->name('journals.submit');
        Route::post('journals/{journal}/approve', [JournalController::class, 'approve'])->name('journals.approve');
        Route::post('journals/{journal}/reject', [JournalController::class, 'reject'])->name('journals.reject');
        Route::post('journals/{journal}/reverse', [JournalController::class, 'reverse'])->name('journals.reverse');

        Route::post('expenses', [ExpenseController::class, 'store'])->name('expenses.store');
        Route::put('expenses/{expense}', [ExpenseController::class, 'update'])->name('expenses.update');
        Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy'])->name('expenses.destroy');
        Route::post('expenses/{expense}/approve', [ExpenseController::class, 'approve'])->name('expenses.approve');
        Route::post('expenses/{expense}/reject', [ExpenseController::class, 'reject'])->name('expenses.reject');
        Route::post('expenses/{expense}/void', [ExpenseController::class, 'void'])->name('expenses.void');

        Route::post('transfers', [TransferController::class, 'store'])->name('transfers.store');
        Route::put('transfers/{transfer}', [TransferController::class, 'update'])->name('transfers.update');
        Route::delete('transfers/{transfer}', [TransferController::class, 'destroy'])->name('transfers.destroy');
        Route::post('transfers/{transfer}/approve', [TransferController::class, 'approve'])->name('transfers.approve');
        Route::post('transfers/{transfer}/reject', [TransferController::class, 'reject'])->name('transfers.reject');
        Route::post('transfers/{transfer}/void', [TransferController::class, 'void'])->name('transfers.void');

        Route::post('reconciliations', [ReconciliationController::class, 'store'])->name('reconciliations.store');
        Route::put('reconciliations/{reconciliation}', [ReconciliationController::class, 'update'])->name('reconciliations.update');
        Route::delete('reconciliations/{reconciliation}', [ReconciliationController::class, 'destroy'])->name('reconciliations.destroy');
        Route::put('reconciliations/{reconciliation}/lines', [ReconciliationController::class, 'saveLines'])->name('reconciliations.lines');
        Route::post('reconciliations/{reconciliation}/adjustment', [ReconciliationController::class, 'adjustment'])->name('reconciliations.adjustment');
        Route::post('reconciliations/{reconciliation}/complete', [ReconciliationController::class, 'complete'])->name('reconciliations.complete');
        Route::post('reconciliations/{reconciliation}/review', [ReconciliationController::class, 'review'])->name('reconciliations.review');
        Route::post('reconciliations/{reconciliation}/reopen', [ReconciliationController::class, 'reopen'])->name('reconciliations.reopen');

        Route::post('budgets', [BudgetController::class, 'store'])->name('budgets.store');
        Route::delete('budgets/{budget}', [BudgetController::class, 'destroy'])->name('budgets.destroy');

        Route::post('fiscal-years', [FiscalYearController::class, 'store'])->name('fiscal-years.store');
        Route::put('fiscal-years/{fiscalYear}', [FiscalYearController::class, 'update'])->name('fiscal-years.update');
        Route::delete('fiscal-years/{fiscalYear}', [FiscalYearController::class, 'destroy'])->name('fiscal-years.destroy');
        Route::post('fiscal-years/{fiscalYear}/close', [FiscalYearController::class, 'close'])->name('fiscal-years.close');
        Route::post('fiscal-years/{fiscalYear}/reopen', [FiscalYearController::class, 'reopen'])->name('fiscal-years.reopen');
    });

    Route::middleware('can:accounting.view')->group(function () {
        Route::get('accounts', [AccountController::class, 'index'])->name('accounts.index');
        Route::get('journals', [JournalController::class, 'index'])->name('journals.index');
        Route::get('journals/{journal}', [JournalController::class, 'show'])->name('journals.show');
        Route::get('expenses', [ExpenseController::class, 'index'])->name('expenses.index');
        Route::get('expenses/{expense}', [ExpenseController::class, 'show'])->name('expenses.show');
        Route::get('transfers', [TransferController::class, 'index'])->name('transfers.index');
        Route::get('transfers/{transfer}', [TransferController::class, 'show'])->name('transfers.show');
        Route::get('reconciliations', [ReconciliationController::class, 'index'])->name('reconciliations.index');
        Route::get('reconciliations/{reconciliation}', [ReconciliationController::class, 'show'])->name('reconciliations.show');
        Route::get('ledger', [ReportController::class, 'ledger'])->name('ledger');
        Route::get('trial-balance', [ReportController::class, 'trialBalance'])->name('trial-balance');
        Route::get('income-statement', [ReportController::class, 'incomeStatement'])->name('income-statement');
        Route::get('balance-sheet', [ReportController::class, 'balanceSheet'])->name('balance-sheet');
        Route::get('cash-flow', [ReportController::class, 'cashFlow'])->name('cash-flow');
        Route::get('budgets', [BudgetController::class, 'index'])->name('budgets.index');
        Route::get('fiscal-years', [FiscalYearController::class, 'index'])->name('fiscal-years.index');
    });
});
