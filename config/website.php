<?php

/*
|--------------------------------------------------------------------------
| School websites
|--------------------------------------------------------------------------
|
| Public sites live at /sites/{school-slug} (or a mapped custom domain on
| plans that allow it). What a school can publish depends on its tenant's
| subscription plan (plans.code). Unknown plans fall back to "starter".
|
*/

return [

    'templates' => [
        'modern' => [
            'name' => 'Modern',
            'description' => 'Bold gradients, glass cards and big imagery — a confident, contemporary look.',
            'best_for' => 'Secondary schools & academies',
            'colors' => ['#4361ee', '#805dca'],
        ],
        'classic' => [
            'name' => 'Classic',
            'description' => 'Navy & gold, serif headings and a crest-style header — traditional and prestigious.',
            'best_for' => 'Established & boarding schools',
            'colors' => ['#1e3a5f', '#c9a227'],
        ],
        'minimal' => [
            'name' => 'Minimal',
            'description' => 'Clean white space, crisp typography and subtle accents — elegant and fast.',
            'best_for' => 'Any school wanting a calm, simple site',
            'colors' => ['#0f766e', '#334155'],
        ],
        'playful' => [
            'name' => 'Playful',
            'description' => 'Rounded shapes, bright colours and friendly illustrations.',
            'best_for' => 'Nursery & primary schools',
            'colors' => ['#f97316', '#0ea5e9'],
        ],
    ],

    // Feature entitlements per subscription plan (SRS 3.4 feature entitlements).
    'plans' => [
        'trial' => [
            'templates' => ['modern', 'minimal'],
            'max_pages' => 3,
            'max_gallery' => 12,
            'news' => true,
            'gallery' => true,
            'online_admission' => true,
            'document_uploads' => false,
            'custom_domain' => false,
            'remove_branding' => false,
        ],
        'starter' => [
            'templates' => ['modern', 'minimal', 'playful'],
            'max_pages' => 6,
            'max_gallery' => 60,
            'news' => true,
            'gallery' => true,
            'online_admission' => true,
            'document_uploads' => true,
            'custom_domain' => false,
            'remove_branding' => false,
        ],
        'professional' => [
            'templates' => ['modern', 'classic', 'minimal', 'playful'],
            'max_pages' => 25,
            'max_gallery' => 300,
            'news' => true,
            'gallery' => true,
            'online_admission' => true,
            'document_uploads' => true,
            'custom_domain' => false,
            'remove_branding' => true,
        ],
        'enterprise' => [
            'templates' => ['modern', 'classic', 'minimal', 'playful'],
            'max_pages' => null, // unlimited
            'max_gallery' => null,
            'news' => true,
            'gallery' => true,
            'online_admission' => true,
            'document_uploads' => true,
            'custom_domain' => true,
            'remove_branding' => true,
        ],
    ],

    // Online admission uploads
    'admission_documents' => [
        'max_files' => 4,
        'max_kb' => 4096,
        'mimes' => ['pdf', 'jpg', 'jpeg', 'png'],
    ],
];
