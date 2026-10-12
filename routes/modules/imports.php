<?php

use App\Http\Controllers\ImportController;
use Illuminate\Support\Facades\Route;

// Spreadsheet imports — permission is checked per import type in the controller.
Route::get('imports/{type}/template', [ImportController::class, 'template'])->name('imports.template');
Route::post('imports/{type}/preview', [ImportController::class, 'preview'])->middleware('throttle:30,1')->name('imports.preview');
Route::post('imports/{type}/commit', [ImportController::class, 'commit'])->name('imports.commit');
