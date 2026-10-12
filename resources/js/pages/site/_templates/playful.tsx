import { Link } from '@inertiajs/react';
import { ArrowRight, Pencil } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ContactDetails, EventsNoticesSection, FaqSection, GallerySection, LeaderMessage, MissionVision, NewsSection, statItems, StatNumber, TestimonialsSection } from '../_components/blocks';
import type { HomeData, SiteChrome } from '../_components/types';
import { Crest, HighlightIcon, Reveal, SiteImage, SocialLinks } from '../_components/ui';
import { BrandingCredit, isActive, MenuButton, MobileNav, quickLinks, useCurrentPath, useMenu } from './shell';
import { Container, Section, SectionHeading, themes } from './theme';

const t = themes.playful;

/** Bright accent rotation used alongside the school colours. */
export const playfulPalette = ['var(--site-primary)', 'var(--site-secondary)', '#facc15', '#22c55e', '#ec4899', '#8b5cf6'];

export function Wave({ className, fill = 'currentColor', flip }: { className?: string; fill?: string; flip?: boolean }) {
    return (
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className={cn('block h-10 w-full sm:h-16', flip && 'rotate-180', className)} aria-hidden="true">
            <path d="M0 45c120 30 240 45 360 30S600 15 720 15s240 30 360 45 240 15 360-15v45H0z" fill={fill} />
        </svg>
    );
}

/** Decorative shapes: sun, cloud, stars and squiggles — pure SVG, no emoji. */
function Doodles({ className }: { className?: string }) {
    return (
        <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
            <svg className="site-float absolute top-10 left-[6%] h-16 w-16 text-[#facc15]" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="13" fill="currentColor" />
                {Array.from({ length: 8 }).map((_, i) => (
                    <rect key={i} x="30" y="4" width="4" height="10" rx="2" fill="currentColor" transform={`rotate(${i * 45} 32 32)`} />
                ))}
            </svg>
            <svg className="absolute top-24 right-[10%] h-12 w-24 text-white" viewBox="0 0 96 48">
                <path d="M24 44h52a16 16 0 0 0 0-32 22 22 0 0 0-41-2A17 17 0 0 0 24 44z" fill="currentColor" opacity=".9" />
            </svg>
            <svg className="site-float absolute bottom-24 left-[12%] h-8 w-8 text-[#ec4899]" style={{ animationDelay: '1.5s' }} viewBox="0 0 24 24">
                <path d="m12 2 2.9 6.9L22 9.6l-5.4 4.7L18.2 22 12 18.3 5.8 22l1.6-7.7L2 9.6l7.1-.7z" fill="currentColor" />
            </svg>
            <svg className="absolute right-[18%] bottom-16 h-6 w-6 text-[#22c55e]" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="4" />
            </svg>
            <svg className="absolute top-1/2 left-[45%] h-6 w-16 text-white/70" viewBox="0 0 64 16">
                <path d="M2 8c6-6 10 6 16 0s10-6 16 0 10 6 16 0 8-4 12 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
        </div>
    );
}

