<?php

namespace App\Models;

use Illuminate\Support\Facades\Storage;

/** One public website per school (template, theme and home-page content). */
class SchoolWebsite extends SchoolModel
{
    public const SECTION_DEFAULTS = [
        'stats' => true,
        'highlights' => true,
        'leadership' => true,
        'news' => true,
        'events' => true,
        'gallery' => true,
        'testimonials' => true,
        'faqs' => true,
        'fees' => false,
    ];

    protected function casts(): array
    {
        return [
            'is_published' => 'boolean',
            'highlights' => 'array',
            'testimonials' => 'array',
            'faqs' => 'array',
            'sections' => 'array',
            'contact' => 'array',
            'social' => 'array',
            'admission_settings' => 'array',
            'published_at' => 'datetime',
        ];
    }

    public static function url(?string $path): ?string
    {
        return $path ? Storage::disk('public')->url($path) : null;
    }

    public function section(string $key): bool
    {
        return (bool) (($this->sections ?? []) + self::SECTION_DEFAULTS)[$key] ?? false;
    }

    public function admissionSetting(string $key, mixed $default = null): mixed
    {
        return data_get($this->admission_settings, $key, $default);
    }
}
