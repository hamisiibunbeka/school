<?php

use App\Http\Controllers\Communication\AnnouncementController;
use App\Http\Controllers\Communication\MessageController;
use App\Http\Controllers\Communication\TemplateController;
use Illuminate\Support\Facades\Route;

// Communication & notifications (SRS 4.18, 6)
Route::middleware('can:communication.manage')->group(function () {
    Route::post('communication/announcements', [AnnouncementController::class, 'store'])->name('communication.announcements.store');
    Route::put('communication/announcements/{announcement}', [AnnouncementController::class, 'update'])->name('communication.announcements.update');
    Route::post('communication/announcements/{announcement}/publish', [AnnouncementController::class, 'publish'])->name('communication.announcements.publish');
    Route::post('communication/announcements/{announcement}/expire', [AnnouncementController::class, 'expire'])->name('communication.announcements.expire');
    Route::delete('communication/announcements/{announcement}', [AnnouncementController::class, 'destroy'])->name('communication.announcements.destroy');

    Route::post('communication/messages/preview', [MessageController::class, 'preview'])->name('communication.messages.preview');
    Route::post('communication/messages', [MessageController::class, 'send'])->name('communication.messages.send');
    Route::post('communication/messages/{log}/retry', [MessageController::class, 'retry'])->name('communication.messages.retry');

    Route::post('communication/templates', [TemplateController::class, 'store'])->name('communication.templates.store');
    Route::put('communication/templates/{template}', [TemplateController::class, 'update'])->name('communication.templates.update');
    Route::delete('communication/templates/{template}', [TemplateController::class, 'destroy'])->name('communication.templates.destroy');
});

Route::middleware('can:communication.view')->group(function () {
    Route::redirect('communication', '/communication/announcements');
    Route::get('communication/announcements', [AnnouncementController::class, 'index'])->name('communication.announcements.index');
    Route::get('communication/messages', [MessageController::class, 'index'])->name('communication.messages.index');
    Route::get('communication/messages/export', [MessageController::class, 'export'])->name('communication.messages.export');
    Route::get('communication/templates', [TemplateController::class, 'index'])->name('communication.templates.index');
});
