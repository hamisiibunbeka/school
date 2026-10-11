<?php

use App\Http\Controllers\Attendance\AttendanceController;
use App\Http\Controllers\Attendance\AttendanceReportController;
use App\Http\Controllers\Attendance\DisciplineController;
use App\Http\Controllers\Attendance\StaffAttendanceController;
use Illuminate\Support\Facades\Route;

// Attendance & discipline (SRS 4.7)
Route::middleware('can:attendance.view')->group(function () {
    Route::get('attendance', [AttendanceController::class, 'index'])->name('attendance.index');
    Route::get('attendance/staff', [StaffAttendanceController::class, 'index'])->name('attendance.staff');
    Route::get('attendance/report', [AttendanceReportController::class, 'index'])->name('attendance.report');
    Route::get('attendance/discipline', [DisciplineController::class, 'index'])->name('attendance.discipline.index');
    Route::get('attendance/students/search', [AttendanceController::class, 'searchStudents'])->name('attendance.students.search');
});

Route::middleware('can:attendance.manage')->group(function () {
    Route::post('attendance', [AttendanceController::class, 'store'])->name('attendance.store');
    Route::post('attendance/staff', [StaffAttendanceController::class, 'store'])->name('attendance.staff.store');
    Route::post('attendance/discipline', [DisciplineController::class, 'store'])->name('attendance.discipline.store');
    Route::put('attendance/discipline/{discipline}', [DisciplineController::class, 'update'])->name('attendance.discipline.update');
    Route::post('attendance/discipline/{discipline}/resolve', [DisciplineController::class, 'resolve'])->name('attendance.discipline.resolve');
    Route::delete('attendance/discipline/{discipline}', [DisciplineController::class, 'destroy'])->name('attendance.discipline.destroy');
});
