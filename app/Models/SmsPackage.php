<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** SMS bundle sold by the platform (SaaS console → SMS Packages). */
class SmsPackage extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'credits' => 'integer', 'is_popular' => 'boolean', 'is_active' => 'boolean'];
    }

    public function pricePerSms(): float
    {
        return $this->credits ? round((float) $this->price / $this->credits, 2) : 0.0;
    }
}
