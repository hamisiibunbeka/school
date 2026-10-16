import {
    BarChart3,
    BedDouble,
    BookOpen,
    Building2,
    Bus,
    CalendarCheck,
    ClipboardList,
    Globe,
    GraduationCap,
    HeartPulse,
    Home,
    Landmark,
    LayoutDashboard,
    Library,
    Megaphone,
    Package,
    Settings,
    UserPlus,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';

export type NavLink = { title: string; href: string; permission?: string | string[] };
export type NavItem = {
    key: string;
    title: string;
    icon: LucideIcon;
    href?: string;
    permission?: string | string[];
    children?: NavLink[];
};
export type NavSection = { title: string; items: NavItem[]; superAdminOnly?: boolean; portalOnly?: boolean };

/** Main navigation (SRS §11 screen inventory). Items are hidden when the user lacks the permission. */
export const navigation: NavSection[] = [
    {
        title: 'Portal',
        portalOnly: true,
        items: [{ key: 'portal', title: 'My Portal', icon: Home, href: '/portal', permission: ['portal.parent', 'portal.student'] }],
    },
    {
        title: 'Overview',
        items: [{ key: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', permission: 'dashboard.view' }],
    },
    {
        title: 'Student Life',
        items: [
            {
                key: 'admissions',
                title: 'Admissions',
                icon: UserPlus,
                permission: 'admissions.view',
                children: [
                    { title: 'Applications', href: '/admissions' },
                    { title: 'New Application', href: '/admissions/create', permission: 'admissions.manage' },
                ],
            },
            {
                key: 'students',
                title: 'Students',
                icon: GraduationCap,
                permission: 'students.view',
                children: [
                    { title: 'Student Directory', href: '/students' },
                    { title: 'Add Student', href: '/students/create', permission: 'students.manage' },
                    { title: 'Guardians', href: '/guardians' },
                    { title: 'Promotions', href: '/students/promotions', permission: 'students.manage' },
                ],
            },
            {
                key: 'academics',
                title: 'Academics',
                icon: BookOpen,
                permission: 'academics.view',
                children: [
                    { title: 'Years & Terms', href: '/academics/years' },
                    { title: 'Classes & Streams', href: '/academics/classes' },
                    { title: 'Subjects', href: '/academics/subjects' },
                    { title: 'Teacher Allocation', href: '/academics/allocations' },
                    { title: 'Timetable', href: '/academics/timetable' },
                    { title: 'Lesson Plans', href: '/academics/lesson-plans' },
                    { title: 'Homework', href: '/academics/homework' },
                    { title: 'School Calendar', href: '/academics/calendar' },
                ],
            },
            {
                key: 'attendance',
                title: 'Attendance',
                icon: CalendarCheck,
                permission: 'attendance.view',
                children: [
                    { title: 'Student Register', href: '/attendance' },
                    { title: 'Staff Attendance', href: '/attendance/staff' },
                    { title: 'Attendance Report', href: '/attendance/report' },
                    { title: 'Discipline', href: '/attendance/discipline' },
                ],
            },
            {
                key: 'exams',
                title: 'Examinations',
                icon: ClipboardList,
                permission: 'exams.view',
                children: [
                    { title: 'Exams', href: '/exams' },
                    { title: 'Report Cards', href: '/exams/report-cards' },
                    { title: 'Grading Scale', href: '/exams/grading' },
                ],
            },
        ],
    },
    {
        title: 'Finance',
        items: [
            {
                key: 'fees',
                title: 'Fees & Billing',
                icon: Wallet,
                permission: 'fees.view',
                children: [
                    { title: 'Collect Payment', href: '/fees/payments/create', permission: 'fees.manage' },
                    { title: 'Payments & Receipts', href: '/fees/payments' },
                    { title: 'Invoices', href: '/fees/invoices' },
                    { title: 'Fee Structures', href: '/fees/structures' },
                    { title: 'Discounts & Scholarships', href: '/fees/discounts' },
                    { title: 'Arrears & Aging', href: '/fees/arrears' },
                    { title: 'Fee Categories', href: '/fees/categories' },
                ],
            },
            {
                key: 'accounting',
                title: 'Accounting',
                icon: Landmark,
                permission: 'accounting.view',
                children: [
                    { title: 'Chart of Accounts', href: '/accounting/accounts' },
                    { title: 'Journals', href: '/accounting/journals' },
                    { title: 'Expenses & Vouchers', href: '/accounting/expenses' },
                    { title: 'General Ledger', href: '/accounting/ledger' },
                    { title: 'Trial Balance', href: '/accounting/trial-balance' },
                    { title: 'Income Statement', href: '/accounting/income-statement' },
                    { title: 'Balance Sheet', href: '/accounting/balance-sheet' },
                    { title: 'Cash Flow', href: '/accounting/cash-flow' },
                    { title: 'Levies & Compliance', href: '/accounting/compliance' },
                    { title: 'Budgets', href: '/accounting/budgets' },
                    { title: 'Fiscal Years', href: '/accounting/fiscal-years' },
                ],
            },
        ],
    },
    {
        title: 'People & Operations',
        items: [
            {
                key: 'hr',
                title: 'HR & Payroll',
                icon: Users,
                permission: ['hr.view', 'payroll.view'],
                children: [
                    { title: 'Employees', href: '/hr/employees', permission: 'hr.view' },
                    { title: 'Departments', href: '/hr/departments', permission: 'hr.view' },
                    { title: 'Leave Management', href: '/hr/leave', permission: 'hr.view' },
                    { title: 'Payroll Runs', href: '/payroll', permission: 'payroll.view' },
                    { title: 'Salary Components', href: '/payroll/components', permission: 'payroll.view' },
                    { title: 'Statutory Rules (PAYE, NSSF…)', href: '/payroll/statutory', permission: 'payroll.view' },
                ],
            },
            {
                key: 'boarding',
                title: 'Boarding',
                icon: BedDouble,
                permission: 'boarding.view',
                children: [
                    { title: 'Dormitories', href: '/boarding/dormitories' },
                    { title: 'Bed Allocation', href: '/boarding/allocations' },
                    { title: 'Roll Call', href: '/boarding/roll-call' },
                    { title: 'Leave Passes', href: '/boarding/leave-passes' },
                    { title: 'Visitors', href: '/boarding/visitors' },
                    { title: 'Pocket Money', href: '/boarding/pocket-money' },
                ],
            },
            {
                key: 'transport',
                title: 'Transport',
                icon: Bus,
                permission: 'transport.view',
                children: [
                    { title: 'Vehicles', href: '/transport/vehicles' },
                    { title: 'Routes & Stops', href: '/transport/routes' },
                    { title: 'Student Allocation', href: '/transport/assignments' },
                    { title: 'Fuel & Maintenance', href: '/transport/logs' },
                ],
            },
            {
                key: 'inventory',
                title: 'Inventory',
                icon: Package,
                permission: 'inventory.view',
                children: [
                    { title: 'Items & Stock', href: '/inventory/items' },
                    { title: 'Stock Movements', href: '/inventory/movements' },
                    { title: 'Purchase Orders', href: '/inventory/purchase-orders' },
                    { title: 'Suppliers', href: '/inventory/suppliers' },
                ],
            },
            {
                key: 'library',
                title: 'Library',
                icon: Library,
                permission: 'library.view',
                children: [
                    { title: 'Catalogue', href: '/library/books' },
                    { title: 'Issue & Return', href: '/library/loans' },
                ],
            },
            { key: 'health', title: 'Health & Welfare', icon: HeartPulse, href: '/health/visits', permission: 'health.view' },
        ],
    },
    {
        title: 'Engagement & Insight',
        items: [
            {
                key: 'communication',
                title: 'Communication',
                icon: Megaphone,
                permission: 'communication.view',
                children: [
                    { title: 'Announcements', href: '/communication/announcements' },
                    { title: 'SMS & Email', href: '/communication/messages' },
                    { title: 'Templates', href: '/communication/templates' },
                ],
            },
            {
                key: 'website',
                title: 'School Website',
                icon: Globe,
                permission: 'website.view',
                children: [
                    { title: 'Website Builder', href: '/website' },
                    { title: 'Pages', href: '/website/pages' },
                    { title: 'News & Events', href: '/website/posts' },
                    { title: 'Gallery', href: '/website/gallery' },
                    { title: 'Enquiries', href: '/website/inquiries' },
                    { title: 'Online Applications', href: '/admissions?source=online', permission: 'admissions.view' },
                ],
            },
            { key: 'reports', title: 'Reports', icon: BarChart3, href: '/reports', permission: 'reports.view' },
        ],
    },
    {
        title: 'Administration',
        items: [
            {
                key: 'admin',
                title: 'Administration',
                icon: Settings,
                permission: 'administration.view',
                children: [
                    { title: 'School Settings', href: '/admin/settings' },
                    { title: 'Users', href: '/admin/users' },
                    { title: 'Roles & Permissions', href: '/admin/roles' },
                    { title: 'Audit Trail', href: '/admin/audit-logs' },
                    { title: 'Subscription', href: '/admin/subscription' },
                ],
            },
        ],
    },
    {
        title: 'SaaS Console',
        superAdminOnly: true,
        items: [
            {
                key: 'saas',
                title: 'Platform',
                icon: Building2,
                children: [
                    { title: 'Overview', href: '/saas' },
                    { title: 'Tenants', href: '/saas/tenants' },
                    { title: 'Plans', href: '/saas/plans' },
                    { title: 'Subscriptions', href: '/saas/subscriptions' },
                    { title: 'Support Tickets', href: '/saas/tickets' },
                    { title: 'Platform Settings', href: '/saas/settings' },
                ],
            },
        ],
    },
];
