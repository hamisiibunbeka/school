<?php

use App\Http\Controllers\Inventory\ItemController;
use App\Http\Controllers\Inventory\MovementController;
use App\Http\Controllers\Inventory\PurchaseOrderController;
use App\Http\Controllers\Inventory\SupplierController;
use Illuminate\Support\Facades\Route;

// Inventory, stores & procurement (SRS 4.15)
Route::middleware('can:inventory.manage')->prefix('inventory')->name('inventory.')->group(function () {
    Route::post('items', [ItemController::class, 'store'])->name('items.store');
    Route::put('items/{item}', [ItemController::class, 'update'])->name('items.update');
    Route::delete('items/{item}', [ItemController::class, 'destroy'])->name('items.destroy');
    Route::post('categories', [ItemController::class, 'storeCategory'])->name('categories.store');
    Route::put('categories/{category}', [ItemController::class, 'updateCategory'])->name('categories.update');
    Route::delete('categories/{category}', [ItemController::class, 'destroyCategory'])->name('categories.destroy');

    Route::post('movements', [MovementController::class, 'store'])->name('movements.store');

    Route::get('purchase-orders/create', [PurchaseOrderController::class, 'create'])->name('purchase-orders.create');
    Route::post('purchase-orders', [PurchaseOrderController::class, 'store'])->name('purchase-orders.store');
    Route::get('purchase-orders/{purchaseOrder}/edit', [PurchaseOrderController::class, 'edit'])->name('purchase-orders.edit');
    Route::put('purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'update'])->name('purchase-orders.update');
    Route::post('purchase-orders/{purchaseOrder}/approve', [PurchaseOrderController::class, 'approve'])->name('purchase-orders.approve');
    Route::post('purchase-orders/{purchaseOrder}/cancel', [PurchaseOrderController::class, 'cancel'])->name('purchase-orders.cancel');
    Route::post('purchase-orders/{purchaseOrder}/receive', [PurchaseOrderController::class, 'receive'])->name('purchase-orders.receive');
    Route::delete('purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'destroy'])->name('purchase-orders.destroy');

    Route::post('suppliers', [SupplierController::class, 'store'])->name('suppliers.store');
    Route::put('suppliers/{supplier}', [SupplierController::class, 'update'])->name('suppliers.update');
    Route::delete('suppliers/{supplier}', [SupplierController::class, 'destroy'])->name('suppliers.destroy');
});

Route::middleware('can:inventory.view')->prefix('inventory')->name('inventory.')->group(function () {
    Route::get('/', fn () => to_route('inventory.items.index'));
    Route::get('items', [ItemController::class, 'index'])->name('items.index');
    Route::get('movements', [MovementController::class, 'index'])->name('movements.index');
    Route::get('purchase-orders', [PurchaseOrderController::class, 'index'])->name('purchase-orders.index');
    Route::get('purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'show'])->name('purchase-orders.show');
    Route::get('suppliers', [SupplierController::class, 'index'])->name('suppliers.index');
});
