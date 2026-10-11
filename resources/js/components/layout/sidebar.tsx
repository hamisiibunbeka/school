import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronsLeft, GraduationCap, Minus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { navigation, type NavItem, type NavLink } from '@/components/layout/navigation';
import { useCan } from '@/hooks/use-can';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

function pathOf(url: string) {
    return url.split('?')[0];
}

/** Longest matching href wins so "/fees/payments/create" beats "/fees/payments". */
function useActiveHref(items: NavLink[]) {
    const { url } = usePage();
    const path = pathOf(url);
    return useMemo(() => {
        const matches = items.filter((i) => path === i.href || path.startsWith(i.href + '/'));
        return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
    }, [items, path]);
}

export function AppLogo({ compact = false }: { compact?: boolean }) {
    const { school, name } = usePage().props;
    return (
        <Link href="/dashboard" className="main-logo flex shrink-0 items-center gap-2">
            {school?.logo_url ? (
                <img src={school.logo_url} alt="logo" className="h-9 w-9 rounded-md object-cover" />
            ) : (
                <span className="grid h-9 w-9 place-content-center rounded-lg bg-gradient-to-br from-primary to-[#805dca] text-white shadow-[0_8px_16px_-8px_rgba(67,97,238,0.7)]">
                    <GraduationCap className="h-5 w-5" />
                </span>
            )}
            {!compact && (
                <span className="min-w-0">
                    <span className="block truncate text-lg leading-tight font-extrabold tracking-tight text-black dark:text-white-light">{name}</span>
                    <span className="block max-w-[150px] truncate text-[11px] font-semibold text-white-dark">{school?.name ?? 'Platform Console'}</span>
                </span>
            )}
        </Link>
    );
}

export default function Sidebar() {
    const can = useCan();
    const { auth } = usePage().props;
    const { toggleSidebar, closeMobileSidebar } = useTheme();
    const isPortalUser = auth.user?.role_slug === 'parent' || auth.user?.role_slug === 'student';

    const visibleSections = navigation
        .filter((s) => (s.superAdminOnly ? auth.user?.is_super_admin : true))
        .filter((s) => (s.portalOnly ? isPortalUser : true))
        .map((s) => ({
            ...s,
            items: s.items
                .filter((i) => !i.permission || can(i.permission))
                .map((i) => ({ ...i, children: i.children?.filter((c) => !c.permission || can(c.permission)) })),
        }))
        .filter((s) => s.items.length > 0);

    const allLinks = useMemo(
        () => visibleSections.flatMap((s) => s.items.flatMap((i) => (i.children ? i.children : i.href ? [{ title: i.title, href: i.href }] : []))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(visibleSections.map((s) => s.items.map((i) => i.key)))],
    );
    const activeHref = useActiveHref(allLinks);

    const activeGroup = visibleSections.flatMap((s) => s.items).find((i) => i.children?.some((c) => c.href === activeHref))?.key ?? '';
    const [openMenu, setOpenMenu] = useState<string>(activeGroup);

    useEffect(() => {
        setOpenMenu(activeGroup);
        closeMobileSidebar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeHref]);

    return (
        <>
            {/* mobile overlay */}
            <div className="fixed inset-0 z-50 hidden bg-black/60 max-lg:[.toggle-sidebar_&]:block" onClick={toggleSidebar} />
            <nav className="sidebar">
                <div className="flex h-full flex-col bg-white dark:bg-black">
                    <div className="flex items-center justify-between px-4 py-3">
                        <AppLogo />
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            className="flex h-8 w-8 items-center justify-center rounded-full transition duration-300 hover:bg-gray-500/10 dark:text-white-light dark:hover:bg-dark-light/10"
                            aria-label="Collapse sidebar"
                        >
                            <ChevronsLeft className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="relative flex-1 overflow-y-auto overflow-x-hidden pb-6">
                        <ul className="relative space-y-0.5 p-4 py-0 font-semibold">
                            {visibleSections.map((section) => (
                                <li key={section.title}>
                                    <h2 className="-mx-4 mb-1 flex items-center bg-white-light/30 px-7 py-3 text-[11px] font-extrabold tracking-wider text-[#3b3f5c] uppercase dark:bg-dark/[0.08] dark:text-white-dark">
                                        <Minus className="hidden h-5 w-4 flex-none" />
                                        <span>{section.title}</span>
                                    </h2>
                                    <ul>
                                        {section.items.map((item) => (
                                            <SidebarItem
                                                key={item.key}
                                                item={item}
                                                activeHref={activeHref}
                                                open={openMenu === item.key}
                                                onToggle={() => setOpenMenu((v) => (v === item.key ? '' : item.key))}
                                            />
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </nav>
        </>
    );
}

function SidebarItem({ item, activeHref, open, onToggle }: { item: NavItem; activeHref?: string; open: boolean; onToggle: () => void }) {
    const Icon = item.icon;

    if (!item.children) {
        return (
            <li className="nav-item">
                <Link href={item.href!} className={cn('group', activeHref === item.href && 'active')}>
                    <div className="flex items-center">
                        <Icon className="nav-icon" />
                        <span className="ps-3 text-black dark:text-[#506690] dark:group-hover:text-white-dark">{item.title}</span>
                    </div>
                </Link>
            </li>
        );
    }

    const childActive = item.children.some((c) => c.href === activeHref);

    return (
        <li className="menu nav-item">
            <button type="button" className={cn('group nav-link w-full', (open || childActive) && 'active')} onClick={onToggle}>
                <div className="flex items-center">
                    <Icon className="nav-icon" />
                    <span className="ps-3 text-black dark:text-[#506690] dark:group-hover:text-white-dark">{item.title}</span>
                </div>
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', !open && '-rotate-90')} />
            </button>
            <div className={cn('grid transition-[grid-template-rows] duration-300 ease-in-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <ul className="sub-menu overflow-hidden text-gray-500">
                    {item.children.map((child) => (
                        <li key={child.href}>
                            <Link href={child.href} className={cn(activeHref === child.href && 'active')}>
                                {child.title}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </li>
    );
}
