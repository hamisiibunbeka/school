<?php

use App\Http\Controllers\Website\GalleryController;
use App\Http\Controllers\Website\InquiryController;
use App\Http\Controllers\Website\PageController;
use App\Http\Controllers\Website\PostController;
use App\Http\Controllers\Website\WebsiteController;
use Illuminate\Support\Facades\Route;

// School website CMS (website.view / website.manage)
Route::middleware('can:website.manage')->group(function () {
    Route::put('website', [WebsiteController::class, 'update'])->name('website.update');
    Route::post('website/publish', [WebsiteController::class, 'publish'])->name('website.publish');

    Route::post('website/pages', [PageController::class, 'store'])->name('website.pages.store');
    Route::put('website/pages/{page}', [PageController::class, 'update'])->name('website.pages.update');
    Route::delete('website/pages/{page}', [PageController::class, 'destroy'])->name('website.pages.destroy');

    Route::post('website/posts', [PostController::class, 'store'])->name('website.posts.store');
    Route::put('website/posts/{post}', [PostController::class, 'update'])->name('website.posts.update');
    Route::delete('website/posts/{post}', [PostController::class, 'destroy'])->name('website.posts.destroy');

    Route::post('website/gallery', [GalleryController::class, 'store'])->name('website.gallery.store');
    Route::put('website/gallery/{media}', [GalleryController::class, 'update'])->name('website.gallery.update');
    Route::delete('website/gallery/{media}', [GalleryController::class, 'destroy'])->name('website.gallery.destroy');

    Route::put('website/inquiries/{inquiry}', [InquiryController::class, 'update'])->name('website.inquiries.update');
    Route::delete('website/inquiries/{inquiry}', [InquiryController::class, 'destroy'])->name('website.inquiries.destroy');
});

Route::middleware('can:website.view')->group(function () {
    Route::get('website', [WebsiteController::class, 'index'])->name('website.index');
    Route::get('website/pages', [PageController::class, 'index'])->name('website.pages.index');
    Route::get('website/posts', [PostController::class, 'index'])->name('website.posts.index');
    Route::get('website/gallery', [GalleryController::class, 'index'])->name('website.gallery.index');
    Route::get('website/inquiries', [InquiryController::class, 'index'])->name('website.inquiries.index');
});
