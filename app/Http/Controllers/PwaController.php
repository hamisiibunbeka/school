<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/** Web app manifest for the installable PWA. */
class PwaController extends Controller
{
    public function manifest(): JsonResponse
    {
        $name = config('app.name');

        return response()->json([
            'name' => "{$name} — School Management",
            'short_name' => $name,
            'description' => 'Admissions, academics, attendance, exams, fees, accounting, HR, boarding, transport and reports.',
            'id' => '/',
            'start_url' => '/dashboard?source=pwa',
            'scope' => '/',
            'display' => 'standalone',
            'orientation' => 'any',
            'background_color' => '#fafafa',
            'theme_color' => '#4361ee',
            'lang' => 'en',
            'categories' => ['education', 'business', 'productivity'],
            'icons' => [
                ['src' => '/icons/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => '/icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
                ['src' => '/icons/icon-maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
            'shortcuts' => [
                ['name' => 'Dashboard', 'url' => '/dashboard', 'icons' => [['src' => '/icons/shortcut-96.png', 'sizes' => '96x96']]],
                ['name' => 'Collect fees', 'url' => '/fees/payments/create', 'icons' => [['src' => '/icons/shortcut-96.png', 'sizes' => '96x96']]],
                ['name' => 'Attendance register', 'url' => '/attendance', 'icons' => [['src' => '/icons/shortcut-96.png', 'sizes' => '96x96']]],
                ['name' => 'Add student', 'url' => '/students/create', 'icons' => [['src' => '/icons/shortcut-96.png', 'sizes' => '96x96']]],
            ],
        ], 200, ['Content-Type' => 'application/manifest+json', 'Cache-Control' => 'public, max-age=3600']);
    }
}
