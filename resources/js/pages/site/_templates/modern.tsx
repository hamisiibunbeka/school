import { Link } from '@inertiajs/react';
import { ArrowRight, ChevronRight, GraduationCap, Mail, MapPin, Phone, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ContactDetails, EventsNoticesSection, FaqSection, GallerySection, LeaderMessage, MissionVision, NewsSection, statItems, StatNumber, TestimonialsSection } from '../_components/blocks';
import type { HomeData, SiteChrome } from '../_components/types';
import { Crest, HighlightIcon, Reveal, SiteImage, SocialLinks, telHref } from '../_components/ui';
import { BrandingCredit, isActive, MenuButton, MobileNav, quickLinks, useCurrentPath, useMenu, useScrolled } from './shell';
import { Container, Section, SectionHeading, themes } from './theme';

const t = themes.modern;

export function ModernLayout({ site, children }: { site: SiteChrome; children: ReactNode }) {
    const path = useCurrentPath();
    const menu = useMenu();
    const scrolled = useScrolled();

    return (
        <>
            <header
                className={cn(
                    'site-noprint sticky top-0 z-50 border-b transition-all duration-300',
                    scrolled ? 'border-slate-200/70 bg-white/80 shadow-[0_8px_30px_-12px_rgba(15,23,42,.18)] backdrop-blur-xl' : 'border-transparent bg-white/60 backdrop-blur-md',
                )}
            >
                <Container className="flex h-[72px] items-center justify-between gap-4">
                    <Link href={site.base} className="flex min-w-0 items-center gap-3 rounded-lg">
                        <Crest site={site} variant="circle" className="h-11 w-11 shadow-md" />
                        <span className="min-w-0">
                            <span className="block truncate text-base leading-tight font-extrabold text-slate-900 sm:text-lg">{site.name}</span>
                            {site.motto && <span className="block truncate text-xs font-semibold text-slate-500">{site.motto}</span>}
                        </span>
                    </Link>
                    <nav aria-label="Main" className="hidden lg:block">
                        <ul className="flex items-center gap-1 rounded-full bg-slate-100/80 p-1">
                            {site.nav.map((item) => {
                                const active = isActive(item, path, site.base);
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            aria-current={active ? 'page' : undefined}
                                            className={cn(
                                                'block rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap transition xl:px-4',
                                                active ? 'bg-white text-[var(--site-primary)] shadow-sm' : 'text-slate-600 hover:text-slate-900',
                                            )}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                    <div className="flex items-center gap-2">
                        {site.admissions_open && (
                            <Link href={`${site.base}/admissions`} className={cn(t.btn, 'hidden px-5 py-2.5 sm:inline-flex')}>
                                Apply now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        )}
                        <MenuButton open={menu.open} onClick={() => menu.setOpen(true)} className="text-slate-800 hover:bg-slate-100" />
                    </div>
                </Container>
            </header>
            <MobileNav
                site={site}
                open={menu.open}
                onClose={menu.close}
                cta={
                    site.admissions_open && (
                        <Link href={`${site.base}/admissions`} className={cn(t.btn, 'w-full')}>
                            Apply now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    )
                }
            />

            <main id="main" className="flex-1">
                {children}
            </main>

            <ModernFooter site={site} />
        </>
    );
}

function ModernFooter({ site }: { site: SiteChrome }) {
    return (
        <footer className="site-noprint relative overflow-hidden bg-slate-950 text-slate-300">
            <div className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-[var(--site-primary)] opacity-25 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-32 -bottom-40 h-96 w-96 rounded-full bg-[var(--site-secondary)] opacity-20 blur-3xl" aria-hidden="true" />
            <Container className="relative py-16">
                <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr]">
                    <div>
                        <div className="flex items-center gap-3">
                            <Crest site={site} variant="circle" className="h-12 w-12" />
                            <div>
                                <p className="text-lg font-extrabold text-white">{site.name}</p>
                                {site.motto && <p className="text-sm text-slate-400">{site.motto}</p>}
                            </div>
                        </div>
                        {site.tagline && <p className="mt-5 max-w-sm leading-relaxed text-slate-400">{site.tagline}</p>}
                        <SocialLinks social={site.social} className="mt-6" itemClassName="bg-white/10 text-white hover:bg-[var(--site-primary)] focus-visible:ring-white" />
                    </div>
                    <div>
                        <p className="text-sm font-bold tracking-wider text-white uppercase">Quick links</p>
                        <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 lg:grid-cols-1">
                            {quickLinks(site).map((n) => (
                                <li key={n.href}>
                                    <Link href={n.href} className="inline-flex items-center gap-1 text-sm hover:text-white">
                                        <ChevronRight className="h-3.5 w-3.5 text-[var(--site-secondary)]" aria-hidden="true" /> {n.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <p className="text-sm font-bold tracking-wider text-white uppercase">Get in touch</p>
                        <ContactDetails site={site} tone="dark" className="mt-5" />
                    </div>
                </div>
                <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row">
                    <p>
                        © {site.year} {site.name}. All rights reserved.
                    </p>
                    <BrandingCredit site={site} className="text-slate-500" />
                </div>
            </Container>
        </footer>
    );
}

export function ModernPageHeader({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string | null; eyebrow?: string; children?: ReactNode }) {
    return (
        <section className="relative overflow-hidden bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] text-white">
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-black/10 blur-3xl" aria-hidden="true" />
            <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]" aria-hidden="true">
                <defs>
                    <pattern id="modern-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                        <path d="M32 0H0v32" fill="none" stroke="#fff" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#modern-grid)" />
            </svg>
            <Container className="relative py-16 sm:py-20">
                {eyebrow && <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wider uppercase backdrop-blur">{eyebrow}</p>}
                <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
                {subtitle && <p className="mt-4 max-w-2xl text-lg text-white/85">{subtitle}</p>}
                {children}
            </Container>
        </section>
    );
}

export function ModernHome({ site, home }: { site: SiteChrome; home: HomeData }) {
    const stats = statItems(home.stats);
    return (
        <>
            {/* Hero */}
            <section className="relative isolate overflow-hidden bg-slate-950 text-white">
                {home.hero.image_url && <img src={home.hero.image_url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />}
                <div
                    className={cn('absolute inset-0 -z-10', home.hero.image_url ? 'opacity-90' : 'opacity-100')}
                    style={{
                        background: `radial-gradient(60% 80% at 15% 10%, color-mix(in srgb, var(--site-secondary) 70%, transparent), transparent 60%),
                                     radial-gradient(50% 70% at 90% 90%, color-mix(in srgb, var(--site-primary) 80%, transparent), transparent 65%),
                                     linear-gradient(135deg, color-mix(in srgb, var(--site-primary) 92%, #000), color-mix(in srgb, var(--site-secondary) 75%, #000))`,
                    }}
                    aria-hidden="true"
                />
                <div className="site-float pointer-events-none absolute top-20 right-[8%] -z-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                <Container className="grid items-center gap-12 pt-16 pb-28 sm:pt-24 lg:grid-cols-[1.25fr_1fr] lg:pb-36">
                    <Reveal>
                        {site.tagline && (
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-bold backdrop-blur">
                                <Sparkles className="h-4 w-4" aria-hidden="true" /> {site.tagline}
                            </p>
                        )}
                        <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">{home.hero.title}</h1>
                        {home.hero.subtitle && <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/85">{home.hero.subtitle}</p>}
                        <div className="mt-9 flex flex-wrap gap-3">
                            {site.admissions_open && (
                                <Link href={`${site.base}/admissions`} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-extrabold text-slate-900 shadow-xl transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:outline-none">
                                    Apply now <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                            )}
                            <Link href={`${site.base}/about`} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-extrabold text-white backdrop-blur transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                                Learn more
                            </Link>
                        </div>
                    </Reveal>
                    <Reveal delay={150} className="hidden lg:block">
                        <div className="relative">
                            <div className="rotate-2 rounded-3xl border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-xl">
                                <SiteImage src={home.about.image_url ?? home.hero.image_url} alt={`${site.name} campus`} label={site.name} icon={<GraduationCap className="h-12 w-12" />} className="aspect-[4/5] w-full rounded-2xl" />
                            </div>
                            {home.highlights[0] && (
                                <div className="site-float absolute -bottom-6 -left-8 flex max-w-[16rem] items-center gap-3 rounded-2xl border border-white/30 bg-white/90 p-4 text-slate-900 shadow-2xl backdrop-blur">
                                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] text-white">
                                        <HighlightIcon name={home.highlights[0].icon} className="h-5 w-5" />
                                    </span>
                                    <span className="text-sm leading-tight font-extrabold">{home.highlights[0].title}</span>
                                </div>
                            )}
                        </div>
                    </Reveal>
                </Container>
            </section>

            {/* Floating stats */}
            {stats.length > 0 && (
                <div className="relative z-10 -mt-16 px-4 sm:px-6 lg:px-8">
                    <Reveal className="mx-auto max-w-6xl">
                        <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/60 bg-slate-200/60 shadow-[0_30px_60px_-25px_rgba(15,23,42,.35)] backdrop-blur-xl', stats.length >= 5 ? 'sm:grid-cols-5' : stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
                            {stats.map((s, i) => (
                                <div key={s.label} className={cn('bg-white/90 px-4 py-6 text-center', stats.length % 2 === 1 && i === stats.length - 1 && 'col-span-2 sm:col-span-1')}>
                                    <dt className="text-xs font-bold tracking-wider text-slate-500 uppercase">{s.label}</dt>
                                    <dd className="mt-1 bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
                                        <StatNumber value={s.value} />+
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </Reveal>
                </div>
            )}

            {/* About */}
            {(home.about.excerpt || home.mission || home.vision || home.values.length > 0) && (
                <Section label="About us">
                    {home.about.excerpt && (
                        <div className="mb-16 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                            <Reveal>
                                <div className="relative">
                                    <div className="absolute -inset-4 -rotate-3 rounded-3xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] opacity-15" aria-hidden="true" />
                                    <SiteImage src={home.about.image_url} alt={`About ${site.name}`} label={site.name} className="relative aspect-[4/3] w-full rounded-2xl shadow-xl" />
                                </div>
                            </Reveal>
                            <Reveal delay={120}>
                                <p className={t.eyebrow}>About us</p>
                                <h2 className={cn(t.heading, 'mt-4 text-3xl sm:text-4xl')}>{home.about.title || `About ${site.name}`}</h2>
                                <p className="mt-5 text-lg leading-relaxed text-slate-600">{home.about.excerpt}</p>
                                <Link href={`${site.base}/about`} className={cn(t.btnAlt, 'mt-8')}>
                                    Discover our story <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                            </Reveal>
                        </div>
                    )}
                    <MissionVision mission={home.mission} vision={home.vision} values={home.values} />
                </Section>
            )}

            {/* Highlights */}
            {home.highlights.length > 0 && (
                <Section alt label="Why choose us">
                    <SectionHeading eyebrow="Why choose us" title="An education that opens doors" />
                    <div className={cn('grid gap-6 sm:grid-cols-2', home.highlights.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
                        {home.highlights.map((h, i) => (
                            <Reveal key={i} delay={i * 80}>
                                <div className={cn('group h-full p-7', t.card, t.cardHover)}>
                                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] text-white shadow-lg transition group-hover:scale-110 group-hover:rotate-3">
                                        <HighlightIcon name={h.icon} className="h-7 w-7" />
                                    </span>
                                    <h3 className="mt-6 text-lg font-extrabold text-slate-900">{h.title}</h3>
                                    {h.text && <p className="mt-2 leading-relaxed text-slate-600">{h.text}</p>}
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </Section>
            )}

            {home.leader && (
                <Section label="Message from the head">
                    <LeaderMessage leader={home.leader} />
                </Section>
            )}

            <NewsSection posts={home.news} alt />
            <EventsNoticesSection events={home.events} notices={home.notices} />
            <GallerySection images={home.gallery} alt />
            <TestimonialsSection items={home.testimonials} />
            <FaqSection faqs={home.faqs} alt />

            <ModernCta site={site} />
        </>
    );
}

export function ModernCta({ site }: { site: SiteChrome }) {
    const c = site.contact;
    return (
        <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8" aria-label="Admissions and contact">
            <Reveal className="mx-auto max-w-6xl">
                <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] px-6 py-14 text-white shadow-2xl sm:px-12">
                    <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
                    <div className="relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
                        <div>
                            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{site.admissions_open ? 'Admissions are open — join our family' : 'We would love to hear from you'}</h2>
                            <p className="mt-4 max-w-xl text-lg text-white/85">
                                {site.admissions_open ? 'Apply online in minutes and track your application status any time.' : 'Visit us, call the office or send us a message.'}
                            </p>
                            <div className="mt-8 flex flex-wrap gap-3">
                                {site.admissions_open && (
                                    <Link href={`${site.base}/admissions`} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-extrabold text-slate-900 shadow-lg transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                                        Start application <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                )}
                                <Link href={`${site.base}/contact`} className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
                                    Contact us
                                </Link>
                            </div>
                        </div>
                        <ul className="space-y-3">
                            {c.phone && (
                                <li>
                                    <a href={telHref(c.phone)} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 font-bold backdrop-blur transition hover:bg-white/20">
                                        <Phone className="h-5 w-5" aria-hidden="true" /> {c.phone}
                                    </a>
                                </li>
                            )}
                            {c.email && (
                                <li>
                                    <a href={`mailto:${c.email}`} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 font-bold break-all backdrop-blur transition hover:bg-white/20">
                                        <Mail className="h-5 w-5 shrink-0" aria-hidden="true" /> {c.email}
                                    </a>
                                </li>
                            )}
                            {c.address && (
                                <li className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 font-bold backdrop-blur">
                                    <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" /> {c.address}
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