export function PlayfulLayout({ site, children }: { site: SiteChrome; children: ReactNode }) {
    const path = useCurrentPath();
    const menu = useMenu();

    return (
        <>
            <header className="site-noprint sticky top-0 z-50 px-3 pt-3 sm:px-5">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-full border-[3px] border-slate-900 bg-white py-2 pr-2 pl-3 shadow-[0_5px_0_rgba(15,23,42,.9)] sm:pl-4">
                    <Link href={site.base} className="flex min-w-0 items-center gap-2.5 rounded-full">
                        <Crest site={site} variant="blob" className="h-11 w-11 border-2 border-slate-900" />
                        <span className="min-w-0">
                            <span className="block truncate text-base leading-tight font-black text-slate-900">{site.name}</span>
                            {site.motto && <span className="block truncate text-xs font-bold text-[var(--site-primary)]">{site.motto}</span>}
                        </span>
                    </Link>
                    <nav aria-label="Main" className="hidden lg:block">
                        <ul className="flex items-center gap-1">
                            {site.nav.map((item, i) => {
                                const active = isActive(item, path, site.base);
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            aria-current={active ? 'page' : undefined}
                                            style={{ '--c': playfulPalette[i % playfulPalette.length] } as CSSProperties}
                                            className={cn(
                                                'block rounded-full px-3 py-2 text-sm font-black whitespace-nowrap transition xl:px-3.5',
                                                active ? 'bg-[var(--c)] text-white [text-shadow:0_1px_0_rgba(0,0,0,.35)]' : 'text-slate-700 hover:bg-[color-mix(in_srgb,var(--c)_18%,white)]',
                                            )}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                    <div className="flex items-center gap-1.5">
                        {site.admissions_open && (
                            <Link href={`${site.base}/admissions`} className={cn(t.btn, 'hidden px-5 py-2 text-sm shadow-[0_3px_0_rgba(15,23,42,.9)] sm:inline-flex')}>
                                Apply now
                            </Link>
                        )}
                        <MenuButton open={menu.open} onClick={() => menu.setOpen(true)} className="rounded-full border-2 border-slate-900 text-slate-900" />
                    </div>
                </div>
            </header>
            <MobileNav
                site={site}
                open={menu.open}
                onClose={menu.close}
                panelClassName="rounded-l-[2rem] border-l-[3px] border-slate-900"
                itemClassName="rounded-2xl font-black"
                activeClassName="bg-[var(--site-primary)] text-[var(--site-on-primary)]"
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

            <footer className="site-noprint relative mt-10 text-white">
                <Wave fill="var(--site-secondary)" className="text-[var(--site-secondary)]" />
                <div className="bg-[var(--site-secondary)] text-[var(--site-on-secondary)]">
                    <Container className="pt-6 pb-10">
                        <div className="grid gap-10 md:grid-cols-3">
                            <div>
                                <div className="flex items-center gap-3">
                                    <Crest site={site} variant="blob" className="h-14 w-14 border-[3px] border-slate-900" />
                                    <p className="text-xl font-black">{site.name}</p>
                                </div>
                                {site.tagline && <p className="mt-4 font-semibold opacity-90">{site.tagline}</p>}
                                <SocialLinks social={site.social} className="mt-5" itemClassName="border-2 border-slate-900 bg-white text-slate-900 shadow-[0_3px_0_rgba(15,23,42,.9)] hover:-translate-y-0.5" />
                            </div>
                            <div>
                                <p className="text-lg font-black">Explore</p>
                                <ul className="mt-4 grid grid-cols-2 gap-2">
                                    {quickLinks(site).map((n) => (
                                        <li key={n.href}>
                                            <Link href={n.href} className="font-bold opacity-90 hover:underline hover:decoration-wavy hover:opacity-100">
                                                {n.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-[1.75rem] border-[3px] border-slate-900 bg-white p-5 text-slate-800 shadow-[6px_6px_0_rgba(15,23,42,.9)]">
                                <p className="text-lg font-black text-slate-900">Say hello!</p>
                                <ContactDetails site={site} className="mt-4" />
                            </div>
                        </div>
                        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t-2 border-dashed border-current/30 pt-5 text-sm font-bold opacity-90 sm:flex-row">
                            <p>
                                © {site.year} {site.name}
                            </p>
                            <BrandingCredit site={site} />
                        </div>
                    </Container>
                </div>
            </footer>
        </>
    );
}

export function PlayfulPageHeader({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string | null; eyebrow?: string; children?: ReactNode }) {
    return (
        <section className="relative -mt-[76px] overflow-hidden bg-[var(--site-primary)] pt-[76px] text-[var(--site-on-primary)]">
            <Doodles />
            <Container className="relative py-14 text-center sm:py-20">
                {eyebrow && <p className="inline-flex -rotate-2 rounded-full border-[3px] border-slate-900 bg-white px-4 py-1 text-sm font-black text-slate-900 shadow-[0_4px_0_rgba(15,23,42,.9)]">{eyebrow}</p>}
                <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">{title}</h1>
                {subtitle && <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold opacity-90">{subtitle}</p>}
                {children}
            </Container>
            <Wave fill="#fffaf3" className="-mb-px" />
        </section>
    );
}

export function PlayfulHome({ site, home }: { site: SiteChrome; home: HomeData }) {
    const stats = statItems(home.stats);
    return (
        <>
            {/* Hero */}
            <section className="relative -mt-[76px] overflow-hidden bg-[var(--site-primary)] pt-[76px] text-[var(--site-on-primary)]">
                <Doodles />
                <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2">
                    <Reveal>
                        {site.tagline && (
                            <p className="inline-flex -rotate-2 items-center gap-2 rounded-full border-[3px] border-slate-900 bg-white px-4 py-1.5 text-sm font-black text-slate-900 shadow-[0_4px_0_rgba(15,23,42,.9)]">
                                <Pencil className="h-4 w-4 text-[var(--site-primary)]" aria-hidden="true" /> {site.tagline}
                            </p>
                        )}
                        <h1 className="mt-6 text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl">{home.hero.title}</h1>
                        {home.hero.subtitle && <p className="mt-5 max-w-xl text-lg leading-relaxed font-semibold opacity-90">{home.hero.subtitle}</p>}
                        <div className="mt-8 flex flex-wrap gap-4">
                            {site.admissions_open && (
                                <Link href={`${site.base}/admissions`} className={cn(t.btnAlt)}>
                                    Apply now <ArrowRight className="h-5 w-5" aria-hidden="true" />
                                </Link>
                            )}
                            <Link href={`${site.base}/about`} className="inline-flex items-center justify-center gap-2 rounded-full border-[3px] border-slate-900 bg-[#facc15] px-7 py-3 text-base font-black text-slate-900 shadow-[0_5px_0_rgba(15,23,42,.9)] transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none active:translate-y-1 active:shadow-[0_1px_0_rgba(15,23,42,.9)]">
                                Learn more
                            </Link>
                        </div>
                    </Reveal>
                    <Reveal delay={150} className="relative mx-auto w-full max-w-md">
                        <div className="absolute -inset-4 rounded-[58%_42%_47%_53%/45%_52%_48%_55%] bg-[#facc15]" aria-hidden="true" />
                        <div className="absolute -inset-1 translate-x-4 translate-y-4 rounded-[42%_58%_55%_45%/50%_45%_55%_50%] bg-[var(--site-secondary)]" aria-hidden="true" />
                        <SiteImage
                            src={home.hero.image_url ?? home.about.image_url}
                            alt={`Learners at ${site.name}`}
                            label={site.name}
                            className="relative aspect-square w-full rounded-[42%_58%_55%_45%/50%_45%_55%_50%] border-[4px] border-slate-900"
                        />
                    </Reveal>
                </Container>
                <Wave fill="#fffaf3" className="-mb-px" />
            </section>

            {/* Stats bubbles */}
            {stats.length > 0 && (
                <section aria-label="School in numbers" className="py-10">
                    <Container>
                        <dl className="flex flex-wrap justify-center gap-5 sm:gap-8">
                            {stats.map((s, i) => (
                                <Reveal key={s.label} delay={i * 80}>
                                    <div
                                        className={cn('flex h-32 w-32 flex-col items-center justify-center rounded-full border-[3px] border-slate-900 text-center shadow-[5px_5px_0_rgba(15,23,42,.9)] sm:h-36 sm:w-36', i % 2 ? 'rotate-3' : '-rotate-3')}
                                        style={{ background: `color-mix(in srgb, ${playfulPalette[i % playfulPalette.length]} 22%, white)` }}
                                    >
                                        <dd className="text-3xl font-black text-slate-900 sm:text-4xl">
                                            <StatNumber value={s.value} />
                                        </dd>
                                        <dt className="mt-1 px-2 text-xs font-black text-slate-700">{s.label}</dt>
                                    </div>
                                </Reveal>
                            ))}
                        </dl>
                    </Container>
                </section>
            )}

            {(home.about.excerpt || home.mission || home.vision || home.values.length > 0) && (
                <Section label="About us">
                    {home.about.excerpt && (
                        <div className="mb-16 grid items-center gap-12 lg:grid-cols-2">
                            <Reveal className="relative order-2 lg:order-1">
                                <div className="absolute -top-4 -left-4 h-24 w-24 rounded-full bg-[#22c55e]" aria-hidden="true" />
                                <div className="absolute -right-3 -bottom-3 h-20 w-20 rounded-3xl bg-[#ec4899]" aria-hidden="true" />
                                <SiteImage src={home.about.image_url} alt={`About ${site.name}`} label={site.name} className="relative aspect-[4/3] w-full rounded-[2rem] border-[3px] border-slate-900" />
                            </Reveal>
                            <Reveal delay={100} className="order-1 lg:order-2">
                                <SectionHeading eyebrow="Hello!" title={home.about.title || `About ${site.name}`} align="left" className="mb-6 sm:mb-6" />
                                <p className="text-lg leading-relaxed font-semibold text-slate-600">{home.about.excerpt}</p>
                                <Link href={`${site.base}/about`} className={cn(t.btn, 'mt-8')}>
                                    Meet our school <ArrowRight className="h-5 w-5" aria-hidden="true" />
                                </Link>
                            </Reveal>
                        </div>
                    )}
                    <MissionVision mission={home.mission} vision={home.vision} values={home.values} />
                </Section>
            )}

            {home.highlights.length > 0 && (
                <section aria-label="Why families love us" className="relative">
                    <Wave fill="color-mix(in srgb, var(--site-secondary) 12%, white)" />
                    <div className="bg-[color-mix(in_srgb,var(--site-secondary)_12%,white)] py-14">
                        <Container>
                            <SectionHeading eyebrow="Why families love us" title="Learning is an adventure" />
                            <div className={cn('grid gap-6 sm:grid-cols-2', home.highlights.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
                                {home.highlights.map((h, i) => {
                                    const c = playfulPalette[i % playfulPalette.length];
                                    return (
                                        <Reveal key={i} delay={i * 80}>
                                            <div className={cn('h-full p-6 text-center', t.card, t.cardHover)}>
                                                <span
                                                    className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[42%_58%_55%_45%/50%_45%_55%_50%] border-[3px] border-slate-900 text-slate-900"
                                                    style={{ background: `color-mix(in srgb, ${c} 45%, white)` }}
                                                >
                                                    <HighlightIcon name={h.icon} className="h-7 w-7" />
                                                </span>
                                                <h3 className="mt-5 text-lg font-black text-slate-900">{h.title}</h3>
                                                {h.text && <p className="mt-2 font-semibold text-slate-600">{h.text}</p>}
                                            </div>
                                        </Reveal>
                                    );
                                })}
                            </div>
                        </Container>
                    </div>
                    <Wave fill="color-mix(in srgb, var(--site-secondary) 12%, white)" flip />
                </section>
            )}

            {home.leader && (
                <Section label="Message from the head">
                    <LeaderMessage leader={home.leader} />
                </Section>
            )}

            <NewsSection posts={home.news} />
            <EventsNoticesSection events={home.events} notices={home.notices} alt />
            <GallerySection images={home.gallery} />
            <TestimonialsSection items={home.testimonials} alt />
            <FaqSection faqs={home.faqs} />

            <PlayfulCta site={site} />
        </>
    );
}

export function PlayfulCta({ site }: { site: SiteChrome }) {
    return (
        <section aria-label="Admissions" className="px-4 py-12 sm:px-6 lg:px-8">
            <Reveal className="mx-auto max-w-5xl">
                <div className="relative overflow-hidden rounded-[2.5rem] border-[3px] border-slate-900 bg-[#facc15] px-6 py-12 text-center shadow-[8px_8px_0_rgba(15,23,42,.9)] sm:px-12">
                    <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-[var(--site-primary)] opacity-80" aria-hidden="true" />
                    <div className="absolute -right-8 -bottom-12 h-36 w-36 rounded-full bg-[var(--site-secondary)] opacity-80" aria-hidden="true" />
                    <div className="relative">
                        <h2 className="text-3xl font-black text-slate-900 sm:text-5xl">{site.admissions_open ? 'Come and join the fun!' : "We'd love to meet you!"}</h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg font-bold text-slate-800">
                            {site.admissions_open ? 'Places are filling up — apply online in a few easy steps.' : 'Pop in for a visit or send us a message.'}
                        </p>
                        <div className="mt-8 flex flex-wrap justify-center gap-4">
                            {site.admissions_open && (
                                <Link href={`${site.base}/admissions`} className={t.btn}>
                                    Apply now <ArrowRight className="h-5 w-5" aria-hidden="true" />
                                </Link>
                            )}
                            <Link href={`${site.base}/contact`} className={t.btnAlt}>
                                Contact us
                            </Link>
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
