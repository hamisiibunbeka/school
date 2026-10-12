<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PwaController;
use App\Http\Controllers\SchoolSwitchController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => auth()->check() ? redirect('/dashboard') : redirect('/login'))->name('home');

// Installable web app (PWA)
Route::get('manifest.webmanifest', [PwaController::class, 'manifest'])->name('pwa.manifest');

Route::middleware('auth')->group(function () {
    Route::inertia('subscription/suspended', 'subscription-suspended')->name('subscription.suspended');
    Route::post('switch-school', SchoolSwitchController::class)->name('school.switch');

    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::post('notifications/read-all', [NotificationController::class, 'readAll'])->name('notifications.read-all');

    // SaaS platform console (super administrators only)
    if (file_exists(__DIR__.'/saas.php')) {
        require __DIR__.'/saas.php';
    }

    // Every school module lives in routes/modules/*.php and runs inside a school context.
    Route::middleware('school')->group(function () {
        Route::get('dashboard', DashboardController::class)->name('dashboard');

        foreach (glob(__DIR__.'/modules/*.php') as $moduleRoutes) {
            require $moduleRoutes;
        }
    });
});

require __DIR__.'/settings.php';
