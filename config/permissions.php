<?php

/*
|--------------------------------------------------------------------------
| Permission catalogue
|--------------------------------------------------------------------------
|
| Each module exposes "<module>.view" and "<module>.manage". Holding
| "<module>.manage" implies "<module>.view". Roles store a list of these
| strings, and tenants can edit their own roles from Administration.
|
*/

$all = fn (array $modules) => collect($modules)
    ->flatMap(fn ($m) => ["$m.view", "$m.manage"])
    ->values()
    ->all();

$modules = [
    'dashboard' => 'Dashboard',
    'admissions' => 'Admissions',
    'students' => 'Students & Guardians',
    'academics' => 'Academics',
    'attendance' => 'Attendance',
    'exams' => 'Examinations',
    'fees' => 'Fees & Billing',
    'accounting' => 'Accounting',
    'hr' => 'HR & Staff',
    'payroll' => 'Payroll',
    'boarding' => 'Boarding',
    'transport' => 'Transport',
    'inventory' => 'Inventory & Procurement',
    'library' => 'Library',
    'health' => 'Health & Welfare',
    'communication' => 'Communication',
    'website' => 'School Website (CMS)',
    'reports' => 'Reports',
    'administration' => 'Administration',
];

$schoolModules = array_keys($modules);

return [

    'modules' => $modules,

    // Single abilities outside the view/manage pattern.
    'special' => [
        'fees.defer' => 'Authorize fee deferrals — let an admitted student proceed on a payment agreement',
    ],

    'roles' => [
        'school-admin' => [
            'name' => 'School Administrator',
            'description' => 'Full access to every school module.',
            'permissions' => [...$all($schoolModules), 'fees.defer'],
        ],
        'principal' => [
            'name' => 'Principal / Head Teacher',
            'description' => 'Academic oversight, approvals and reports.',
            'permissions' => [
                ...$all(['dashboard', 'admissions', 'students', 'academics', 'attendance', 'exams', 'communication', 'reports', 'health', 'website']),
                'fees.view', 'fees.defer', 'hr.view', 'boarding.view', 'transport.view', 'library.view', 'accounting.view',
            ],
        ],
        'bursar' => [
            'name' => 'Bursar / Accountant',
            'description' => 'Billing, receipts, expenses, ledger and financial reports.',
            'permissions' => [
                ...$all(['fees', 'accounting', 'payroll', 'reports']),
                'dashboard.view', 'students.view', 'inventory.view', 'communication.view',
            ],
        ],
        'teacher' => [
            'name' => 'Teacher',
            'description' => 'Assigned classes, attendance, marks and lesson plans.',
            'permissions' => [
                'dashboard.view', 'students.view', 'academics.view', 'academics.manage',
                'attendance.view', 'attendance.manage', 'exams.view', 'exams.manage',
                'communication.view', 'library.view', 'reports.view',
            ],
        ],
        'admissions-officer' => [
            'name' => 'Admissions Officer',
            'description' => 'Applications, decisions and enrolment.',
            'permissions' => [...$all(['admissions', 'students']), 'dashboard.view', 'academics.view', 'website.view'],
        ],
        'hr-officer' => [
            'name' => 'HR / Payroll Officer',
            'description' => 'Staff records, leave and payroll preparation.',
            'permissions' => [...$all(['hr', 'payroll']), 'dashboard.view', 'reports.view'],
        ],
        'storekeeper' => [
            'name' => 'Storekeeper / Procurement',
            'description' => 'Items, purchase orders and stock movement.',
            'permissions' => [...$all(['inventory']), 'dashboard.view', 'reports.view'],
        ],
        'librarian' => [
            'name' => 'Librarian',
            'description' => 'Catalogue, lending and returns.',
            'permissions' => [...$all(['library']), 'dashboard.view', 'students.view'],
        ],
        'boarding-master' => [
            'name' => 'Boarding Staff',
            'description' => 'Dormitories, allocations, roll calls and leave.',
            'permissions' => [...$all(['boarding', 'health']), 'dashboard.view', 'students.view'],
        ],
        'transport-officer' => [
            'name' => 'Transport Staff',
            'description' => 'Vehicles, routes and student allocations.',
            'permissions' => [...$all(['transport']), 'dashboard.view', 'students.view'],
        ],
        'auditor' => [
            'name' => 'Auditor',
            'description' => 'Read-only access to finance and audit records.',
            'permissions' => ['dashboard.view', 'fees.view', 'accounting.view', 'payroll.view', 'reports.view', 'administration.view'],
        ],
        'parent' => [
            'name' => 'Parent / Guardian',
            'description' => 'Linked wards only: fees, attendance, results and notices.',
            'permissions' => ['portal.parent'],
        ],
        'student' => [
            'name' => 'Student',
            'description' => 'Own timetable, results, assignments and announcements.',
            'permissions' => ['portal.student'],
        ],
    ],
];
