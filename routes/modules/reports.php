<?php

use App\Http\Controllers\Reports\ReportController;
use Illuminate\Support\Facades\Route;

// Reports & business intelligence (SRS 4.23). Each report additionally checks
// the permission of the module it reads from inside the controller.
Route::middleware('can:reports.view')->group(function () {
    Route::get('reports', [ReportController::class, 'index'])->name('reports.index');
    Route::get('reports/{key}/export', [ReportController::class, 'export'])->where('key', '[a-z0-9\-]+')->name('reports.export');
    Route::get('reports/{key}', [ReportController::class, 'show'])->where('key', '[a-z0-9\-]+')->name('reports.show');
});
