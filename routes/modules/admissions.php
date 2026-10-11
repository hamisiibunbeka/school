<?php

use App\Http\Controllers\Admissions\AdmissionController;
use Illuminate\Support\Facades\Route;

// Admissions & enrolment (SRS 4.3, workflow SRS 13)
Route::middleware('can:admissions.manage')->group(function () {
    Route::get('admissions/create', [AdmissionController::class, 'create'])->name('admissions.create');
    Route::post('admissions', [AdmissionController::class, 'store'])->name('admissions.store');
    Route::get('admissions/{application}/edit', [AdmissionController::class, 'edit'])->name('admissions.edit');
    Route::put('admissions/{application}', [AdmissionController::class, 'update'])->name('admissions.update');
    Route::delete('admissions/{application}', [AdmissionController::class, 'destroy'])->name('admissions.destroy');
    Route::post('admissions/{application}/transition', [AdmissionController::class, 'transition'])->name('admissions.transition');
    Route::post('admissions/{application}/enrol', [AdmissionController::class, 'enrol'])->name('admissions.enrol');
});

Route::middleware('can:admissions.view')->group(function () {
    Route::get('admissions', [AdmissionController::class, 'index'])->name('admissions.index');
    Route::get('admissions/export', [AdmissionController::class, 'export'])->name('admissions.export');
    Route::get('admissions/{application}', [AdmissionController::class, 'show'])->name('admissions.show');
    Route::get('admissions/{application}/letter', [AdmissionController::class, 'letter'])->name('admissions.letter');
});
