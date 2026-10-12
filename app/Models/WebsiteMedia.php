<?php

namespace App\Models;

class WebsiteMedia extends SchoolModel
{
    protected $table = 'website_media';

    protected function casts(): array
    {
        return ['is_published' => 'boolean'];
    }
}
