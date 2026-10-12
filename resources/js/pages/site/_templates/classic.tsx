import { Link } from '@inertiajs/react';
import { ArrowRight, Clock, Mail, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ContactDetails, EventsNoticesSection, FaqSection, GallerySection, LeaderMessage, MissionVision, NewsSection, statItems, StatNumber, TestimonialsSection } from '../_components/blocks';
import type { HomeData, SiteChrome } from '../_components/types';
import { Crest, HighlightIcon, SiteImage, SocialLinks, telHref } from '../_components/ui';
import { BrandingCredit, isActive, MenuButton, MobileNav, quickLinks, useCurrentPath, useMenu } from './shell';
import { Container, Section, SectionHeading, themes } from './theme';

const t = themes.classic;
const serif = '[font-family:var(--site-heading-font)]';

function Ornament({ className, light }: { className?: string; light?: boolean }) {
    return (
        <div className={cn('flex items-center justify-center gap-3', className)} aria-hidden="true">
            <span className={cn('h-px w-16', light ? 'bg-white/40' : 'bg-[color-mix(in_srgb,var(--site-primary)_30%,white)]')} />
            <span className="h-1.5 w-1.5 rotate-45 bg-[var(--site-secondary)]" />
            <span className="h-2.5 w-2.5 rotate-45 border border-[var(--site-secondary)]" />
            <span className="h-1.5 w-1.5 rotate-45 bg-[var(--site-secondary)]" />
            <span className={cn('h-px w-16', light ? 'bg-white/40' : 'bg-[color-mix(in_srgb,var(--site-primary)_30%,white)]')} />
        </div>
    );
}

