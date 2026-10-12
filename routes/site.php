<?php

use App\Http\Controllers\Site\SiteController;
use App\Http\Middleware\ResolveSchoolSite;
use Illuminate\Support\Facades\Route;

/*
| Public school websites — /sites/{school-slug}/...
| No login required. ResolveSchoolSite sets the school context from the slug.
*/
Route::prefix('sites/{site}')->middleware(ResolveSchoolSite::class)->name('site.')->group(function () {
    Route::get('/', [SiteController::class, 'home'])->name('home');
    Route::get('about', [SiteController::class, 'about'])->name('about');
    Route::get('academics', [SiteController::class, 'academics'])->name('academics');
    Route::get('news', [SiteController::class, 'news'])->name('news');
    Route::get('news/{slug}', [SiteController::class, 'post'])->name('post');
    Route::get('gallery', [SiteController::class, 'gallery'])->name('gallery');
    Route::get('p/{slug}', [SiteController::class, 'page'])->name('page');

    Route::get('contact', [SiteController::class, 'contact'])->name('contact');
    Route::post('contact', [SiteController::class, 'sendContact'])->middleware('throttle:5,10')->name('contact.send');

    Route::get('admissions', [SiteController::class, 'admissions'])->name('admissions');
    Route::post('admissions', [SiteController::class, 'apply'])->middleware('throttle:6,10')->name('admissions.apply');
    Route::get('admissions/track', [SiteController::class, 'track'])->middleware('throttle:30,1')->name('admissions.track');
    Route::get('admissions/submitted/{code}', [SiteController::class, 'submitted'])->name('admissions.submitted');
});
