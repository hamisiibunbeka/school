<?php

use App\Http\Controllers\Students\GuardianController;
use App\Http\Controllers\Students\PromotionController;
use App\Http\Controllers\Students\SponsorshipController;
use App\Http\Controllers\Students\StudentController;
use Illuminate\Support\Facades\Route;

// Students & guardians (SRS 4.4, 4.5)
Route::middleware('can:students.manage')->group(function () {
    Route::get('students/create', [StudentController::class, 'create'])->name('students.create');
    Route::post('students', [StudentController::class, 'store'])->name('students.store');
    Route::get('students/{student}/edit', [StudentController::class, 'edit'])->name('students.edit');
    Route::put('students/{student}', [StudentController::class, 'update'])->name('students.update');
    Route::delete('students/{student}', [StudentController::class, 'destroy'])->name('students.destroy');
    Route::post('students/{student}/status', [StudentController::class, 'changeStatus'])->name('students.status');
    Route::post('students/{student}/documents', [StudentController::class, 'uploadDocument'])->name('students.documents.store');
    Route::delete('students/{student}/documents/{document}', [StudentController::class, 'deleteDocument'])->name('students.documents.destroy');
    Route::post('students/{student}/guardians', [StudentController::class, 'attachGuardian'])->name('students.guardians.attach');
    Route::delete('students/{student}/guardians/{guardian}', [StudentController::class, 'detachGuardian'])->name('students.guardians.detach');
    Route::post('students/{student}/sponsorships', [SponsorshipController::class, 'store'])->name('students.sponsorships.store');
    Route::put('sponsorships/{sponsorship}', [SponsorshipController::class, 'update'])->name('sponsorships.update');
    Route::post('sponsorships/{sponsorship}/end', [SponsorshipController::class, 'end'])->name('sponsorships.end');
    Route::delete('sponsorships/{sponsorship}', [SponsorshipController::class, 'destroy'])->name('sponsorships.destroy');

    Route::get('students/promotions', [PromotionController::class, 'index'])->name('students.promotions');
    Route::post('students/promotions', [PromotionController::class, 'store'])->name('students.promotions.store');

    Route::post('guardians', [GuardianController::class, 'store'])->name('guardians.store');
    Route::put('guardians/{guardian}', [GuardianController::class, 'update'])->name('guardians.update');
    Route::delete('guardians/{guardian}', [GuardianController::class, 'destroy'])->name('guardians.destroy');
    Route::post('guardians/{guardian}/portal-access', [GuardianController::class, 'portalAccess'])->name('guardians.portal');
});

Route::middleware('can:students.view')->group(function () {
    Route::get('sponsorships/{sponsorship}/attachment', [SponsorshipController::class, 'attachment'])->name('sponsorships.attachment');
    Route::get('students/{student}/documents/{document}', [StudentController::class, 'viewDocument'])->name('students.documents.show');
    Route::get('students', [StudentController::class, 'index'])->name('students.index');
    Route::get('students/export', [StudentController::class, 'export'])->name('students.export');
    Route::get('students/{student}', [StudentController::class, 'show'])->name('students.show');
    Route::get('students/{student}/id-card', [StudentController::class, 'idCard'])->name('students.id-card');
    Route::get('guardians', [GuardianController::class, 'index'])->name('guardians.index');
    Route::get('guardians/search', [GuardianController::class, 'search'])->name('guardians.search');
});
