import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SiteChrome, TemplateKey } from '../_components/types';

/**
 * Per-template design tokens. Shared content components (`_components/*`)
 * read these so the same markup picks up each template's look.
 */
export type Theme = {
    key: TemplateKey;
    defaults: { primary: string; secondary: string };
    /** Root background/text colour. */
    root: string;
    bodyFont: string;
    /** Font family for headings (also exposed as --site-heading-font for prose). */
    headingFont: string;
    heading: string;
    eyebrow: string;
    card: string;
    cardHover: string;
    btn: string;
    btnAlt: string;
    btnSm: string;
    input: string;
    labelCls: string;
    chip: string;
    sectionAlt: string;
    link: string;
    reveal: boolean;
    radius: string;
    imgRadius: string;
};

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2';

export const themes: Record<TemplateKey, Theme> = {
    modern: {
        key: 'modern',
        defaults: { primary: '#4361ee', secondary: '#805dca' },
        root: 'bg-slate-50',
        bodyFont: "'Nunito', ui-sans-serif, system-ui, sans-serif",
        headingFont: "'Nunito', ui-sans-serif, system-ui, sans-serif",
        heading: 'font-extrabold tracking-tight text-slate-900',
        eyebrow:
            'inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--site-primary)_10%,white)] px-3 py-1 text-xs font-bold tracking-wider text-[var(--site-primary)] uppercase',
        card: 'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-16px_rgba(15,23,42,.18)]',
        cardHover: 'transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-20px_color-mix(in_srgb,var(--site-primary)_45%,transparent)]',
        btn: cn(
            'inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] px-6 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-10px_color-mix(in_srgb,var(--site-primary)_70%,transparent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60',
            focus,
        ),
        btnAlt: cn(
            'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-800 transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)] disabled:opacity-60',
            focus,
        ),
        btnSm: 'px-4 py-2 text-xs',
        input: 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[var(--site-primary)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--site-primary)_15%,transparent)] focus:outline-none',
        labelCls: 'mb-1.5 block text-sm font-bold text-slate-700',
        chip: 'rounded-full bg-[color-mix(in_srgb,var(--site-primary)_10%,white)] px-3 py-1 text-xs font-bold text-[var(--site-primary)]',
        sectionAlt: 'bg-white',
        link: 'font-bold text-[var(--site-primary)] hover:underline underline-offset-4',
        reveal: true,
        radius: 'rounded-2xl',
        imgRadius: 'rounded-2xl',
    },
    classic: {
        key: 'classic',
        defaults: { primary: '#1e3a5f', secondary: '#c9a227' },
        root: 'bg-[#fbf9f4] text-slate-800',
        bodyFont: "'Nunito', ui-sans-serif, system-ui, sans-serif",
        headingFont: "Georgia, 'Times New Roman', Times, serif",
        heading: '[font-family:var(--site-heading-font)] font-bold text-[var(--site-primary)]',
        eyebrow: 'inline-flex items-center gap-3 text-xs font-bold tracking-[0.25em] text-[color-mix(in_srgb,var(--site-secondary)_80%,black)] uppercase',
        card: 'rounded-sm border border-[color-mix(in_srgb,var(--site-primary)_14%,white)] bg-white shadow-[0_1px_0_rgba(0,0,0,.03)]',
        cardHover: 'transition duration-300 hover:border-[var(--site-secondary)] hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,.35)]',
        btn: cn(
            'inline-flex items-center justify-center gap-2 rounded-sm border border-[var(--site-primary)] bg-[var(--site-primary)] px-6 py-3 text-sm font-bold tracking-wide text-[var(--site-on-primary)] uppercase transition hover:bg-[color-mix(in_srgb,var(--site-primary)_85%,black)] disabled:opacity-60',
            focus,
        ),
        btnAlt: cn(
            'inline-flex items-center justify-center gap-2 rounded-sm border border-[var(--site-secondary)] bg-transparent px-6 py-3 text-sm font-bold tracking-wide text-[color-mix(in_srgb,var(--site-secondary)_70%,black)] uppercase transition hover:bg-[var(--site-secondary)] hover:text-[var(--site-on-secondary)] disabled:opacity-60',
            focus,
        ),
        btnSm: 'px-4 py-2 text-[11px]',
        input: 'w-full rounded-sm border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-[var(--site-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--site-secondary)_35%,transparent)] focus:outline-none',
        labelCls: 'mb-1.5 block text-xs font-bold tracking-wider text-slate-600 uppercase',
        chip: 'rounded-sm border border-[color-mix(in_srgb,var(--site-secondary)_60%,white)] bg-[color-mix(in_srgb,var(--site-secondary)_10%,white)] px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-[color-mix(in_srgb,var(--site-secondary)_55%,black)] uppercase',
        sectionAlt: 'bg-white',
        link: 'font-bold text-[var(--site-primary)] underline decoration-[var(--site-secondary)] decoration-2 underline-offset-4 hover:decoration-[var(--site-primary)]',
        reveal: false,
        radius: 'rounded-sm',
        imgRadius: 'rounded-sm',
    },
    minimal: {
        key: 'minimal',
        defaults: { primary: '#0f766e', secondary: '#334155' },
        root: 'bg-white text-neutral-800',
        bodyFont: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        headingFont: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        heading: 'font-semibold tracking-[-0.03em] text-neutral-950',
        eyebrow: 'inline-flex items-center gap-3 text-xs font-medium tracking-[0.2em] text-neutral-500 uppercase',
        card: 'border border-neutral-200 bg-white',
        cardHover: 'transition duration-300 hover:border-neutral-900',
        btn: cn(
            'inline-flex items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-[var(--site-primary)] hover:text-[var(--site-on-primary)] disabled:opacity-60',
            focus,
        ),
        btnAlt: cn(
            'inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-950 disabled:opacity-60',
            focus,
        ),
        btnSm: 'px-4 py-2 text-xs',
        input: 'w-full border-0 border-b border-neutral-300 bg-transparent px-0 py-2.5 text-base text-neutral-950 transition placeholder:text-neutral-400 focus:border-[var(--site-primary)] focus:ring-0 focus:outline-none',
        labelCls: 'mb-1 block text-xs font-medium tracking-[0.12em] text-neutral-500 uppercase',
        chip: 'border border-neutral-300 px-2.5 py-0.5 text-[11px] font-medium tracking-wider text-neutral-600 uppercase',
        sectionAlt: 'bg-neutral-50',
        link: 'font-medium text-neutral-950 underline decoration-[var(--site-primary)] decoration-2 underline-offset-[6px] hover:text-[var(--site-primary)]',
        reveal: false,
        radius: 'rounded-none',
        imgRadius: 'rounded-none',
    },
    playful: {
        key: 'playful',
        defaults: { primary: '#f97316', secondary: '#0ea5e9' },
        root: 'bg-[#fffaf3] text-slate-800',
        bodyFont: "'Nunito', ui-rounded, ui-sans-serif, system-ui, sans-serif",
        headingFont: "'Nunito', ui-rounded, ui-sans-serif, system-ui, sans-serif",
        heading: 'font-black tracking-tight text-slate-900',
        eyebrow:
            'inline-flex -rotate-1 items-center gap-2 rounded-full bg-[var(--site-secondary)] px-4 py-1.5 text-xs font-black tracking-wide text-[var(--site-on-secondary)] uppercase shadow-[0_4px_0_color-mix(in_srgb,var(--site-secondary)_60%,black)]',
        card: 'rounded-[1.75rem] border-[3px] border-slate-900/90 bg-white shadow-[6px_6px_0_rgba(15,23,42,.9)]',
        cardHover: 'transition duration-200 hover:-translate-y-1 hover:-rotate-[0.6deg] hover:shadow-[9px_9px_0_rgba(15,23,42,.9)]',
        btn: cn(
            'inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-slate-900 bg-[var(--site-primary)] px-7 py-3 text-base font-black text-[var(--site-on-primary)] shadow-[0_5px_0_rgba(15,23,42,.9)] transition active:translate-y-1 active:shadow-[0_1px_0_rgba(15,23,42,.9)] hover:-translate-y-0.5 disabled:opacity-60',
            focus,
        ),
        btnAlt: cn(
            'inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-slate-900 bg-white px-7 py-3 text-base font-black text-slate-900 shadow-[0_5px_0_rgba(15,23,42,.9)] transition active:translate-y-1 active:shadow-[0_1px_0_rgba(15,23,42,.9)] hover:-translate-y-0.5 disabled:opacity-60',
            focus,
        ),
        btnSm: 'px-4 py-2 text-sm',
        input: 'w-full rounded-2xl border-[3px] border-slate-200 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 transition placeholder:font-normal placeholder:text-slate-400 focus:border-[var(--site-primary)] focus:ring-0 focus:outline-none',
        labelCls: 'mb-1.5 block text-sm font-black text-slate-800',
        chip: 'rounded-full border-2 border-slate-900 bg-[color-mix(in_srgb,var(--site-secondary)_20%,white)] px-3 py-0.5 text-xs font-black text-slate-900',
        sectionAlt: 'bg-[color-mix(in_srgb,var(--site-secondary)_8%,white)]',
        link: 'font-black text-[var(--site-primary)] underline decoration-wavy decoration-2 underline-offset-4',
        reveal: true,
        radius: 'rounded-[1.75rem]',
        imgRadius: 'rounded-[2rem]',
    },
};

