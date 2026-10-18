<?php

use App\Http\Controllers\Academics\AcademicYearController;
use App\Http\Controllers\Academics\AllocationController;
use App\Http\Controllers\Academics\CalendarController;
use App\Http\Controllers\Academics\ClassController;
use App\Http\Controllers\Academics\CombinationController;
use App\Http\Controllers\Academics\HomeworkController;
use App\Http\Controllers\Academics\LessonPlanController;
use App\Http\Controllers\Academics\SubjectController;
use App\Http\Controllers\Academics\TimetableController;
use Illuminate\Support\Facades\Route;

// Academic administration, calendar and homework (SRS 4.6, 4.8, 4.20)
Route::prefix('academics')->name('academics.')->group(function () {
    Route::middleware('can:academics.manage')->group(function () {
        // Years & terms
        Route::post('years', [AcademicYearController::class, 'store'])->name('years.store');
        Route::put('years/{year}', [AcademicYearController::class, 'update'])->name('years.update');
        Route::delete('years/{year}', [AcademicYearController::class, 'destroy'])->name('years.destroy');
        Route::post('years/{year}/current', [AcademicYearController::class, 'setCurrent'])->name('years.current');
        Route::post('years/{year}/terms', [AcademicYearController::class, 'storeTerm'])->name('terms.store');
        Route::put('terms/{term}', [AcademicYearController::class, 'updateTerm'])->name('terms.update');
        Route::delete('terms/{term}', [AcademicYearController::class, 'destroyTerm'])->name('terms.destroy');
        Route::post('terms/{term}/current', [AcademicYearController::class, 'setCurrentTerm'])->name('terms.current');

        // Classes & streams
        Route::post('classes', [ClassController::class, 'store'])->name('classes.store');
        Route::put('classes/{class}', [ClassController::class, 'update'])->name('classes.update');
        Route::delete('classes/{class}', [ClassController::class, 'destroy'])->name('classes.destroy');
        Route::post('classes/{class}/streams', [ClassController::class, 'storeStream'])->name('streams.store');
        Route::put('streams/{stream}', [ClassController::class, 'updateStream'])->name('streams.update');
        Route::delete('streams/{stream}', [ClassController::class, 'destroyStream'])->name('streams.destroy');

        // Subjects
        Route::post('combinations', [CombinationController::class, 'store'])->name('combinations.store');
        Route::post('combinations/standard', [CombinationController::class, 'seedStandard'])->name('combinations.standard');
        Route::put('combinations/{combination}', [CombinationController::class, 'update'])->name('combinations.update');
        Route::delete('combinations/{combination}', [CombinationController::class, 'destroy'])->name('combinations.destroy');

        Route::post('subjects', [SubjectController::class, 'store'])->name('subjects.store');
        Route::put('subjects/{subject}', [SubjectController::class, 'update'])->name('subjects.update');
        Route::delete('subjects/{subject}', [SubjectController::class, 'destroy'])->name('subjects.destroy');

        // Teacher allocation (class_subjects)
        Route::post('allocations', [AllocationController::class, 'store'])->name('allocations.store');
        Route::put('allocations/{allocation}', [AllocationController::class, 'update'])->name('allocations.update');
        Route::delete('allocations/{allocation}', [AllocationController::class, 'destroy'])->name('allocations.destroy');

        // Timetable
        Route::post('timetable', [TimetableController::class, 'store'])->name('timetable.store');
        Route::put('timetable/{slot}', [TimetableController::class, 'update'])->name('timetable.update');
        Route::delete('timetable/{slot}', [TimetableController::class, 'destroy'])->name('timetable.destroy');

        // Lesson plans
        Route::post('lesson-plans', [LessonPlanController::class, 'store'])->name('lesson-plans.store');
        Route::put('lesson-plans/{plan}', [LessonPlanController::class, 'update'])->name('lesson-plans.update');
        Route::post('lesson-plans/{plan}/status', [LessonPlanController::class, 'status'])->name('lesson-plans.status');
        Route::delete('lesson-plans/{plan}', [LessonPlanController::class, 'destroy'])->name('lesson-plans.destroy');

        // Homework
        Route::post('homework', [HomeworkController::class, 'store'])->name('homework.store');
        Route::put('homework/{assignment}', [HomeworkController::class, 'update'])->name('homework.update');
        Route::delete('homework/{assignment}', [HomeworkController::class, 'destroy'])->name('homework.destroy');

        // Calendar events
        Route::post('calendar', [CalendarController::class, 'store'])->name('calendar.store');
        Route::put('calendar/{event}', [CalendarController::class, 'update'])->name('calendar.update');
        Route::delete('calendar/{event}', [CalendarController::class, 'destroy'])->name('calendar.destroy');
    });

    Route::middleware('can:academics.view')->group(function () {
        Route::get('years', [AcademicYearController::class, 'index'])->name('years.index');
        Route::get('classes', [ClassController::class, 'index'])->name('classes.index');
        Route::get('subjects', [SubjectController::class, 'index'])->name('subjects.index');
        Route::get('combinations', [CombinationController::class, 'index'])->name('combinations.index');
        Route::get('allocations', [AllocationController::class, 'index'])->name('allocations.index');
        Route::get('timetable', [TimetableController::class, 'index'])->name('timetable.index');
        Route::get('lesson-plans', [LessonPlanController::class, 'index'])->name('lesson-plans.index');
        Route::get('homework', [HomeworkController::class, 'index'])->name('homework.index');
        Route::get('calendar', [CalendarController::class, 'index'])->name('calendar.index');
    });
});
