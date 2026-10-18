<?php

namespace App\Http\Controllers\Hr;

use App\Http\Controllers\Duties\DutyRosterController;

/** Staff duties apart from teaching: Teacher on Duty, Prep, Games, Patrol … */
class StaffDutyController extends DutyRosterController
{
    protected function audience(): string
    {
        return 'staff';
    }

    protected function basePath(): string
    {
        return '/hr/duties';
    }

    protected function managePermission(): string
    {
        return 'hr.manage';
    }
}
