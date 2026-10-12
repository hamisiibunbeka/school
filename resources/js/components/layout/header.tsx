import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Link, router, usePage } from '@inertiajs/react';
import { ArrowLeftRight, Bell, Building, CalendarDays, Laptop, LogOut, Menu as MenuIcon, Moon, Search, ShieldCheck, Sun, UserRound, Wallet, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import SchoolSwitcher from '@/components/layout/school-switcher';
import { AppLogo } from '@/components/layout/sidebar';
import Avatar from '@/components/ui/avatar';
import { useCan } from '@/hooks/use-can';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

export default function Header() {
    const { auth, school, schools, notificationsCount } = usePage().props;
    const { theme, cycleTheme, toggleSidebar } = useTheme();
    const can = useCan();
    const [search, setSearch] = useState('');
    const [mobileSearch, setMobileSearch] = useState(false);

    const submitSearch = (e: FormEvent) => {
        e.preventDefault();
        if (!search.trim()) return;
        router.get('/students', { search: search.trim() });
        setMobileSearch(false);
    };

    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;
    const isSuperAdmin = !!auth.user?.is_super_admin;
    // School shortcuts only make sense inside a school (platform admins on the console have none).
    const inSchool = !!school;

    return (
        <header className="no-print sticky top-0 z-40">
            <div className="shadow-sm">
                <div className="relative flex w-full items-center bg-white px-5 py-2.5 dark:bg-black">
                    <div className="header-logo me-2 flex items-center justify-between lg:hidden">
                        <AppLogo compact />
                        <button type="button" className="header-icon-btn ms-2 dark:text-[#d0d2d6]" onClick={toggleSidebar} aria-label="Toggle menu">
                            <MenuIcon className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="me-2 hidden sm:block">
                        <ul className="flex items-center gap-2 dark:text-[#d0d2d6]">
                            {inSchool && can('academics.view') && (
                                <li>
                                    <Link href="/academics/calendar" className="header-icon-btn" title="School calendar">
                                        <CalendarDays className="h-5 w-5" />
                                    </Link>
                                </li>
                            )}
                            {inSchool && can('fees.manage') && (
                                <li>
                                    <Link href="/fees/payments/create" className="header-icon-btn" title="Collect payment">
                                        <Wallet className="h-5 w-5" />
                                    </Link>
                                </li>
                            )}
                        </ul>
                    </div>

                    <div className="ms-auto flex items-center gap-1.5 sm:ms-0 sm:flex-1 lg:gap-2 dark:text-[#d0d2d6]">
                        <div className="sm:me-auto">
                            {inSchool && can('students.view') && (
                                <>
                                    <form
                                        onSubmit={submitSearch}
                                        className={cn(
                                            'absolute inset-x-0 top-1/2 z-10 mx-4 hidden -translate-y-1/2 sm:relative sm:top-0 sm:mx-0 sm:block sm:translate-y-0',
                                            mobileSearch && 'block!',
                                        )}
                                    >
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                                className="peer form-input bg-gray-100 ps-9 pe-9 placeholder:tracking-wide sm:w-72 sm:bg-transparent sm:pe-4"
                                                placeholder="Search students by name or admission no…"
                                            />
                                            <button type="submit" className="absolute inset-y-0 start-0 w-9 peer-focus:text-primary">
                                                <Search className="mx-auto h-4 w-4" />
                                            </button>
                                            <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 hover:opacity-80 sm:hidden" onClick={() => setMobileSearch(false)}>
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </form>
                                    <button type="button" onClick={() => setMobileSearch(true)} className="header-icon-btn sm:hidden" aria-label="Search">
                                        <Search className="h-4.5 w-4.5" />
                                    </button>
                                </>
                            )}
                        </div>

                        {isSuperAdmin && inSchool && (
                            <button
                                type="button"
                                onClick={() => router.post('/switch-school', { school_id: null })}
                                className="btn btn-sm btn-outline-warning hidden rounded-full! md:inline-flex"
                                title="Leave this school and return to the platform console"
                            >
                                <ArrowLeftRight className="h-4 w-4" /> Back to platform
                            </button>
                        )}

                        {/* Tenant admins: their schools. Platform admins (inside a school): every tenant's schools. */}
                        {(isSuperAdmin ? inSchool && schools.length > 0 : schools.length > 1) && <SchoolSwitcher />}

                        <button type="button" onClick={cycleTheme} className="header-icon-btn" title={`Theme: ${theme}`}>
                            <ThemeIcon className="h-5 w-5" />
                        </button>

                        <Link href="/notifications" className="header-icon-btn relative" title="Notifications">
                            <Bell className="h-5 w-5" />
                            {notificationsCount > 0 && (
                                <span className="absolute end-0 top-0 flex h-3 w-3">
                                    <span className="absolute -start-[3px] -top-[3px] inline-flex h-full w-full animate-ping rounded-full bg-success/50 opacity-75" />
                                    <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-success" />
                                </span>
                            )}
                        </Link>

                        <Menu as="div" className="relative flex shrink-0">
                            <MenuButton className="group relative block">
                                <Avatar name={auth.user?.name} src={auth.user?.avatar_url} className="h-9 w-9 saturate-50 group-hover:saturate-100" />
                            </MenuButton>
                            <MenuItems anchor="bottom end" className="dropdown-menu z-50 mt-2 w-[240px] !py-0 font-semibold focus:outline-none">
                                <div className="flex items-center px-4 py-4">
                                    <Avatar name={auth.user?.name} src={auth.user?.avatar_url} className="h-10 w-10 rounded-md" />
                                    <div className="truncate ps-3">
                                        <h4 className="truncate text-base">{auth.user?.name}</h4>
                                        <span className="block truncate text-xs text-black/60 dark:text-dark-light/60">{auth.user?.email}</span>
                                        {auth.user?.role && <span className="mt-1 inline-block rounded bg-success-light px-1.5 text-[11px] text-success dark:bg-success-dark-light">{auth.user.role}</span>}
                                    </div>
                                </div>
                                <MenuItem>
                                    <Link href="/settings/profile" className="dropdown-item">
                                        <UserRound className="h-4.5 w-4.5" /> My Profile
                                    </Link>
                                </MenuItem>
                                <MenuItem>
                                    <Link href="/settings/security" className="dropdown-item">
                                        <ShieldCheck className="h-4.5 w-4.5" /> Password & Security
                                    </Link>
                                </MenuItem>
                                <MenuItem>
                                    <Link href="/notifications" className="dropdown-item">
                                        <Bell className="h-4.5 w-4.5" /> Notifications
                                        {notificationsCount > 0 && <span className="badge badge-primary ms-auto">{notificationsCount}</span>}
                                    </Link>
                                </MenuItem>
                                <div className="border-t border-white-light dark:border-white-light/10">
                                    <MenuItem>
                                        <Link href="/logout" method="post" as="button" className="dropdown-item py-3! text-danger">
                                            <LogOut className="h-4.5 w-4.5 rotate-180" /> Sign Out
                                        </Link>
                                    </MenuItem>
                                </div>
                            </MenuItems>
                        </Menu>
                    </div>
                </div>
            </div>
        </header>
    );
}
