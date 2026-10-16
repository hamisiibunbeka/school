<?php

use App\Http\Controllers\Communication\AnnouncementController;
use App\Http\Controllers\Communication\BroadcastController;
use App\Http\Controllers\Communication\ContactGroupController;
use App\Http\Controllers\Communication\MessageController;
use App\Http\Controllers\Communication\SmsCreditController;
use App\Http\Controllers\Communication\TemplateController;
use Illuminate\Support\Facades\Route;

// Communication & notifications (SRS 4.18, 6)
Route::middleware('can:communication.manage')->group(function () {
    Route::post('communication/announcements', [AnnouncementController::class, 'store'])->name('communication.announcements.store');
    Route::put('communication/announcements/{announcement}', [AnnouncementController::class, 'update'])->name('communication.announcements.update');
    Route::post('communication/announcements/{announcement}/publish', [AnnouncementController::class, 'publish'])->name('communication.announcements.publish');
    Route::post('communication/announcements/{announcement}/expire', [AnnouncementController::class, 'expire'])->name('communication.announcements.expire');
    Route::delete('communication/announcements/{announcement}', [AnnouncementController::class, 'destroy'])->name('communication.announcements.destroy');

    // Broadcast centre
    Route::get('communication/broadcasts/create', [BroadcastController::class, 'create'])->name('communication.broadcasts.create');
    Route::post('communication/broadcasts/preview', [BroadcastController::class, 'preview'])->name('communication.broadcasts.preview');
    Route::post('communication/broadcasts', [BroadcastController::class, 'store'])->name('communication.broadcasts.store');
    Route::get('communication/broadcasts/{broadcast}/edit', [BroadcastController::class, 'edit'])->name('communication.broadcasts.edit');
    Route::put('communication/broadcasts/{broadcast}', [BroadcastController::class, 'update'])->name('communication.broadcasts.update');
    Route::post('communication/broadcasts/{broadcast}/cancel', [BroadcastController::class, 'cancel'])->name('communication.broadcasts.cancel');
    Route::post('communication/broadcasts/{broadcast}/retry', [BroadcastController::class, 'retry'])->name('communication.broadcasts.retry');
    Route::delete('communication/broadcasts/{broadcast}', [BroadcastController::class, 'destroy'])->name('communication.broadcasts.destroy');

    Route::post('communication/messages/{log}/retry', [MessageController::class, 'retry'])->name('communication.messages.retry');

    Route::post('communication/groups', [ContactGroupController::class, 'store'])->name('communication.groups.store');
    Route::put('communication/groups/{group}', [ContactGroupController::class, 'update'])->name('communication.groups.update');
    Route::delete('communication/groups/{group}', [ContactGroupController::class, 'destroy'])->name('communication.groups.destroy');
    Route::post('communication/groups/{group}/members', [ContactGroupController::class, 'addMembers'])->name('communication.groups.members.store');
    Route::put('communication/group-members/{member}', [ContactGroupController::class, 'updateMember'])->name('communication.groups.members.update');
    Route::delete('communication/group-members/{member}', [ContactGroupController::class, 'destroyMember'])->name('communication.groups.members.destroy');

    Route::post('communication/sms-credits/orders', [SmsCreditController::class, 'order'])->name('communication.sms-credits.order');
    Route::post('communication/sms-credits/orders/{order}/payment', [SmsCreditController::class, 'submitPayment'])->name('communication.sms-credits.payment');
    Route::post('communication/sms-credits/orders/{order}/cancel', [SmsCreditController::class, 'cancel'])->name('communication.sms-credits.cancel');

    Route::post('communication/templates', [TemplateController::class, 'store'])->name('communication.templates.store');
    Route::put('communication/templates/{template}', [TemplateController::class, 'update'])->name('communication.templates.update');
    Route::delete('communication/templates/{template}', [TemplateController::class, 'destroy'])->name('communication.templates.destroy');
});

Route::middleware('can:communication.view')->group(function () {
    Route::redirect('communication', '/communication/broadcasts');
    Route::get('communication/announcements', [AnnouncementController::class, 'index'])->name('communication.announcements.index');
    Route::get('communication/broadcasts', [BroadcastController::class, 'index'])->name('communication.broadcasts.index');
    Route::get('communication/broadcasts/{broadcast}', [BroadcastController::class, 'show'])->whereNumber('broadcast')->name('communication.broadcasts.show');
    Route::get('communication/messages', [MessageController::class, 'index'])->name('communication.messages.index');
    Route::get('communication/messages/export', [MessageController::class, 'export'])->name('communication.messages.export');
    Route::get('communication/groups', [ContactGroupController::class, 'index'])->name('communication.groups.index');
    Route::get('communication/sms-credits', [SmsCreditController::class, 'index'])->name('communication.sms-credits.index');
    Route::get('communication/templates', [TemplateController::class, 'index'])->name('communication.templates.index');
});
