<?php

use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\SubscriptionController;
use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;

// Administration: settings, users, roles, audit trail, subscription (SRS 4.2, 4.22)
Route::middleware('can:administration.manage')->group(function () {
    Route::post('admin/settings/profile', [SettingsController::class, 'updateProfile'])->name('admin.settings.profile');
    Route::put('admin/settings/general', [SettingsController::class, 'updateSettings'])->name('admin.settings.general');
    Route::put('admin/settings/numbering/{type}', [SettingsController::class, 'updateSequence'])->name('admin.settings.numbering');

    Route::post('admin/users', [UserController::class, 'store'])->name('admin.users.store');
    Route::put('admin/users/{user}', [UserController::class, 'update'])->name('admin.users.update');
    Route::post('admin/users/{user}/status', [UserController::class, 'toggleStatus'])->name('admin.users.status');
    Route::post('admin/users/{user}/reset-password', [UserController::class, 'resetPassword'])->name('admin.users.reset-password');

    Route::post('admin/roles', [RoleController::class, 'store'])->name('admin.roles.store');
    Route::put('admin/roles/{role}', [RoleController::class, 'update'])->name('admin.roles.update');
    Route::delete('admin/roles/{role}', [RoleController::class, 'destroy'])->name('admin.roles.destroy');

    Route::post('admin/subscription/upgrade', [SubscriptionController::class, 'requestUpgrade'])->name('admin.subscription.upgrade');
});

Route::middleware('can:administration.view')->group(function () {
    Route::redirect('admin', '/admin/settings');
    Route::get('admin/settings', [SettingsController::class, 'edit'])->name('admin.settings.edit');
    Route::get('admin/users', [UserController::class, 'index'])->name('admin.users.index');
    Route::get('admin/roles', [RoleController::class, 'index'])->name('admin.roles.index');
    Route::get('admin/audit-logs', [AuditLogController::class, 'index'])->name('admin.audit-logs.index');
    Route::get('admin/audit-logs/export', [AuditLogController::class, 'export'])->name('admin.audit-logs.export');
    Route::get('admin/subscription', [SubscriptionController::class, 'show'])->name('admin.subscription.show');
});
