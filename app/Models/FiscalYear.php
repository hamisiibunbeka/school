<?php

namespace App\Models;

class FiscalYear extends SchoolModel
{
    protected function casts(): array
    {
        return ['start_date' => 'date', 'end_date' => 'date'];
    }

    public static function forDate(string|\DateTimeInterface $date): ?self
    {
        return static::whereDate('start_date', '<=', $date)->whereDate('end_date', '>=', $date)->first();
    }

    public function isClosed(): bool
    {
        return $this->status === 'closed';
    }
}
