<?php

use App\Http\Controllers\Boarding\AllocationController;
use App\Http\Controllers\Boarding\DormitoryController;
use App\Http\Controllers\Boarding\LeavePassController;
use App\Http\Controllers\Boarding\RollCallController;
use App\Http\Controllers\Boarding\VisitorController;
use Illuminate\Support\Facades\Route;

// Boarding & residential management (SRS 4.12)
Route::middleware('can:boarding.manage')->prefix('boarding')->name('boarding.')->group(function () {
    Route::post('dormitories', [DormitoryController::class, 'store'])->name('dormitories.store');
    Route::put('dormitories/{dormitory}', [DormitoryController::class, 'update'])->name('dormitories.update');
    Route::delete('dormitories/{dormitory}', [DormitoryController::class, 'destroy'])->name('dormitories.destroy');
    Route::post('dormitories/{dormitory}/rooms', [DormitoryController::class, 'storeRoom'])->name('rooms.store');
    Route::put('rooms/{room}', [DormitoryController::class, 'updateRoom'])->name('rooms.update');
    Route::delete('rooms/{room}', [DormitoryController::class, 'destroyRoom'])->name('rooms.destroy');

    Route::post('allocations', [AllocationController::class, 'store'])->name('allocations.store');
    Route::post('allocations/{allocation}/end', [AllocationController::class, 'end'])->name('allocations.end');
    Route::post('allocations/{allocation}/transfer', [AllocationController::class, 'transfer'])->name('allocations.transfer');

    Route::post('roll-call', [RollCallController::class, 'store'])->name('roll-call.store');

    Route::post('leave-passes', [LeavePassController::class, 'store'])->name('leave-passes.store');
    Route::put('leave-passes/{leavePass}', [LeavePassController::class, 'update'])->name('leave-passes.update');
    Route::post('leave-passes/{leavePass}/approve', [LeavePassController::class, 'approve'])->name('leave-passes.approve');
    Route::post('leave-passes/{leavePass}/reject', [LeavePassController::class, 'reject'])->name('leave-passes.reject');
    Route::post('leave-passes/{leavePass}/depart', [LeavePassController::class, 'depart'])->name('leave-passes.depart');
    Route::post('leave-passes/{leavePass}/return', [LeavePassController::class, 'markReturned'])->name('leave-passes.return');
    Route::delete('leave-passes/{leavePass}', [LeavePassController::class, 'destroy'])->name('leave-passes.destroy');

    Route::post('visitors', [VisitorController::class, 'store'])->name('visitors.store');
    Route::post('visitors/{visitor}/check-out', [VisitorController::class, 'checkOut'])->name('visitors.check-out');
    Route::delete('visitors/{visitor}', [VisitorController::class, 'destroy'])->name('visitors.destroy');
});

Route::middleware('can:boarding.view')->prefix('boarding')->name('boarding.')->group(function () {
    Route::get('/', fn () => to_route('boarding.dormitories.index'));
    Route::get('dormitories', [DormitoryController::class, 'index'])->name('dormitories.index');
    Route::get('allocations', [AllocationController::class, 'index'])->name('allocations.index');
    Route::get('roll-call', [RollCallController::class, 'index'])->name('roll-call.index');
    Route::get('leave-passes', [LeavePassController::class, 'index'])->name('leave-passes.index');
    Route::get('visitors', [VisitorController::class, 'index'])->name('visitors.index');
});