const ThemeContext = createContext<Theme>(themes.modern);
const SiteContext = createContext<SiteChrome | null>(null);

export function ThemeProvider({ site, children }: { site: SiteChrome; children: ReactNode }) {
    const theme = themes[site.template] ?? themes.modern;
    return (
        <SiteContext.Provider value={site}>
            <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
        </SiteContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
export function useSite(): SiteChrome {
    const site = useContext(SiteContext);
    if (!site) throw new Error('useSite must be used inside SiteLayout');
    return site;
}

/* -------------------------------------------------------------------------- */
/*  Section scaffolding                                                         */
/* -------------------------------------------------------------------------- */

export function Container({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
    return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', narrow ? 'max-w-4xl' : 'max-w-7xl', className)}>{children}</div>;
}

export function Section({ children, alt, className, id, narrow, label }: { children: ReactNode; alt?: boolean; className?: string; id?: string; narrow?: boolean; label?: string }) {
    const t = useTheme();
    const pad = t.key === 'minimal' ? 'py-20 sm:py-28' : t.key === 'classic' ? 'py-16 sm:py-20' : 'py-16 sm:py-24';
    return (
        <section id={id} aria-label={label} className={cn('relative', pad, alt && t.sectionAlt, className)}>
            <Container narrow={narrow}>{children}</Container>
        </section>
    );
}

/** Section title in the template's style. */
export function SectionHeading({
    eyebrow,
    title,
    intro,
    align = 'center',
    className,
    action,
}: {
    eyebrow?: string;
    title: string;
    intro?: string | null;
    align?: 'center' | 'left';
    className?: string;
    action?: ReactNode;
}) {
    const t = useTheme();
    const center = align === 'center';
    return (
        <div className={cn('mb-10 flex flex-col gap-4 sm:mb-14', center ? 'items-center text-center' : 'items-start sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className={cn(center && 'mx-auto max-w-2xl')}>
                {eyebrow && t.key === 'classic' && (
                    <p className={t.eyebrow}>
                        <span className="h-px w-8 bg-[var(--site-secondary)]" aria-hidden="true" />
                        {eyebrow}
                        <span className="h-px w-8 bg-[var(--site-secondary)]" aria-hidden="true" />
                    </p>
                )}
                {eyebrow && t.key === 'minimal' && (
                    <p className={t.eyebrow}>
                        <span className="h-px w-10 bg-[var(--site-primary)]" aria-hidden="true" />
                        {eyebrow}
                    </p>
                )}
                {eyebrow && (t.key === 'modern' || t.key === 'playful') && <p className={t.eyebrow}>{eyebrow}</p>}
                <h2
                    className={cn(
                        t.heading,
                        'mt-3',
                        t.key === 'minimal' ? 'text-3xl sm:text-5xl' : t.key === 'classic' ? 'text-3xl sm:text-4xl' : 'text-3xl sm:text-4xl lg:text-[2.75rem]',
                    )}
                >
                    {title}
                </h2>
                {t.key === 'classic' && (
                    <div className={cn('mt-4 flex items-center gap-2', center && 'justify-center')} aria-hidden="true">
                        <span className="h-px w-12 bg-[color-mix(in_srgb,var(--site-primary)_30%,white)]" />
                        <span className="h-2 w-2 rotate-45 bg-[var(--site-secondary)]" />
                        <span className="h-px w-12 bg-[color-mix(in_srgb,var(--site-primary)_30%,white)]" />
                    </div>
                )}
                {t.key === 'playful' && (
                    <svg viewBox="0 0 120 12" className={cn('mt-3 h-3 w-28 text-[var(--site-primary)]', center && 'mx-auto')} aria-hidden="true">
                        <path d="M2 8c10-8 18 6 28 0s18-8 28 0 18 6 28 0 18-8 30 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                )}
                {intro && <p className={cn('mt-4 text-base leading-relaxed text-slate-600 sm:text-lg', t.key === 'minimal' && 'text-neutral-500')}>{intro}</p>}
            </div>
            {action}
        </div>
    );
}
