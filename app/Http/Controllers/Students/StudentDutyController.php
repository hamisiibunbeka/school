<?php

namespace App\Http\Controllers\Students;

use App\Http\Controllers\Duties\DutyRosterController;

/** Students' after-class duties: dining hall, cleaning, compound, flag … */
class StudentDutyController extends DutyRosterController
{
    protected function audience(): string
    {
        return 'student';
    }

    protected function basePath(): string
    {
        return '/students/duties';
    }

    protected function managePermission(): string
    {
        return 'students.manage';
    }
}
