<?php

namespace App\Support;

use App\Models\School;
use App\Models\Tenant;

/**
 * Holds the tenant/school context for the current request or job.
 *
 * The context is always established server-side from the authenticated
 * user's membership (see SetSchoolContext middleware) and never from
 * client-supplied identifiers.
 */
class Tenancy
{
    protected ?School $school = null;

    public function setSchool(?School $school): void
    {
        $this->school = $school;
    }

    public function school(): ?School
    {
        return $this->school;
    }

    public function schoolId(): ?int
    {
        return $this->school?->id;
    }

    public function tenantId(): ?int
    {
        return $this->school?->tenant_id;
    }

    public function tenant(): ?Tenant
    {
        return $this->school?->tenant;
    }

    public function hasSchool(): bool
    {
        return $this->school !== null;
    }

    /**
     * Run a callback within the context of another school (e.g. queued jobs, seeders).
     *
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public function runAs(School $school, callable $callback): mixed
    {
        $previous = $this->school;
        $this->school = $school;

        try {
            return $callback();
        } finally {
            $this->school = $previous;
        }
    }
}
