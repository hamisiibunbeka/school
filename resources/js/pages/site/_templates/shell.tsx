import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { NavItem, SiteChrome } from '../_components/types';
import { Crest, PreviewBanner, SITE_CSS, siteVars } from '../_components/ui';
import { ThemeProvider, themes } from './theme';

/** Path part of the current Inertia URL (no query string). */
export function useCurrentPath(): string {
    const { url } = usePage();
    return url.split('?')[0].replace(/\/$/, '');
}

export function isActive(item: NavItem, path: string, base: string): boolean {
    const href = item.href.replace(/\/$/, '');
    if (href === base || href === '') return path === href; // home link (site base or "/")
    return path === href || path.startsWith(`${href}/`);
}

/**
 * Root wrapper every template uses: theme context, colour variables, global
 * site CSS, <Head> tags, the preview banner, and forcing the light scheme
 * (the admin app may have toggled dark mode on <html>).
 */
export function SiteShell({ site, title, description, children }: { site: SiteChrome; title?: string; description?: string | null; children: ReactNode }) {
    const theme = themes[site.template] ?? themes.modern;

    useEffect(() => {
        const root = document.documentElement;
        const hadDark = root.classList.contains('dark');
        root.classList.remove('dark');
        return () => {
            if (hadDark) root.classList.add('dark');
        };
    }, []);

    const pageTitle = title && title !== site.seo.title ? `${title} — ${site.name}` : site.seo.title || site.name;
    const desc = description || site.seo.description || site.tagline || `${site.name} — official website.`;

    return (
        <ThemeProvider site={site}>
            <Head title={pageTitle}>
                <meta head-key="description" name="description" content={desc} />
                <meta head-key="og:title" property="og:title" content={pageTitle} />
                <meta head-key="og:description" property="og:description" content={desc} />
                <meta head-key="og:type" property="og:type" content="website" />
                {site.logo_url && <meta head-key="og:image" property="og:image" content={site.logo_url} />}
                <meta head-key="theme-color" name="theme-color" content={(siteVars(site, theme.defaults) as Record<string, string>)['--site-primary']} />
            </Head>
            <style>{SITE_CSS}</style>
            <div
                className={cn('site-root flex min-h-screen flex-col', theme.root)}
                style={{ ...siteVars(site, theme.defaults), '--site-heading-font': theme.headingFont, fontFamily: theme.bodyFont, colorScheme: 'light' } as CSSProperties}
            >
                <a
                    href="#main"
                    className="sr-only z-[100] rounded-md bg-white px-4 py-2 font-bold text-slate-900 shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
                >
                    Skip to content
                </a>
                {site.is_preview && <PreviewBanner />}
                {children}
            </div>
        </ThemeProvider>
    );
}

/** Mobile slide-in navigation shared by all templates (styled via props). */
export function MobileNav({
    site,
    open,
    onClose,
    panelClassName,
    itemClassName,
    activeClassName,
    cta,
}: {
    site: SiteChrome;
    open: boolean;
    onClose: () => void;
    panelClassName?: string;
    itemClassName?: string;
    activeClassName?: string;
    cta?: ReactNode;
}) {
    const path = useCurrentPath();

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    return (
        <div className={cn('fixed inset-0 z-[90] lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} inert={!open}>
            <div className={cn('absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
            <nav
                id="site-mobile-nav"
                aria-label="Main"
                className={cn(
                    'absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-2xl transition-transform duration-300 ease-out',
                    open ? 'translate-x-0' : 'translate-x-full',
                    panelClassName,
                )}
            >
                <div className="mb-6 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                        <Crest site={site} className="h-10 w-10" variant={site.template === 'classic' ? 'shield' : site.template === 'playful' ? 'blob' : site.template === 'minimal' ? 'square' : 'circle'} />
                        <span className="truncate font-extrabold">{site.name}</span>
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:outline-none"
                        aria-label="Close menu"
                        tabIndex={open ? 0 : -1}
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>
                <ul className="space-y-1">
                    {site.nav.map((item) => {
                        const active = isActive(item, path, site.base);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    onClick={onClose}
                                    tabIndex={open ? 0 : -1}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'flex items-center justify-between rounded-xl px-4 py-3 text-base font-bold transition hover:bg-black/5',
                                        itemClassName,
                                        active && (activeClassName ?? 'bg-[color-mix(in_srgb,var(--site-primary)_10%,white)] text-[var(--site-primary)]'),
                                    )}
                                >
                                    {item.label}
                                    <ArrowUpRight className="h-4 w-4 opacity-40" aria-hidden="true" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
                {cta && <div className="mt-6">{cta}</div>}
            </nav>
        </div>
    );
}

export function MenuButton({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label="Open menu"
            className={cn('inline-flex items-center justify-center rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:outline-none lg:hidden', className)}
        >
            <Menu className="h-6 w-6" />
        </button>
    );
}

export function useMenu() {
    const [open, setOpen] = useState(false);
    const { url } = usePage();
    useEffect(() => setOpen(false), [url]);
    return { open, setOpen, close: () => setOpen(false) };
}

/** Header shadow / transparency once the user scrolls. */
export function useScrolled(offset = 12): boolean {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const on = () => setScrolled(window.scrollY > offset);
        on();
        window.addEventListener('scroll', on, { passive: true });
        return () => window.removeEventListener('scroll', on);
    }, [offset]);
    return scrolled;
}

/** Footer quick links: nav without Home. */
export function quickLinks(site: SiteChrome): NavItem[] {
    return site.nav.filter((n) => n.href !== site.base && n.href !== '/');
}

export function BrandingCredit({ site, className }: { site: SiteChrome; className?: string }) {
    if (!site.show_branding) return null;
    return <p className={cn('text-xs', className)}>Website by {site.platform}</p>;
}

/**
 * Desktop menu split: the first `max` built-in pages stay in the bar (plus the portal link);
 * remaining built-ins and custom pages go into a "More" dropdown so long menus never overflow.
 */
export function splitNav(nav: NavItem[], max = 5): { main: NavItem[]; more: NavItem[] } {
    const portal = nav.filter((n) => n.portal);
    const items = nav.filter((n) => !n.portal);
    if (items.length <= max + 1) return { main: nav, more: [] };
    const builtIn = items.filter((n) => !n.href.includes('/p/'));
    const custom = items.filter((n) => n.href.includes('/p/'));
    return { main: [...builtIn.slice(0, max), ...portal], more: [...builtIn.slice(max), ...custom] };
}

/** "More ▾" dropdown for the desktop menu. `triggerClass` matches the template's menu links. */
export function NavMore({ items, triggerClass, active }: { items: NavItem[]; triggerClass: string; active?: boolean }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLLIElement>(null);
    const { url } = usePage();
    useEffect(() => setOpen(false), [url]);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);
    if (!items.length) return null;
    return (
        <li ref={ref} className="relative">
            <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(triggerClass, 'inline-flex items-center gap-1', active && 'font-extrabold')}>
                More <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} aria-hidden="true" />
            </button>
            {open && (
                <ul className="absolute right-0 z-50 mt-2 min-w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 text-left shadow-xl">
                    {items.map((item) => (
                        <li key={item.href}>
                            <Link href={item.href} className="block px-4 py-2 text-sm font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-50 hover:text-[var(--site-primary)]">
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
}