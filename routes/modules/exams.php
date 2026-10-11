<?php

use App\Http\Controllers\Exams\ExamController;
use App\Http\Controllers\Exams\GradeScaleController;
use App\Http\Controllers\Exams\MarkController;
use App\Http\Controllers\Exams\ResultsController;
use Illuminate\Support\Facades\Route;

// Examinations, results workflow & report cards (SRS 4.6, 13, 15.2)
Route::middleware('can:exams.view')->group(function () {
    Route::get('exams', [ExamController::class, 'index'])->name('exams.index');
    Route::get('exams/report-cards', [ResultsController::class, 'reportCards'])->name('exams.report-cards');
    Route::get('exams/grading', [GradeScaleController::class, 'index'])->name('exams.grading.index');
    Route::get('exams/{exam}', [ExamController::class, 'show'])->whereNumber('exam')->name('exams.show');
    Route::get('exams/{exam}/results', [ResultsController::class, 'show'])->whereNumber('exam')->name('exams.results');
});

Route::middleware('can:exams.manage')->group(function () {
    Route::post('exams/grading', [GradeScaleController::class, 'store'])->name('exams.grading.store');
    Route::put('exams/grading/{grade}', [GradeScaleController::class, 'update'])->name('exams.grading.update');
    Route::delete('exams/grading/{grade}', [GradeScaleController::class, 'destroy'])->name('exams.grading.destroy');

    Route::post('exams', [ExamController::class, 'store'])->name('exams.store');
    Route::put('exams/{exam}', [ExamController::class, 'update'])->whereNumber('exam')->name('exams.update');
    Route::delete('exams/{exam}', [ExamController::class, 'destroy'])->whereNumber('exam')->name('exams.destroy');
    Route::post('exams/{exam}/status', [ExamController::class, 'transition'])->whereNumber('exam')->name('exams.status');
    Route::get('exams/{exam}/marks', [MarkController::class, 'index'])->whereNumber('exam')->name('exams.marks');
    Route::post('exams/{exam}/marks', [MarkController::class, 'store'])->whereNumber('exam')->name('exams.marks.store');
});