export function ClassicLayout({ site, children }: { site: SiteChrome; children: ReactNode }) {
    const path = useCurrentPath();
    const menu = useMenu();
    const c = site.contact;

    return (
        <>
            {/* Top contact bar */}
            <div className="site-noprint bg-[color-mix(in_srgb,var(--site-primary)_85%,black)] text-xs text-white/85">
                <Container className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1.5">
                    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        {c.phone && (
                            <li>
                                <a href={telHref(c.phone)} className="inline-flex items-center gap-1.5 hover:text-white">
                                    <Phone className="h-3.5 w-3.5 text-[var(--site-secondary)]" aria-hidden="true" /> {c.phone}
                                </a>
                            </li>
                        )}
                        {c.email && (
                            <li className="hidden sm:block">
                                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-white">
                                    <Mail className="h-3.5 w-3.5 text-[var(--site-secondary)]" aria-hidden="true" /> {c.email}
                                </a>
                            </li>
                        )}
                        {c.office_hours && (
                            <li className="hidden md:inline-flex md:items-center md:gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-[var(--site-secondary)]" aria-hidden="true" /> {c.office_hours}
                            </li>
                        )}
                    </ul>
                    <SocialLinks social={site.social} className="gap-1" itemClassName="h-7 w-7 text-white/80 hover:text-[var(--site-secondary)] focus-visible:ring-white" />
                </Container>
            </div>

            {/* Crest header */}
            <header className="site-noprint border-b-4 border-[var(--site-secondary)] bg-white">
                <Container className="flex items-center justify-between gap-4 py-5 lg:flex-col lg:justify-center lg:py-7">
                    <Link href={site.base} className="flex min-w-0 items-center gap-4 lg:flex-col lg:gap-3 lg:text-center">
                        <Crest site={site} variant="shield" className="h-14 w-auto lg:h-20" />
                        <span className="min-w-0">
                            <span className={cn(serif, 'block truncate text-lg leading-tight font-bold text-[var(--site-primary)] sm:text-2xl lg:text-3xl')}>{site.name}</span>
                            {site.motto && <span className="mt-1 block truncate text-[11px] font-bold tracking-[0.3em] text-[color-mix(in_srgb,var(--site-secondary)_70%,black)] uppercase sm:text-xs">{site.motto}</span>}
                        </span>
                    </Link>
                    <MenuButton open={menu.open} onClick={() => menu.setOpen(true)} className="text-[var(--site-primary)] hover:bg-slate-100" />
                </Container>
                <nav aria-label="Main" className="hidden border-t border-slate-200 lg:block">
                    <Container className="flex items-center justify-center gap-1">
                        <ul className="flex flex-wrap items-center justify-center">
                            {site.nav.map((item) => {
                                const active = isActive(item, path, site.base);
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            aria-current={active ? 'page' : undefined}
                                            className={cn(
                                                'relative block px-4 py-3.5 text-[13px] font-bold tracking-[0.12em] uppercase transition',
                                                active ? 'text-[var(--site-primary)]' : 'text-slate-600 hover:text-[var(--site-primary)]',
                                                'after:absolute after:inset-x-4 after:bottom-0 after:h-[3px] after:origin-center after:bg-[var(--site-secondary)] after:transition-transform after:content-[""]',
                                                active ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100',
                                            )}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                        {site.admissions_open && (
                            <Link href={`${site.base}/admissions`} className={cn(t.btn, 'ml-4 px-4 py-2 text-xs')}>
                                Apply now
                            </Link>
                        )}
                    </Container>
                </nav>
            </header>
            <MobileNav
                site={site}
                open={menu.open}
                onClose={menu.close}
                panelClassName="rounded-none border-l-4 border-[var(--site-secondary)]"
                itemClassName={cn('rounded-none border-b border-slate-100 text-sm tracking-wider uppercase', serif)}
                activeClassName="text-[var(--site-primary)] bg-[color-mix(in_srgb,var(--site-secondary)_12%,white)]"
                cta={
                    site.admissions_open && (
                        <Link href={`${site.base}/admissions`} className={cn(t.btn, 'w-full')}>
                            Apply now
                        </Link>
                    )
                }
            />

            <main id="main" className="flex-1">
                {children}
            </main>

            <footer className="site-noprint border-t-4 border-[var(--site-secondary)] bg-[var(--site-primary)] text-[color-mix(in_srgb,var(--site-on-primary)_80%,transparent)]">
                <Container className="py-14">
                    <div className="flex flex-col items-center text-center">
                        <Crest site={site} variant="shield" className="h-16 w-auto" />
                        <p className={cn(serif, 'mt-4 text-2xl font-bold text-[var(--site-on-primary)]')}>{site.name}</p>
                        {site.motto && <p className="mt-1 text-xs font-bold tracking-[0.3em] text-[var(--site-secondary)] uppercase">{site.motto}</p>}
                        <Ornament light className="mt-6" />
                    </div>
                    <div className="mt-10 grid gap-10 md:grid-cols-3">
                        <div>
                            <p className={cn(serif, 'text-lg font-bold text-[var(--site-on-primary)]')}>Visit us</p>
                            <ContactDetails site={site} tone="dark" className="mt-4" />
                        </div>
                        <div>
                            <p className={cn(serif, 'text-lg font-bold text-[var(--site-on-primary)]')}>Quick links</p>
                            <ul className="mt-4 space-y-2">
                                {quickLinks(site).map((n) => (
                                    <li key={n.href}>
                                        <Link href={n.href} className="text-sm hover:text-[var(--site-secondary)] hover:underline">
                                            {n.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className={cn(serif, 'text-lg font-bold text-[var(--site-on-primary)]')}>Stay connected</p>
                            {site.tagline && <p className="mt-4 text-sm leading-relaxed">{site.tagline}</p>}
                            <SocialLinks social={site.social} className="mt-4" itemClassName="border border-white/25 text-white hover:border-[var(--site-secondary)] hover:text-[var(--site-secondary)] focus-visible:ring-white" />
                        </div>
                    </div>
                </Container>
                <div className="border-t border-white/10 bg-black/15">
                    <Container className="flex flex-col items-center justify-between gap-2 py-4 text-xs sm:flex-row">
                        <p>
                            © {site.year} {site.name}. All rights reserved.
                        </p>
                        <BrandingCredit site={site} className="opacity-80" />
                    </Container>
                </div>
            </footer>
        </>
    );
}

export function ClassicPageHeader({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string | null; eyebrow?: string; children?: ReactNode }) {
    return (
        <section className="relative overflow-hidden bg-[var(--site-primary)] text-[var(--site-on-primary)]">
            <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
                <defs>
                    <pattern id="classic-diamond" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#classic-diamond)" />
            </svg>
            <Container className="relative py-14 text-center sm:py-16">
                {eyebrow && <p className="text-xs font-bold tracking-[0.3em] text-[var(--site-secondary)] uppercase">{eyebrow}</p>}
                <h1 className={cn(serif, 'mt-3 text-4xl font-bold sm:text-5xl')}>{title}</h1>
                <Ornament light className="mt-5" />
                {subtitle && <p className="mx-auto mt-5 max-w-2xl text-lg opacity-85">{subtitle}</p>}
                {children}
            </Container>
        </section>
    );
}

export function ClassicHome({ site, home }: { site: SiteChrome; home: HomeData }) {
    const stats = statItems(home.stats);
    return (
        <>
            {/* Hero */}
            <section className="relative isolate overflow-hidden bg-[var(--site-primary)] text-white">
                {home.hero.image_url && <img src={home.hero.image_url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />}
                <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--site-primary)_70%,transparent),color-mix(in_srgb,var(--site-primary)_95%,black))]" aria-hidden="true" />
                <Container className="py-20 sm:py-28">
                    <div className="mx-auto max-w-3xl border border-[color-mix(in_srgb,var(--site-secondary)_60%,transparent)] p-2">
                        <div className="border border-[color-mix(in_srgb,var(--site-secondary)_35%,transparent)] px-6 py-12 text-center sm:px-12">
                            {site.tagline && <p className="text-xs font-bold tracking-[0.3em] text-[var(--site-secondary)] uppercase">{site.tagline}</p>}
                            <h1 className={cn(serif, 'mt-4 text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl')}>{home.hero.title}</h1>
                            <Ornament light className="mt-6" />
                            {home.hero.subtitle && <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/85">{home.hero.subtitle}</p>}
                            <div className="mt-9 flex flex-wrap justify-center gap-3">
                                {site.admissions_open && (
                                    <Link
                                        href={`${site.base}/admissions`}
                                        className="inline-flex items-center gap-2 rounded-sm bg-[var(--site-secondary)] px-7 py-3.5 text-sm font-bold tracking-wider text-[var(--site-on-secondary)] uppercase transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                                    >
                                        Apply now
                                    </Link>
                                )}
                                <Link
                                    href={`${site.base}/about`}
                                    className="inline-flex items-center gap-2 rounded-sm border border-white/60 px-7 py-3.5 text-sm font-bold tracking-wider text-white uppercase transition hover:bg-white hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                                >
                                    Learn more
                                </Link>
                            </div>
                        </div>
                    </div>
                </Container>
            </section>

            {/* Stats */}
            {stats.length > 0 && (
                <section aria-label="School in numbers" className="border-b border-[color-mix(in_srgb,var(--site-secondary)_40%,white)] bg-white">
                    <Container>
                        <dl className="grid grid-cols-2 divide-[color-mix(in_srgb,var(--site-primary)_12%,white)] sm:flex sm:divide-x">
                            {stats.map((s) => (
                                <div key={s.label} className="flex-1 px-4 py-8 text-center">
                                    <dd className={cn(serif, 'text-4xl font-bold text-[var(--site-primary)]')}>
                                        <StatNumber value={s.value} />
                                    </dd>
                                    <dt className="mt-2 text-[11px] font-bold tracking-[0.2em] text-[color-mix(in_srgb,var(--site-secondary)_65%,black)] uppercase">{s.label}</dt>
                                </div>
                            ))}
                        </dl>
                    </Container>
                </section>
            )}

            {/* Welcome */}
            {(home.about.excerpt || home.mission || home.vision || home.values.length > 0) && (
                <Section label="Welcome">
                    {home.about.excerpt && (
                        <div className="mb-16 grid items-center gap-12 lg:grid-cols-2">
                            <div className="relative p-3">
                                <div className="absolute inset-0 border-2 border-[var(--site-secondary)]" aria-hidden="true" />
                                <div className="absolute top-6 left-6 -z-0 h-full w-full bg-[color-mix(in_srgb,var(--site-primary)_8%,white)]" aria-hidden="true" />
                                <SiteImage src={home.about.image_url} alt={`About ${site.name}`} label={site.name} className="relative aspect-[4/3] w-full" />
                            </div>
                            <div>
                                <SectionHeading eyebrow="Welcome" title={home.about.title || `About ${site.name}`} align="left" className="mb-6 sm:mb-6" />
                                <p className="text-lg leading-relaxed text-slate-700 first-letter:float-left first-letter:mr-2 first-letter:text-6xl first-letter:leading-[0.9] first-letter:font-bold first-letter:text-[var(--site-primary)] first-letter:[font-family:var(--site-heading-font)]">
                                    {home.about.excerpt}
                                </p>
                                <Link href={`${site.base}/about`} className={cn(t.btnAlt, 'mt-8')}>
                                    Read our history
                                </Link>
                            </div>
                        </div>
                    )}
                    <MissionVision mission={home.mission} vision={home.vision} values={home.values} />
                </Section>
            )}

            {home.highlights.length > 0 && (
                <Section alt label="Distinctions">
                    <SectionHeading eyebrow="Distinctions" title="A tradition of excellence" />
                    <div className={cn('grid gap-6 sm:grid-cols-2', home.highlights.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
                        {home.highlights.map((h, i) => (
                            <div key={i} className={cn('border-t-4 border-t-[var(--site-secondary)] p-7 text-center', t.card, t.cardHover)}>
                                <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--site-secondary)] text-[var(--site-primary)]">
                                    <HighlightIcon name={h.icon} className="h-7 w-7" />
                                </span>
                                <h3 className={cn(serif, 'mt-5 text-xl font-bold text-[var(--site-primary)]')}>{h.title}</h3>
                                {h.text && <p className="mt-3 text-sm leading-relaxed text-slate-600">{h.text}</p>}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {home.leader && (
                <Section label="Message from the head">
                    <SectionHeading eyebrow="From the Head's desk" title="A message of welcome" />
                    <LeaderMessage leader={home.leader} />
                </Section>
            )}

            <NewsSection posts={home.news} alt />
            <EventsNoticesSection events={home.events} notices={home.notices} />
            <GallerySection images={home.gallery} alt />
            <TestimonialsSection items={home.testimonials} />
            <FaqSection faqs={home.faqs} alt />

            <ClassicCta site={site} />
        </>
    );
}

export function ClassicCta({ site }: { site: SiteChrome }) {
    return (
        <section aria-label="Admissions" className="relative overflow-hidden bg-[color-mix(in_srgb,var(--site-primary)_90%,black)] text-white">
            <Container className="relative py-16 text-center">
                <p className="text-xs font-bold tracking-[0.3em] text-[var(--site-secondary)] uppercase">{site.admissions_open ? `Admissions ${site.year}` : 'Visit us'}</p>
                <h2 className={cn(serif, 'mx-auto mt-3 max-w-2xl text-3xl font-bold sm:text-4xl')}>
                    {site.admissions_open ? 'Begin your journey with us' : 'Come and see our school'}
                </h2>
                <Ornament light className="mt-5" />
                <p className="mx-auto mt-5 max-w-xl text-white/80">
                    {site.admissions_open ? 'Online applications are now being accepted. Our admissions office will be pleased to guide you.' : 'Our office will be pleased to arrange a visit and answer your questions.'}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                    {site.admissions_open && (
                        <Link href={`${site.base}/admissions`} className="inline-flex items-center gap-2 rounded-sm bg-[var(--site-secondary)] px-7 py-3.5 text-sm font-bold tracking-wider text-[var(--site-on-secondary)] uppercase transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                            Apply online <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    )}
                    <Link href={`${site.base}/contact`} className="inline-flex items-center gap-2 rounded-sm border border-white/60 px-7 py-3.5 text-sm font-bold tracking-wider uppercase transition hover:bg-white hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                        Contact the office
                    </Link>
                </div>
            </Container>
        </section>
    );
}
