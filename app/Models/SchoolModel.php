<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSchool;
use Illuminate\Database\Eloquent\Model;

/**
 * Base class for every school-owned record (carries tenant_id + school_id).
 *
 * Mass assignment is open apart from the identity and scope columns;
 * controllers must still pass only validated data.
 */
abstract class SchoolModel extends Model
{
    use BelongsToSchool;

    protected $guarded = ['id', 'tenant_id', 'school_id'];
}
