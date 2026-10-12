import { usePage } from '@inertiajs/react';
import {
    Award,
    BookOpen,
    Bus,
    CheckCircle2,
    Facebook,
    FlaskConical,
    Globe,
    GraduationCap,
    Heart,
    Instagram,
    Linkedin,
    MessageCircle,
    Monitor,
    Music,
    ShieldCheck,
    Sparkles,
    Star,
    Trophy,
    Twitter,
    Users,
    X,
    Youtube,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn, initials } from '@/lib/utils';
import type { SiteChrome } from './types';

/* -------------------------------------------------------------------------- */
/*  Colours                                                                    */
/* -------------------------------------------------------------------------- */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normaliseHex(value: string | null | undefined, fallback: string): string {
    if (!value || !HEX.test(value.trim())) return fallback;
    let h = value.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return `#${h.toLowerCase()}`;
}

/** Black or white text, whichever reads better on the given background. */
export function readableOn(hex: string): string {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.45 ? '#0f172a' : '#ffffff';
}

/** CSS variables carrying the school's colours; every template reads these. */
export function siteVars(site: SiteChrome, defaults: { primary: string; secondary: string }): CSSProperties {
    const primary = normaliseHex(site.colors.primary, defaults.primary);
    const secondary = normaliseHex(site.colors.secondary, defaults.secondary);
    return {
        '--site-primary': primary,
        '--site-secondary': secondary,
        '--site-on-primary': readableOn(primary),
        '--site-on-secondary': readableOn(secondary),
    } as CSSProperties;
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

const highlightIcons: Record<string, LucideIcon> = {
    graduation: GraduationCap,
    users: Users,
    flask: FlaskConical,
    shield: ShieldCheck,
    book: BookOpen,
    trophy: Trophy,
    globe: Globe,
    heart: Heart,
    bus: Bus,
    music: Music,
    computer: Monitor,
    star: Star,
    award: Award,
};

export function HighlightIcon({ name, className }: { name?: string | null; className?: string }) {
    const Icon = (name && highlightIcons[name]) || Sparkles;
    return <Icon className={className} aria-hidden="true" />;
}

const socialMeta: Record<string, { label: string; icon: LucideIcon; href: (v: string) => string }> = {
    facebook: { label: 'Facebook', icon: Facebook, href: (v) => v },
    instagram: { label: 'Instagram', icon: Instagram, href: (v) => v },
    x: { label: 'X (Twitter)', icon: Twitter, href: (v) => v },
    youtube: { label: 'YouTube', icon: Youtube, href: (v) => v },
    linkedin: { label: 'LinkedIn', icon: Linkedin, href: (v) => v },
    whatsapp: {
        label: 'WhatsApp',
        icon: MessageCircle,
        href: (v) => (/^https?:\/\//.test(v) ? v : `https://wa.me/${v.replace(/\D/g, '')}`),
    },
};

function absolute(url: string): string {
    return /^(https?:)?\/\//.test(url) ? url : `https://${url}`;
}

export function SocialLinks({ social, className, itemClassName }: { social: SiteChrome['social']; className?: string; itemClassName?: string }) {
    const entries = Object.entries(social).filter(([k, v]) => v && socialMeta[k]);
    if (!entries.length) return null;
    return (
        <ul className={cn('flex flex-wrap items-center gap-2', className)}>
            {entries.map(([key, value]) => {
                const meta = socialMeta[key];
                const Icon = meta.icon;
                const href = key === 'whatsapp' ? meta.href(value as string) : absolute(meta.href(value as string));
                return (
                    <li key={key}>
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={meta.label}
                            title={meta.label}
                            className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none', itemClassName)}
                        >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

/* -------------------------------------------------------------------------- */
/*  Crest / images                                                             */
/* -------------------------------------------------------------------------- */

/** School logo, or a monogram crest built from the initials. */
export function Crest({ site, className, variant = 'shield' }: { site: Pick<SiteChrome, 'name' | 'logo_url'>; className?: string; variant?: 'shield' | 'circle' | 'square' | 'blob' }) {
    const [failed, setFailed] = useState(false);
    if (site.logo_url && !failed) {
        return <img src={site.logo_url} alt={`${site.name} logo`} onError={() => setFailed(true)} className={cn('h-12 w-12 shrink-0 object-contain', className)} />;
    }
    const text = initials(site.name);
    if (variant === 'shield') {
        return (
            <svg viewBox="0 0 48 56" role="img" aria-label={`${site.name} crest`} className={cn('h-12 w-auto shrink-0', className)}>
                <path d="M24 2 44 9v17c0 13.5-8.4 22.6-20 28C12.4 48.6 4 39.5 4 26V9z" fill="var(--site-primary)" />
                <path d="M24 6.5 40 12v14c0 11-6.6 18.6-16 23.4C14.6 44.6 8 37 8 26V12z" fill="none" stroke="var(--site-secondary)" strokeWidth="1.6" />
                <text x="24" y="31" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="15" fill="var(--site-on-primary)">
                    {text}
                </text>
            </svg>
        );
    }
    return (
        <span
            role="img"
            aria-label={`${site.name} logo`}
            className={cn(
                'inline-flex h-12 w-12 shrink-0 items-center justify-center bg-[var(--site-primary)] text-base font-extrabold text-[var(--site-on-primary)]',
                variant === 'circle' && 'rounded-full',
                variant === 'square' && 'rounded-none',
                variant === 'blob' && 'rounded-[42%_58%_55%_45%/50%_45%_55%_50%]',
                className,
            )}
        >
            {text}
        </span>
    );
}

/** Image with a branded gradient placeholder when the URL is missing or broken. */
export function SiteImage({
    src,
    alt,
    className,
    imgClassName,
    label,
    icon,
}: {
    src: string | null | undefined;
    alt: string;
    className?: string;
    imgClassName?: string;
    label?: string | null;
    icon?: ReactNode;
}) {
    const [failed, setFailed] = useState(false);
    if (src && !failed) {
        return (
            <div className={cn('relative overflow-hidden', className)}>
                <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('h-full w-full object-cover', imgClassName)} />
            </div>
        );
    }
    return (
        <div
            role="img"
            aria-label={alt}
            className={cn('relative flex items-center justify-center overflow-hidden', className)}
            style={{
                background:
                    'radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--site-secondary) 55%, transparent), transparent 55%), linear-gradient(135deg, var(--site-primary), color-mix(in srgb, var(--site-primary) 55%, #000))',
            }}
        >
            <svg className="absolute inset-0 h-full w-full opacity-[0.12]" aria-hidden="true">
                <defs>
                    <pattern id="site-dots" width="18" height="18" patternUnits="userSpaceOnUse">
                        <circle cx="2" cy="2" r="1.6" fill="#fff" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#site-dots)" />
            </svg>
            <span className="relative flex flex-col items-center gap-2 text-white/90">
                {icon}
                {label && <span className="text-2xl font-extrabold tracking-wider">{initials(label)}</span>}
            </span>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Motion                                                                     */
/* -------------------------------------------------------------------------- */

export function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const on = () => setReduced(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    return reduced;
}

/** Fades content up when it scrolls into view (disabled for reduced-motion users). */
export function Reveal({ children, className, delay = 0, enabled = true, as: Tag = 'div' }: { children: ReactNode; className?: string; delay?: number; enabled?: boolean; as?: 'div' | 'li' | 'section' }) {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(!enabled);
    useEffect(() => {
        if (!enabled) return;
        const el = ref.current;
        if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
            setShown(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setShown(true);
                    io.disconnect();
                }
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [enabled]);
    return (
        <Tag
            ref={ref as never}
            className={cn(enabled && 'transition-all duration-700 ease-out', enabled && !shown && 'translate-y-6 opacity-0', className)}
            style={enabled ? { transitionDelay: `${delay}ms` } : undefined}
        >
            {children}
        </Tag>
    );
}

/** Counts up to a number once visible. */
export function CountUp({ value, className }: { value: number; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [shown, setShown] = useState(value);
    useEffect(() => {
        const el = ref.current;
        if (!el || value <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
        setShown(0);
        let raf = 0;
        const io = new IntersectionObserver((entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            io.disconnect();
            const start = performance.now();
            const tick = (t: number) => {
                const p = Math.min(1, (t - start) / 1200);
                setShown(Math.round(value * (1 - (1 - p) ** 3)));
                if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        });
        io.observe(el);
        return () => {
            io.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [value]);
    return (
        <span ref={ref} className={className}>
            {shown.toLocaleString('en-US')}
        </span>
    );
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Rich text from the CMS (sanitised server-side). */
export function Prose({ html, className }: { html: string | null | undefined; className?: string }) {
    if (!html) return null;
    return <div className={cn('site-prose', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Flash message from the server (contact form sent, duplicate application…). */
export function FlashBanner({ className }: { className?: string }) {
    const { flash } = usePage();
    const message = (flash as { site_status?: string } | undefined)?.site_status;
    const [dismissed, setDismissed] = useState<string | null>(null);
    if (!message || dismissed === message) return null;
    return (
        <div role="status" className={cn('flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-sm', className)}>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="flex-1 text-sm font-semibold">{message}</p>
            <button type="button" onClick={() => setDismissed(message)} className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none" aria-label="Dismiss">
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

export function PreviewBanner() {
    return (
        <div className="relative z-[60] bg-amber-400 px-4 py-1.5 text-center text-xs font-bold text-amber-950">
            Preview — this website is not published yet. Only signed-in school staff can see it.
        </div>
    );
}

/** Day number + short month badge for events. */
export function dateParts(value: string): { day: string; month: string; time: string | null; weekday: string } {
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return { day: '–', month: '', time: null, weekday: '' };
    const hasTime = value.length > 10 && !/[ T]00:00(:00)?$/.test(value);
    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: d.toLocaleDateString('en-GB', { month: 'short' }),
        weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        time: hasTime ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null,
    };
}

export function telHref(phone: string): string {
    return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

/** Styles shared by every template: prose, focus, keyframes. */
export const SITE_CSS = `
.site-root { -webkit-font-smoothing: antialiased; color: #1e293b; }
.site-root label { margin-bottom: 0; }
.site-root ::selection { background: color-mix(in srgb, var(--site-primary) 25%, transparent); }
.site-root :focus-visible { outline: 2px solid var(--site-primary); outline-offset: 2px; }
.site-prose { line-height: 1.75; font-size: 1.0625rem; color: #334155; }
.site-prose > * + * { margin-top: 1.1em; }
.site-prose h1, .site-prose h2, .site-prose h3, .site-prose h4 { color: #0f172a; font-weight: 800; line-height: 1.25; margin-top: 1.6em; font-family: var(--site-heading-font, inherit); }
.site-prose h1 { font-size: 2rem; } .site-prose h2 { font-size: 1.6rem; } .site-prose h3 { font-size: 1.3rem; } .site-prose h4 { font-size: 1.1rem; }
.site-prose > :first-child { margin-top: 0; }
.site-prose a { color: var(--site-primary); text-decoration: underline; text-underline-offset: 3px; font-weight: 600; }
.site-prose ul { list-style: disc; padding-left: 1.4em; } .site-prose ol { list-style: decimal; padding-left: 1.4em; }
.site-prose li + li { margin-top: .35em; }
.site-prose li::marker { color: var(--site-primary); }
.site-prose img { border-radius: .75rem; max-width: 100%; height: auto; }
.site-prose blockquote { border-left: 4px solid var(--site-secondary); background: color-mix(in srgb, var(--site-secondary) 8%, white); padding: .9em 1.2em; border-radius: 0 .75rem .75rem 0; font-style: italic; color: #1e293b; }
.site-prose table { width: 100%; border-collapse: collapse; font-size: .95rem; display: block; overflow-x: auto; }
.site-prose th, .site-prose td { border: 1px solid #e2e8f0; padding: .5em .75em; text-align: left; }
.site-prose th { background: #f8fafc; }
.site-prose hr { border-color: #e2e8f0; margin: 2em 0; }
.site-prose strong { color: #0f172a; }
@keyframes site-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes site-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
@keyframes site-confetti { 0% { transform: translateY(-20px) rotate(0); opacity: 1 } 100% { transform: translateY(260px) rotate(540deg); opacity: 0 } }
.site-float { animation: site-float 6s ease-in-out infinite; }
.site-pop { animation: site-pop .6s cubic-bezier(.2,.9,.3,1.3) both; }
@media (prefers-reduced-motion: reduce) { .site-float, .site-pop, .site-confetti { animation: none !important; } .site-root * { scroll-behavior: auto !important; } }
@media print { .site-noprint { display: none !important; } .site-root { background: #fff !important; } }
`;
