<?php

use App\Http\Controllers\Saas\DashboardController;
use App\Http\Controllers\Saas\PlanController;
use App\Http\Controllers\Saas\SubscriptionController;
use App\Http\Controllers\Saas\TenantController;
use App\Http\Controllers\Saas\TicketController;
use App\Http\Middleware\EnsureSuperAdmin;
use Illuminate\Support\Facades\Route;

// SaaS platform console (SRS 3.1, 3.4, 4.24). Required inside the "auth" group; no school context.
Route::middleware(EnsureSuperAdmin::class)->prefix('saas')->name('saas.')->group(function () {
    Route::get('/', DashboardController::class)->name('dashboard');

    Route::get('tenants', [TenantController::class, 'index'])->name('tenants.index');
    Route::post('tenants', [TenantController::class, 'store'])->name('tenants.store');
    Route::get('tenants/{tenant}', [TenantController::class, 'show'])->name('tenants.show');
    Route::put('tenants/{tenant}', [TenantController::class, 'update'])->name('tenants.update');
    Route::post('tenants/{tenant}/plan', [TenantController::class, 'changePlan'])->name('tenants.plan');
    Route::post('tenants/{tenant}/trial', [TenantController::class, 'extendTrial'])->name('tenants.trial');
    Route::post('tenants/{tenant}/status', [TenantController::class, 'changeStatus'])->name('tenants.status');

    Route::get('plans', [PlanController::class, 'index'])->name('plans.index');
    Route::post('plans', [PlanController::class, 'store'])->name('plans.store');
    Route::put('plans/{plan}', [PlanController::class, 'update'])->name('plans.update');
    Route::delete('plans/{plan}', [PlanController::class, 'destroy'])->name('plans.destroy');

    Route::get('subscriptions', [SubscriptionController::class, 'index'])->name('subscriptions.index');
    Route::post('subscriptions', [SubscriptionController::class, 'store'])->name('subscriptions.store');
    Route::post('subscriptions/{subscription}/paid', [SubscriptionController::class, 'markPaid'])->name('subscriptions.paid');
    Route::post('subscriptions/{subscription}/cancel', [SubscriptionController::class, 'cancel'])->name('subscriptions.cancel');

    Route::get('tickets', [TicketController::class, 'index'])->name('tickets.index');
    Route::put('tickets/{ticket}', [TicketController::class, 'update'])->name('tickets.update');
});
