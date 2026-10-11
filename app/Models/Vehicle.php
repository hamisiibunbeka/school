<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vehicle extends SchoolModel
{
    public const STATUSES = ['active', 'maintenance', 'retired'];

    /** Days ahead at which a compliance date is flagged as "due soon". */
    public const WARNING_DAYS = 30;

    protected function casts(): array
    {
        return [
            'insurance_expiry' => 'date:Y-m-d',
            'inspection_expiry' => 'date:Y-m-d',
            'next_service_date' => 'date:Y-m-d',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'driver_id');
    }

    public function routes(): HasMany
    {
        return $this->hasMany(TransportRoute::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(VehicleLog::class);
    }

    /** ok | due | expired | null for a single compliance date. */
    public static function flag(?CarbonInterface $date): ?string
    {
        if (! $date) {
            return null;
        }
        $today = now()->startOfDay();
        if ($date->lt($today)) {
            return 'expired';
        }

        return $date->lte($today->addDays(self::WARNING_DAYS)) ? 'due' : 'ok';
    }

    /** @return array{insurance: ?string, inspection: ?string, service: ?string} */
    public function compliance(): array
    {
        return [
            'insurance' => self::flag($this->insurance_expiry),
            'inspection' => self::flag($this->inspection_expiry),
            'service' => self::flag($this->next_service_date),
        ];
    }

    public function hasComplianceIssue(): bool
    {
        return (bool) array_intersect(['due', 'expired'], $this->compliance());
    }
}
