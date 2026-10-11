<?php

namespace App\Models;

class Supplier extends SchoolModel
{
    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
