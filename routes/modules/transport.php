<?php

use App\Http\Controllers\Transport\AssignmentController;
use App\Http\Controllers\Transport\RouteController;
use App\Http\Controllers\Transport\VehicleController;
use App\Http\Controllers\Transport\VehicleLogController;
use Illuminate\Support\Facades\Route;

// School transport & buses (SRS 4.14)
Route::middleware('can:transport.manage')->prefix('transport')->name('transport.')->group(function () {
    Route::post('vehicles', [VehicleController::class, 'store'])->name('vehicles.store');
    Route::put('vehicles/{vehicle}', [VehicleController::class, 'update'])->name('vehicles.update');
    Route::delete('vehicles/{vehicle}', [VehicleController::class, 'destroy'])->name('vehicles.destroy');

    Route::post('routes', [RouteController::class, 'store'])->name('routes.store');
    Route::put('routes/{transportRoute}', [RouteController::class, 'update'])->name('routes.update');
    Route::delete('routes/{transportRoute}', [RouteController::class, 'destroy'])->name('routes.destroy');

    Route::post('assignments', [AssignmentController::class, 'store'])->name('assignments.store');
    Route::post('assignments/{assignment}/end', [AssignmentController::class, 'end'])->name('assignments.end');
    Route::delete('assignments/{assignment}', [AssignmentController::class, 'destroy'])->name('assignments.destroy');

    Route::post('logs', [VehicleLogController::class, 'store'])->name('logs.store');
    Route::put('logs/{log}', [VehicleLogController::class, 'update'])->name('logs.update');
    Route::delete('logs/{log}', [VehicleLogController::class, 'destroy'])->name('logs.destroy');
});

Route::middleware('can:transport.view')->prefix('transport')->name('transport.')->group(function () {
    Route::get('/', fn () => to_route('transport.vehicles.index'));
    Route::get('vehicles', [VehicleController::class, 'index'])->name('vehicles.index');
    Route::get('routes', [RouteController::class, 'index'])->name('routes.index');
    Route::get('routes/{transportRoute}/manifest', [AssignmentController::class, 'manifest'])->name('routes.manifest');
    Route::get('assignments', [AssignmentController::class, 'index'])->name('assignments.index');
    Route::get('logs', [VehicleLogController::class, 'index'])->name('logs.index');
});
