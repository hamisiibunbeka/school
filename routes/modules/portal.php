<?php

use App\Http\Controllers\Portal\PortalController;
use Illuminate\Support\Facades\Route;

// Parent & student portal (SRS 4.5). Access is checked in the controller:
// the user needs "portal.parent" or "portal.student", and parents only see linked wards.
Route::get('portal', [PortalController::class, 'index'])->name('portal.index');
Route::get('portal/children/{student}', [PortalController::class, 'child'])->name('portal.child');
