<?php

namespace App\Models;

class WebsitePage extends SchoolModel
{
    protected function casts(): array
    {
        return ['show_in_menu' => 'boolean', 'is_published' => 'boolean'];
    }
}
