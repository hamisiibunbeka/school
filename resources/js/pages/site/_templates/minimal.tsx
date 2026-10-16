import { Link } from '@inertiajs/react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ContactDetails, EventsNoticesSection, FaqSection, GallerySection, LeaderMessage, MissionVision, NewsSection, statItems, StatNumber, TestimonialsSection } from '../_components/blocks';
import type { HomeData, SiteChrome } from '../_components/types';
import { Crest, HighlightIcon, SiteImage, SocialLinks } from '../_components/ui';
import { BrandingCredit, isActive, MenuButton, MobileNav, quickLinks, useCurrentPath, useMenu, useScrolled, NavMore, splitNav } from './shell';
import { Container, Section, themes } from './theme';

const t = themes.minimal;

export function MinimalLayout({ site, children }: { site: SiteChrome; children: ReactNode }) {
    const path = useCurrentPath();
    const menu = useMenu();
    const scrolled = useScrolled();

    return (
        <>
            <header className={cn('site-noprint sticky top-0 z-50 bg-white/95 backdrop-blur transition-[border-color]', scrolled ? 'border-b border-neutral-200' : 'border-b border-transparent')}>
                <Container className="flex h-20 items-center justify-between gap-6">
                    <Link href={site.base} className="flex min-w-0 items-center gap-3">
                        <Crest site={site} variant="square" className="h-10 w-10 text-sm" />
                        <span className="min-w-0">
                            <span className="block truncate text-[15px] font-semibold tracking-tight text-neutral-950 sm:text-base">{site.name}</span>
                            {site.motto && <span className="block truncate text-xs text-neutral-500">{site.motto}</span>}
                        </span>
                    </Link>
                    <nav aria-label="Main" className="hidden lg:block">
                        <ul className="flex items-center gap-7">
                            {splitNav(site.nav).main.map((item) => {
                                const active = isActive(item, path, site.base);
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            aria-current={active ? 'page' : undefined}
                                            className={cn(
                                                'relative py-2 text-sm whitespace-nowrap transition',
                                                'after:absolute after:bottom-0 after:left-0 after:h-[2px] after:bg-[var(--site-primary)] after:transition-all after:duration-300 after:content-[""]',
                                                active ? 'text-neutral-950 after:w-full' : 'text-neutral-500 after:w-0 hover:text-neutral-950 hover:after:w-full',
                                            )}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                            <NavMore items={splitNav(site.nav).more} triggerClass={'relative py-2 text-sm whitespace-nowrap text-neutral-500 transition hover:text-neutral-950'} />
                        </ul>
                    </nav>
                    <div className="flex items-center gap-2">
                        {site.admissions_open && (
                            <Link href={`${site.base}/admissions`} className={cn(t.btn, 'hidden px-5 py-2.5 sm:inline-flex')}>
                                Apply <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        )}
                        <MenuButton open={menu.open} onClick={() => menu.setOpen(true)} className="rounded-none text-neutral-900 hover:bg-neutral-100" />
                    </div>
                </Container>
            </header>
            <MobileNav
                site={site}
                open={menu.open}
                onClose={menu.close}
                panelClassName="shadow-none border-l border-neutral-200"
                itemClassName="rounded-none border-b border-neutral-100 px-0 text-xl font-medium tracking-tight"
                activeClassName="text-[var(--site-primary)]"
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

            <footer className="site-noprint border-t border-neutral-200 bg-white">
                <Container className="py-16">
                    <div className="grid gap-12 lg:grid-cols-[2fr_1fr_1fr]">
                        <div>
                            <p className="max-w-md text-3xl font-semibold tracking-[-0.03em] text-neutral-950 sm:text-4xl">{site.tagline || site.name}</p>
                            <SocialLinks social={site.social} className="mt-8" itemClassName="rounded-none border border-neutral-200 text-neutral-700 hover:border-neutral-950 hover:text-neutral-950" />
                        </div>
                        <div>
                            <p className={t.labelCls}>Explore</p>
                            <ul className="mt-4 space-y-2.5">
                                {quickLinks(site).map((n) => (
                                    <li key={n.href}>
                                        <Link href={n.href} className="text-sm text-neutral-600 hover:text-neutral-950 hover:underline hover:decoration-[var(--site-primary)] hover:underline-offset-4">
                                            {n.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className={t.labelCls}>Contact</p>
                            <ContactDetails site={site} className="mt-4" />
                        </div>
                    </div>
                    <div className="mt-16 flex flex-col justify-between gap-2 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row">
                        <p>
                            © {site.year} {site.name}
                        </p>
                        <BrandingCredit site={site} />
                    </div>
                </Container>
            </footer>
        </>
    );
}

export function MinimalPageHeader({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string | null; eyebrow?: string; children?: ReactNode }) {
    return (
        <section className="border-b border-neutral-200 bg-white">
            <Container className="pt-16 pb-12 sm:pt-24 sm:pb-16">
                {eyebrow && (
                    <p className={t.eyebrow}>
                        <span className="h-px w-10 bg-[var(--site-primary)]" aria-hidden="true" />
                        {eyebrow}
                    </p>
                )}
                <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-7xl">{title}</h1>
                {subtitle && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-500 sm:text-xl">{subtitle}</p>}
                {children}
            </Container>
        </section>
    );
}

export function MinimalHome({ site, home }: { site: SiteChrome; home: HomeData }) {
    const stats = statItems(home.stats);
    return (
        <>
            {/* Editorial hero */}
            <section className="bg-white">
                <Container className="pt-16 pb-12 sm:pt-24">
                    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-end">
                        <div>
                            {site.tagline && (
                                <p className={t.eyebrow}>
                                    <span className="h-px w-10 bg-[var(--site-primary)]" aria-hidden="true" />
                                    {site.tagline}
                                </p>
                            )}
                            <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-[-0.045em] text-neutral-950 sm:text-7xl lg:text-8xl">{home.hero.title}</h1>
                        </div>
                        <div className="lg:pb-3">
                            {home.hero.subtitle && <p className="text-lg leading-relaxed text-neutral-500">{home.hero.subtitle}</p>}
                            <div className="mt-8 flex flex-wrap gap-3">
                                {site.admissions_open && (
                                    <Link href={`${site.base}/admissions`} className={t.btn}>
                                        Apply now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                )}
                                <Link href={`${site.base}/about`} className={t.btnAlt}>
                                    Learn more
                                </Link>
                            </div>
                        </div>
                    </div>
                </Container>
                <Container>
                    <SiteImage src={home.hero.image_url ?? home.about.image_url} alt={`${site.name}`} label={site.name} className="aspect-[16/9] w-full sm:aspect-[21/9]" />
                </Container>
            </section>

            {/* Numbers */}
            {stats.length > 0 && (
                <section aria-label="School in numbers" className="bg-white">
                    <Container className="py-16 sm:py-20">
                        <dl className={cn('grid grid-cols-2 gap-x-8 gap-y-10', stats.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
                            {stats.map((s) => (
                                <div key={s.label} className="border-t border-neutral-950 pt-4">
                                    <dt className="text-xs tracking-[0.15em] text-neutral-500 uppercase">{s.label}</dt>
                                    <dd className="mt-3 text-5xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-6xl">
                                        <StatNumber value={s.value} />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </Container>
                </section>
            )}

            {/* About */}
            {(home.about.excerpt || home.mission || home.vision || home.values.length > 0) && (
                <Section alt label="About">
                    {home.about.excerpt && (
                        <div className="mb-20 grid gap-10 lg:grid-cols-[1fr_2fr]">
                            <p className={t.eyebrow}>
                                <span className="h-px w-10 bg-[var(--site-primary)]" aria-hidden="true" />
                                About
                            </p>
                            <div>
                                <h2 className="text-3xl leading-tight font-semibold tracking-[-0.03em] text-neutral-950 sm:text-5xl">{home.about.title || `About ${site.name}`}</h2>
                                <p className="mt-8 text-xl leading-relaxed text-neutral-600">{home.about.excerpt}</p>
                                <Link href={`${site.base}/about`} className={cn('mt-8 inline-flex items-center gap-2', t.link)}>
                                    Read more <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    )}
                    <MissionVision mission={home.mission} vision={home.vision} values={home.values} />
                </Section>
            )}

            {/* Highlights as a numbered index */}
            {home.highlights.length > 0 && (
                <Section label="Why us">
                    <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
                        <div>
                            <p className={t.eyebrow}>
                                <span className="h-px w-10 bg-[var(--site-primary)]" aria-hidden="true" />
                                Why us
                            </p>
                            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-neutral-950 sm:text-5xl">What sets us apart</h2>
                        </div>
                        <ol className="divide-y divide-neutral-200 border-y border-neutral-200">
                            {home.highlights.map((h, i) => (
                                <li key={i} className="group grid grid-cols-[3rem_1fr_auto] items-start gap-4 py-7 sm:grid-cols-[4rem_1fr_auto]">
                                    <span className="text-sm text-neutral-400 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                                    <div>
                                        <h3 className="text-xl font-semibold tracking-tight text-neutral-950 sm:text-2xl">{h.title}</h3>
                                        {h.text && <p className="mt-2 text-neutral-500">{h.text}</p>}
                                    </div>
                                    <HighlightIcon name={h.icon} className="h-6 w-6 text-neutral-300 transition group-hover:text-[var(--site-primary)]" />
                                </li>
                            ))}
                        </ol>
                    </div>
                </Section>
            )}

            {home.leader && (
                <Section alt label="Message from the head">
                    <LeaderMessage leader={home.leader} />
                </Section>
            )}

            <NewsSection posts={home.news} />
            <EventsNoticesSection events={home.events} notices={home.notices} alt />
            <GallerySection images={home.gallery} />
            <TestimonialsSection items={home.testimonials} alt />
            <FaqSection faqs={home.faqs} />

            <MinimalCta site={site} />
        </>
    );
}

export function MinimalCta({ site }: { site: SiteChrome }) {
    return (
        <section aria-label="Admissions" className="bg-neutral-950 text-white">
            <Container className="grid gap-10 py-20 sm:py-28 lg:grid-cols-[2fr_1fr] lg:items-end">
                <h2 className="text-4xl leading-[1.05] font-semibold tracking-[-0.04em] sm:text-6xl">
                    {site.admissions_open ? (
                        <>
                            Admissions are open.
                            <br />
                            <span className="text-[var(--site-primary)] [filter:brightness(1.35)]">Apply today.</span>
                        </>
                    ) : (
                        <>Let's talk.</>
                    )}
                </h2>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                    {site.admissions_open && (
                        <Link href={`${site.base}/admissions`} className="inline-flex items-center justify-between gap-4 border-b border-white/30 py-3 text-lg transition hover:border-white">
                            Start your application <ArrowRight className="h-5 w-5" aria-hidden="true" />
                        </Link>
                    )}
                    <Link href={`${site.base}/contact`} className="inline-flex items-center justify-between gap-4 border-b border-white/30 py-3 text-lg transition hover:border-white">
                        Contact us <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    </Link>
                </div>
            </Container>
        </section>
    );
}
