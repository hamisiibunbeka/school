<?php

use App\Http\Controllers\Accounting\ComplianceController;
use App\Http\Controllers\Payroll\StatutoryController;
use Illuminate\Support\Facades\Route;

// Statutory payroll rules: anyone who can view payroll sees how figures are calculated; only payroll.manage edits.
Route::middleware('can:payroll.manage')->group(function () {
    Route::post('payroll/statutory/tables', [StatutoryController::class, 'storeTable'])->name('payroll.statutory.tables.store');
    Route::put('payroll/statutory/tables/{table}', [StatutoryController::class, 'updateTable'])->name('payroll.statutory.tables.update');
    Route::delete('payroll/statutory/tables/{table}', [StatutoryController::class, 'destroyTable'])->name('payroll.statutory.tables.destroy');
    Route::post('payroll/statutory/components', [StatutoryController::class, 'storeComponent'])->name('payroll.statutory.components.store');
    Route::put('payroll/statutory/components/{component}', [StatutoryController::class, 'updateComponent'])->name('payroll.statutory.components.update');
    Route::put('payroll/statutory/components/{component}/exclusions', [StatutoryController::class, 'saveExclusions'])->name('payroll.statutory.exclusions');
    Route::put('payroll/statutory/components/{component}/assignments', [StatutoryController::class, 'saveAssignments'])->name('payroll.statutory.assignments');
    Route::put('payroll/statutory/staff/{employee}', [StatutoryController::class, 'updateStaff'])->name('payroll.statutory.staff');
});
Route::get('payroll/statutory', [StatutoryController::class, 'index'])->middleware('can:payroll.view')->name('payroll.statutory.index');

// Government levies, fees & licences (service levy, fire, OSHA ...)
Route::middleware('can:accounting.manage')->group(function () {
    Route::post('accounting/compliance', [ComplianceController::class, 'store'])->name('accounting.compliance.store');
    Route::put('accounting/compliance/{obligation}', [ComplianceController::class, 'update'])->name('accounting.compliance.update');
    Route::delete('accounting/compliance/{obligation}', [ComplianceController::class, 'destroy'])->name('accounting.compliance.destroy');
    Route::post('accounting/compliance/{obligation}/pay', [ComplianceController::class, 'pay'])->name('accounting.compliance.pay');
});
Route::middleware('can:accounting.view')->group(function () {
    Route::get('accounting/compliance', [ComplianceController::class, 'index'])->name('accounting.compliance.index');
    Route::get('accounting/compliance/{obligation}/estimate', [ComplianceController::class, 'estimateFor'])->name('accounting.compliance.estimate');
});
