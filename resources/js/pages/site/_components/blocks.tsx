import { Link } from '@inertiajs/react';
import { ArrowRight, Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Compass, Eye, Image as ImageIcon, Mail, MapPin, Megaphone, Newspaper, Phone, Quote, Target, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { cn, date, money, titleCase } from '@/lib/utils';
import { Section, SectionHeading, useSite, useTheme } from '../_templates/theme';
import type { EventItem, Faq, FeeGroup, GalleryImage, Leader, Notice, Paginated, PostCard, SiteChrome, Stats, Testimonial } from './types';
import { CountUp, dateParts, Reveal, SiteImage, telHref } from './ui';

/* -------------------------------------------------------------------------- */
/*  News                                                                       */
/* -------------------------------------------------------------------------- */

const typeLabel: Record<string, string> = { news: 'News', event: 'Event', notice: 'Notice' };

export function NewsCard({ post, featured }: { post: PostCard; featured?: boolean }) {
    const t = useTheme();
    return (
        <article className={cn('group relative flex h-full flex-col overflow-hidden', t.card, t.cardHover, featured && 'md:flex-row')}>
            <Link href={post.href} className={cn('block shrink-0', featured && 'md:w-1/2')} tabIndex={-1} aria-hidden="true">
                <SiteImage
                    src={post.cover_url}
                    alt=""
                    label={null}
                    icon={<Newspaper className="h-10 w-10" />}
                    className={cn('aspect-[16/10] w-full', featured && 'md:aspect-auto md:h-full', t.key === 'playful' && 'border-b-[3px] border-slate-900 md:border-b-0')}
                    imgClassName="transition duration-500 group-hover:scale-105"
                />
            </Link>
            <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={t.chip}>{typeLabel[post.type] ?? titleCase(post.type)}</span>
                    <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        <time dateTime={post.event_starts_at ?? post.published_at ?? undefined}>{date(post.type === 'event' && post.event_starts_at ? post.event_starts_at : post.published_at)}</time>
                    </span>
                </div>
                <h3 className={cn(t.heading, 'text-lg leading-snug sm:text-xl', featured && 'sm:text-2xl')}>
                    <Link href={post.href} className="focus-visible:outline-none group-hover:text-[var(--site-primary)] after:absolute after:inset-0 after:content-['']">
                        {post.title}
                    </Link>
                </h3>
                {post.excerpt && <p className="line-clamp-3 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>}
                {post.event_location && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {post.event_location}
                    </p>
                )}
                <span className={cn('mt-auto inline-flex items-center gap-1 pt-2 text-sm', t.link)}>
                    Read more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                </span>
            </div>
        </article>
    );
}

export function NewsGrid({ posts }: { posts: PostCard[] }) {
    const t = useTheme();
    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
                <Reveal key={p.slug} enabled={t.reveal} delay={i * 80}>
                    <NewsCard post={p} />
                </Reveal>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Events & notices                                                           */
/* -------------------------------------------------------------------------- */

export function DateBadge({ value, className }: { value: string; className?: string }) {
    const t = useTheme();
    const p = dateParts(value);
    return (
        <div
            className={cn(
                'flex h-16 w-16 shrink-0 flex-col items-center justify-center text-center leading-none',
                t.key === 'modern' && 'rounded-2xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] text-white shadow-lg',
                t.key === 'classic' && 'rounded-sm border-2 border-[var(--site-secondary)] bg-[var(--site-primary)] text-[var(--site-on-primary)]',
                t.key === 'minimal' && 'border border-neutral-900 text-neutral-950',
                t.key === 'playful' && 'rounded-2xl border-[3px] border-slate-900 bg-[var(--site-secondary)] text-[var(--site-on-secondary)] shadow-[3px_3px_0_rgba(15,23,42,.9)]',
                className,
            )}
            aria-hidden="true"
        >
            <span className={cn('text-2xl font-black', t.key === 'classic' && '[font-family:var(--site-heading-font)]', t.key === 'minimal' && 'font-semibold')}>{p.day}</span>
            <span className="mt-1 text-[11px] font-bold tracking-wider uppercase">{p.month}</span>
        </div>
    );
}

export function EventList({ events, compact }: { events: EventItem[]; compact?: boolean }) {
    const t = useTheme();
    if (!events.length) return <p className="text-sm text-slate-500">No upcoming events right now — check back soon.</p>;
    return (
        <ul className={cn('grid gap-4', !compact && 'sm:grid-cols-2')}>
            {events.map((e, i) => {
                const p = dateParts(e.starts_at);
                const body = (
                    <>
                        <DateBadge value={e.starts_at} />
                        <div className="min-w-0 flex-1">
                            <p className={cn(t.heading, 'text-base leading-snug sm:text-lg', e.href && 'group-hover:text-[var(--site-primary)]')}>{e.title}</p>
                            <p className="sr-only">{date(e.starts_at)}</p>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {p.weekday}, {date(e.starts_at)}
                                </span>
                                {p.time && (
                                    <span className="inline-flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {p.time}
                                    </span>
                                )}
                                {e.location && (
                                    <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {e.location}
                                    </span>
                                )}
                            </div>
                        </div>
                        {e.href && <ChevronRight className="h-5 w-5 shrink-0 self-center text-slate-400 transition group-hover:translate-x-1 group-hover:text-[var(--site-primary)]" aria-hidden="true" />}
                    </>
                );
                const cls = cn('group flex items-start gap-4 p-4', t.card, e.href && t.cardHover);
                return (
                    <Reveal as="li" key={`${e.title}-${e.starts_at}-${i}`} enabled={t.reveal} delay={i * 60}>
                        {e.href ? (
                            <Link href={e.href} className={cls}>
                                {body}
                            </Link>
                        ) : (
                            <div className={cls}>{body}</div>
                        )}
                    </Reveal>
                );
            })}
        </ul>
    );
}

export function NoticeList({ notices }: { notices: Notice[] }) {
    const t = useTheme();
    if (!notices.length) return null;
    return (
        <ul className="space-y-3">
            {notices.map((n, i) => {
                const urgent = n.priority === 'high' || n.priority === 'urgent';
                return (
                    <li key={`${n.title}-${i}`} className={cn('relative overflow-hidden p-4 pl-5', t.card)}>
                        <span className={cn('absolute inset-y-0 left-0 w-1.5', urgent ? 'bg-rose-500' : 'bg-[var(--site-secondary)]')} aria-hidden="true" />
                        <div className="flex items-start gap-3">
                            {urgent ? <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" /> : <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[var(--site-primary)]" aria-hidden="true" />}
                            <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                                    {n.title}
                                    {urgent && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-700 uppercase">Important</span>}
                                </p>
                                {n.body && <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-600">{n.body}</p>}
                                {n.date && <p className="mt-2 text-xs font-semibold text-slate-400">Posted {date(n.date)}</p>}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

/* -------------------------------------------------------------------------- */
/*  Gallery                                                                    */
/* -------------------------------------------------------------------------- */

export function GalleryGrid({ images, strip }: { images: GalleryImage[]; strip?: boolean }) {
    const t = useTheme();
    const [open, setOpen] = useState<number | null>(null);
    const current = open === null ? null : images[open];

    useEffect(() => {
        if (open === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(null);
            if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % images.length));
            if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length));
        };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, images.length]);

    if (!images.length) return null;

    return (
        <>
            <ul className={cn(strip ? 'grid grid-cols-2 gap-3 sm:grid-cols-4' : 'columns-2 gap-4 sm:columns-3 lg:columns-4 [&>li]:mb-4')}>
                {images.map((img, i) => (
                    <li key={img.id} className={cn(!strip && 'break-inside-avoid', strip && i >= 8 && 'hidden')}>
                        <button
                            type="button"
                            onClick={() => setOpen(i)}
                            className={cn(
                                'group relative block w-full overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2 focus-visible:outline-none',
                                t.imgRadius,
                                t.key === 'playful' && 'border-[3px] border-slate-900',
                            )}
                            aria-label={`Open photo${img.title ? `: ${img.title}` : ''}`}
                        >
                            <SiteImage
                                src={img.url}
                                alt={img.title ?? img.caption ?? 'School photo'}
                                icon={<ImageIcon className="h-8 w-8" />}
                                className={cn('w-full', strip ? 'aspect-square' : i % 3 === 0 ? 'aspect-[3/4]' : 'aspect-[4/3]')}
                                imgClassName="transition duration-500 group-hover:scale-105"
                            />
                            {(img.title || img.album) && (
                                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                                    {img.title ?? img.album}
                                </span>
                            )}
                        </button>
                    </li>
                ))}
            </ul>

            {current && (
                <div role="dialog" aria-modal="true" aria-label={current.title ?? 'Photo'} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
                    <button type="button" className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none" aria-label="Close" onClick={() => setOpen(null)} autoFocus>
                        <X className="h-6 w-6" />
                    </button>
                    {images.length > 1 && (
                        <>
                            <button
                                type="button"
                                className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:left-6"
                                aria-label="Previous photo"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setOpen((open! - 1 + images.length) % images.length);
                                }}
                            >
                                <ChevronLeft className="h-7 w-7" />
                            </button>
                            <button
                                type="button"
                                className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:right-6"
                                aria-label="Next photo"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setOpen((open! + 1) % images.length);
                                }}
                            >
                                <ChevronRight className="h-7 w-7" />
                            </button>
                        </>
                    )}
                    <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                        {current.url ? (
                            <img src={current.url} alt={current.title ?? current.caption ?? 'School photo'} className="max-h-[78vh] w-auto rounded-lg object-contain" />
                        ) : (
                            <SiteImage src={null} alt="School photo" className="h-64 w-96 max-w-full rounded-lg" icon={<ImageIcon className="h-10 w-10" />} />
                        )}
                        {(current.title || current.caption) && (
                            <figcaption className="mt-3 text-center text-sm text-white/90">
                                {current.title && <strong className="block text-white">{current.title}</strong>}
                                {current.caption}
                            </figcaption>
                        )}
                        <p className="mt-1 text-center text-xs text-white/50">
                            {open! + 1} / {images.length}
                        </p>
                    </figure>
                </div>
            )}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*  Testimonials / FAQ                                                         */
/* -------------------------------------------------------------------------- */

export function TestimonialGrid({ items }: { items: Testimonial[] }) {
    const t = useTheme();
    if (!items.length) return null;
    return (
        <div className={cn('grid gap-6', items.length === 1 ? 'mx-auto max-w-2xl' : items.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3')}>
            {items.map((q, i) => (
                <Reveal key={i} enabled={t.reveal} delay={i * 90}>
                    <figure className={cn('relative flex h-full flex-col p-6 sm:p-8', t.card, t.key === 'playful' && i % 2 === 1 && 'rotate-[0.6deg]', t.key === 'playful' && i % 2 === 0 && '-rotate-[0.6deg]')}>
                        <Quote
                            className={cn('h-9 w-9', t.key === 'minimal' ? 'text-neutral-300' : 'text-[color-mix(in_srgb,var(--site-secondary)_75%,white)]', t.key === 'classic' && 'text-[var(--site-secondary)]')}
                            aria-hidden="true"
                        />
                        <blockquote className={cn('mt-4 flex-1 text-base leading-relaxed text-slate-700 sm:text-lg', t.key === 'classic' && 'italic [font-family:var(--site-heading-font)]')}>
                            “{q.quote}”
                        </blockquote>
                        <figcaption className="mt-6 flex items-center gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--site-primary)_14%,white)] text-sm font-black text-[var(--site-primary)]" aria-hidden="true">
                                {q.name
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((w) => w[0])
                                    .join('')
                                    .toUpperCase()}
                            </span>
                            <span>
                                <span className="block font-bold text-slate-900">{q.name}</span>
                                {q.role && <span className="block text-sm text-slate-500">{q.role}</span>}
                            </span>
                        </figcaption>
                    </figure>
                </Reveal>
            ))}
        </div>
    );
}

export function FaqAccordion({ faqs }: { faqs: Faq[] }) {
    const t = useTheme();
    const [open, setOpen] = useState<number | null>(0);
    const id = useId();
    if (!faqs.length) return null;
    return (
        <div className={cn(t.key === 'minimal' ? 'divide-y divide-neutral-200 border-y border-neutral-200' : 'space-y-3')}>
            {faqs.map((f, i) => {
                const isOpen = open === i;
                return (
                    <div key={i} className={cn(t.key !== 'minimal' && t.card, t.key !== 'minimal' && 'overflow-hidden')}>
                        <h3>
                            <button
                                type="button"
                                id={`${id}-q${i}`}
                                aria-expanded={isOpen}
                                aria-controls={`${id}-a${i}`}
                                onClick={() => setOpen(isOpen ? null : i)}
                                className={cn(
                                    'flex w-full items-center justify-between gap-4 text-left font-bold text-slate-900 transition hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:outline-none focus-visible:ring-inset',
                                    t.key === 'minimal' ? 'py-6 text-lg font-medium' : 'px-5 py-4 sm:px-6',
                                    t.key === 'classic' && '[font-family:var(--site-heading-font)] text-lg',
                                )}
                            >
                                {f.question}
                                <ChevronDown className={cn('h-5 w-5 shrink-0 text-[var(--site-primary)] transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden="true" />
                            </button>
                        </h3>
                        <div
                            id={`${id}-a${i}`}
                            role="region"
                            aria-labelledby={`${id}-q${i}`}
                            className={cn('grid transition-all duration-300', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
                        >
                            <div className="overflow-hidden">
                                <p className={cn('leading-relaxed whitespace-pre-line text-slate-600', t.key === 'minimal' ? 'pb-6' : 'px-5 pb-5 sm:px-6')}>{f.answer}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Stats / about                                                              */
/* -------------------------------------------------------------------------- */

export function statItems(stats: Stats | null): { label: string; value: number; suffix?: string }[] {
    if (!stats) return [];
    const items = [
        { label: 'Students', value: stats.students },
        { label: 'Teachers', value: stats.teachers },
        { label: 'Classes', value: stats.classes },
        { label: 'Subjects', value: stats.subjects },
    ];
    if (stats.years) items.push({ label: 'Years of excellence', value: stats.years });
    return items.filter((s) => s.value > 0);
}

export function StatNumber({ value, className }: { value: number; className?: string }) {
    return <CountUp value={value} className={className} />;
}

export function MissionVision({ mission, vision, values }: { mission: string | null; vision: string | null; values: string[] }) {
    const t = useTheme();
    if (!mission && !vision && !values.length) return null;
    const blocks = [
        mission && { title: 'Our mission', text: mission, icon: Target },
        vision && { title: 'Our vision', text: vision, icon: Eye },
    ].filter(Boolean) as { title: string; text: string; icon: typeof Target }[];
    return (
        <div className="grid gap-6 lg:grid-cols-3">
            {blocks.map((b, i) => (
                <Reveal key={b.title} enabled={t.reveal} delay={i * 80} className={cn(blocks.length === 1 && !values.length && 'lg:col-span-3')}>
                    <div className={cn('h-full p-6 sm:p-8', t.card)}>
                        <span
                            className={cn(
                                'inline-flex h-12 w-12 items-center justify-center',
                                t.key === 'minimal' ? 'border border-neutral-900 text-neutral-900' : 'rounded-xl bg-[color-mix(in_srgb,var(--site-primary)_12%,white)] text-[var(--site-primary)]',
                                t.key === 'playful' && 'rounded-full bg-[var(--site-primary)] text-[var(--site-on-primary)]',
                            )}
                            aria-hidden="true"
                        >
                            <b.icon className="h-6 w-6" />
                        </span>
                        <h3 className={cn(t.heading, 'mt-5 text-xl')}>{b.title}</h3>
                        <p className="mt-3 leading-relaxed text-slate-600">{b.text}</p>
                    </div>
                </Reveal>
            ))}
            {values.length > 0 && (
                <Reveal enabled={t.reveal} delay={160} className={cn(blocks.length === 0 && 'lg:col-span-3', blocks.length === 1 && 'lg:col-span-2')}>
                    <div
                        className={cn(
                            'h-full p-6 sm:p-8',
                            t.card,
                            t.key === 'modern' && 'border-0 bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] text-white',
                            t.key === 'classic' && 'border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-on-primary)]',
                        )}
                    >
                        <span
                            className={cn(
                                'inline-flex h-12 w-12 items-center justify-center rounded-xl',
                                t.key === 'modern' || t.key === 'classic' ? 'bg-white/15' : 'bg-[color-mix(in_srgb,var(--site-secondary)_15%,white)] text-[var(--site-secondary)]',
                                t.key === 'minimal' && 'rounded-none border border-neutral-900 bg-transparent text-neutral-900',
                            )}
                            aria-hidden="true"
                        >
                            <Compass className="h-6 w-6" />
                        </span>
                        <h3 className={cn(t.heading, 'mt-5 text-xl', (t.key === 'modern' || t.key === 'classic') && 'text-inherit')}>Our core values</h3>
                        <ul className="mt-4 flex flex-wrap gap-2">
                            {values.map((v) => (
                                <li
                                    key={v}
                                    className={cn(
                                        'px-3 py-1.5 text-sm font-bold',
                                        t.key === 'modern' && 'rounded-full bg-white/15 backdrop-blur',
                                        t.key === 'classic' && 'rounded-sm border border-[var(--site-secondary)] text-inherit',
                                        t.key === 'minimal' && 'border border-neutral-300 font-medium',
                                        t.key === 'playful' && 'rounded-full border-2 border-slate-900 bg-[color-mix(in_srgb,var(--site-primary)_18%,white)]',
                                    )}
                                >
                                    {v}
                                </li>
                            ))}
                        </ul>
                    </div>
                </Reveal>
            )}
        </div>
    );
}

export function LeaderMessage({ leader }: { leader: Leader }) {
    const t = useTheme();
    return (
        <div className={cn('grid items-center gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14', t.key !== 'minimal' && 'p-6 sm:p-10', t.key !== 'minimal' && t.card)}>
            <Reveal enabled={t.reveal}>
                <div className="relative mx-auto max-w-xs">
                    {t.key === 'modern' && <div className="absolute -inset-3 rotate-3 rounded-3xl bg-[linear-gradient(135deg,var(--site-primary),var(--site-secondary))] opacity-20" aria-hidden="true" />}
                    {t.key === 'playful' && <div className="absolute -inset-4 rounded-[45%_55%_60%_40%/55%_45%_55%_45%] bg-[var(--site-secondary)] opacity-30" aria-hidden="true" />}
                    {t.key === 'classic' && <div className="absolute -inset-2 border-2 border-[var(--site-secondary)]" aria-hidden="true" />}
                    <SiteImage
                        src={leader.photo_url}
                        alt={leader.name ? `${leader.name}, ${leader.title ?? 'Head of School'}` : (leader.title ?? 'Head of School')}
                        label={leader.name ?? leader.title ?? 'Head'}
                        className={cn('relative aspect-[4/5] w-full', t.imgRadius, t.key === 'playful' && 'rounded-[45%_55%_60%_40%/55%_45%_55%_45%] border-[3px] border-slate-900')}
                    />
                </div>
            </Reveal>
            <Reveal enabled={t.reveal} delay={120}>
                <div>
                    <p className={t.eyebrow}>{t.key === 'minimal' && <span className="h-px w-10 bg-[var(--site-primary)]" aria-hidden="true" />}A word from our {leader.title ?? 'Head of School'}</p>
                    <Quote className="mt-6 h-10 w-10 text-[color-mix(in_srgb,var(--site-secondary)_70%,white)]" aria-hidden="true" />
                    <blockquote className={cn('mt-3 text-lg leading-relaxed whitespace-pre-line text-slate-700 sm:text-xl', (t.key === 'classic' || t.key === 'minimal') && '[font-family:var(--site-heading-font)]', t.key === 'classic' && 'italic')}>
                        {leader.message}
                    </blockquote>
                    {(leader.name || leader.title) && (
                        <p className="mt-6">
                            {leader.name && <span className={cn(t.heading, 'block text-lg')}>{leader.name}</span>}
                            {leader.title && <span className="block text-sm font-semibold text-slate-500">{leader.title}</span>}
                        </p>
                    )}
                </div>
            </Reveal>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Fees / tables                                                              */
/* -------------------------------------------------------------------------- */

export function FeesTable({ fees }: { fees: FeeGroup[] }) {
    const t = useTheme();
    if (!fees.length) return null;
    return (
        <div className="space-y-6">
            {fees.map((g) => {
                const total = g.items.reduce((s, i) => s + Number(i.amount || 0), 0);
                return (
                    <div key={g.class} className={cn('overflow-hidden', t.card)}>
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[color-mix(in_srgb,var(--site-primary)_6%,white)] px-5 py-3">
                            <h3 className={cn(t.heading, 'text-lg')}>{g.class}</h3>
                            <span className="text-sm font-bold text-slate-600">Total {money(total)}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm">
                                <thead>
                                    <tr className="text-left text-xs tracking-wider text-slate-500 uppercase">
                                        <th scope="col" className="px-5 py-2.5 font-bold">
                                            Item
                                        </th>
                                        <th scope="col" className="px-5 py-2.5 font-bold">
                                            Term
                                        </th>
                                        <th scope="col" className="px-5 py-2.5 font-bold">
                                            Applies to
                                        </th>
                                        <th scope="col" className="px-5 py-2.5 text-right font-bold">
                                            Amount
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {g.items.map((i, idx) => (
                                        <tr key={idx}>
                                            <td className="px-5 py-2.5 font-semibold text-slate-800">{i.category}</td>
                                            <td className="px-5 py-2.5 text-slate-600">{i.term ?? 'Annual'}</td>
                                            <td className="px-5 py-2.5 text-slate-600">{i.residence && i.residence !== 'all' ? titleCase(i.residence) : 'All learners'}</td>
                                            <td className="px-5 py-2.5 text-right font-bold text-slate-900 tabular-nums">{money(i.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Contact                                                                    */
/* -------------------------------------------------------------------------- */

export function ContactDetails({ site, className, tone = 'light' }: { site: SiteChrome; className?: string; tone?: 'light' | 'dark' }) {
    const c = site.contact;
    const rows = [
        c.address && { icon: MapPin, label: 'Address', value: c.address },
        c.phone && { icon: Phone, label: 'Phone', value: c.phone, href: telHref(c.phone) },
        c.email && { icon: Mail, label: 'Email', value: c.email, href: `mailto:${c.email}` },
        c.office_hours && { icon: Clock, label: 'Office hours', value: c.office_hours },
    ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; href?: string }[];
    if (!rows.length) return null;
    return (
        <ul className={cn('space-y-4', className)}>
            {rows.map((r) => (
                <li key={r.label} className="flex items-start gap-3">
                    <span
                        className={cn(
                            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                            tone === 'dark' ? 'bg-white/10 text-white' : 'bg-[color-mix(in_srgb,var(--site-primary)_10%,white)] text-[var(--site-primary)]',
                        )}
                        aria-hidden="true"
                    >
                        <r.icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0">
                        <span className={cn('block text-xs font-bold tracking-wider uppercase', tone === 'dark' ? 'text-white/60' : 'text-slate-500')}>{r.label}</span>
                        {r.href ? (
                            <a href={r.href} className={cn('font-semibold break-words hover:underline', tone === 'dark' ? 'text-white' : 'text-slate-900')}>
                                {r.value}
                            </a>
                        ) : (
                            <span className={cn('block font-semibold whitespace-pre-line', tone === 'dark' ? 'text-white' : 'text-slate-900')}>{r.value}</span>
                        )}
                    </span>
                </li>
            ))}
        </ul>
    );
}

export function MapEmbed({ url, title, className }: { url: string; title: string; className?: string }) {
    const safe = /^https:\/\//.test(url);
    if (!safe) return null;
    return <iframe src={url} title={title} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className={cn('h-80 w-full border-0', className)} allowFullScreen />;
}

/* -------------------------------------------------------------------------- */
/*  Pagination / empty                                                         */
/* -------------------------------------------------------------------------- */

export function Pagination({ paginator }: { paginator: Paginated<unknown> }) {
    const t = useTheme();
    if (paginator.last_page <= 1) return null;
    return (
        <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {paginator.links.map((l, i) => {
                const label = l.label.replace('&laquo;', '«').replace('&raquo;', '»').replace(/<[^>]+>/g, '');
                const cls = cn(
                    'inline-flex h-10 min-w-10 items-center justify-center px-3 text-sm font-bold transition',
                    t.key === 'minimal' ? 'border border-neutral-200' : t.key === 'classic' ? 'rounded-sm border border-slate-300' : 'rounded-full border-2 border-slate-200',
                    l.active ? 'border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-on-primary)]' : 'bg-white text-slate-700 hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]',
                    !l.url && 'pointer-events-none opacity-40',
                );
                return l.url ? (
                    <Link key={i} href={l.url} preserveScroll={false} className={cls} aria-current={l.active ? 'page' : undefined}>
                        {label}
                    </Link>
                ) : (
                    <span key={i} className={cls} aria-hidden="true">
                        {label}
                    </span>
                );
            })}
        </nav>
    );
}

export function EmptyState({ icon: Icon = Newspaper, title, text }: { icon?: typeof Newspaper; title: string; text?: string }) {
    const t = useTheme();
    return (
        <div className={cn('flex flex-col items-center px-6 py-16 text-center', t.card)}>
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--site-primary)_10%,white)] text-[var(--site-primary)]" aria-hidden="true">
                <Icon className="h-8 w-8" />
            </span>
            <p className={cn(t.heading, 'mt-4 text-xl')}>{title}</p>
            {text && <p className="mt-2 max-w-md text-slate-500">{text}</p>}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Generic home sections reused by several templates                          */
/* -------------------------------------------------------------------------- */

export function NewsSection({ posts, alt }: { posts: PostCard[]; alt?: boolean }) {
    const site = useSite();
    const t = useTheme();
    if (!posts.length) return null;
    return (
        <Section alt={alt} label="Latest news">
            <SectionHeading
                eyebrow="Latest news"
                title="What's happening at school"
                align="left"
                action={
                    <Link href={`${site.base}/news`} className={cn(t.btnAlt, t.btnSm)}>
                        All news <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                }
            />
            <NewsGrid posts={posts} />
        </Section>
    );
}

export function EventsNoticesSection({ events, notices, alt }: { events: EventItem[]; notices: Notice[]; alt?: boolean }) {
    const site = useSite();
    const t = useTheme();
    if (!events.length && !notices.length) return null;
    const both = events.length > 0 && notices.length > 0;
    return (
        <Section alt={alt} label="Events and notices">
            <div className={cn('grid gap-12', both && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
                {events.length > 0 && (
                    <div>
                        <SectionHeading eyebrow="Calendar" title="Upcoming events" align="left" className="mb-8 sm:mb-10" />
                        <EventList events={events} compact={both} />
                        {site.nav.some((n) => n.href.endsWith('/news')) && (
                            <Link href={`${site.base}/news?type=event`} className={cn('mt-6 inline-flex items-center gap-1 text-sm', t.link)}>
                                See all events <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        )}
                    </div>
                )}
                {notices.length > 0 && (
                    <div>
                        <SectionHeading eyebrow="Notice board" title="Announcements" align="left" className="mb-8 sm:mb-10" />
                        <NoticeList notices={notices} />
                    </div>
                )}
            </div>
        </Section>
    );
}

export function GallerySection({ images, alt }: { images: GalleryImage[]; alt?: boolean }) {
    const site = useSite();
    const t = useTheme();
    if (!images.length) return null;
    return (
        <Section alt={alt} label="Gallery">
            <SectionHeading
                eyebrow="Gallery"
                title="Life at our school"
                align="left"
                action={
                    <Link href={`${site.base}/gallery`} className={cn(t.btnAlt, t.btnSm)}>
                        View gallery <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                }
            />
            <GalleryGrid images={images} strip />
        </Section>
    );
}

export function TestimonialsSection({ items, alt }: { items: Testimonial[]; alt?: boolean }) {
    if (!items.length) return null;
    return (
        <Section alt={alt} label="Testimonials">
            <SectionHeading eyebrow="Testimonials" title="What our community says" />
            <TestimonialGrid items={items} />
        </Section>
    );
}

export function FaqSection({ faqs, alt }: { faqs: Faq[]; alt?: boolean }) {
    if (!faqs.length) return null;
    return (
        <Section alt={alt} narrow label="Frequently asked questions">
            <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
            <FaqAccordion faqs={faqs} />
        </Section>
    );
}

