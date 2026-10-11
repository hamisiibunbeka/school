<?php

use App\Http\Controllers\Health\HealthVisitController;
use Illuminate\Support\Facades\Route;

// School health & welfare (SRS 4.17) — restricted to health.* permissions.
Route::middleware('can:health.manage')->prefix('health')->name('health.')->group(function () {
    Route::post('visits', [HealthVisitController::class, 'store'])->name('visits.store');
    Route::put('visits/{visit}', [HealthVisitController::class, 'update'])->name('visits.update');
    Route::delete('visits/{visit}', [HealthVisitController::class, 'destroy'])->name('visits.destroy');
});

Route::middleware('can:health.view')->prefix('health')->name('health.')->group(function () {
    Route::get('/', fn () => to_route('health.visits.index'));
    Route::get('visits', [HealthVisitController::class, 'index'])->name('visits.index');
    Route::get('students/{student}/profile', [HealthVisitController::class, 'studentProfile'])->name('students.profile');
});
