<?php

namespace App\Models\Concerns;

use App\Models\School;
use App\Models\Tenant;
use App\Support\Tenancy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Scopes a model to the current school and stamps tenant/school ids on create.
 *
 * Every query is automatically filtered by the active school, so a record
 * from another tenant can never be read, updated or deleted through it.
 */
trait BelongsToSchool
{
    public static function bootBelongsToSchool(): void
    {
        static::addGlobalScope('school', function (Builder $builder) {
            $tenancy = app(Tenancy::class);

            if ($tenancy->hasSchool()) {
                $builder->where($builder->getModel()->getTable().'.school_id', $tenancy->schoolId());
            }
        });

        static::creating(function ($model) {
            $tenancy = app(Tenancy::class);

            if ($tenancy->hasSchool()) {
                // Always trust the server-side context over any supplied value.
                $model->school_id = $tenancy->schoolId();
                $model->tenant_id = $tenancy->tenantId();
            }
        });
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
