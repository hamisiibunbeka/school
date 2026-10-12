import { Link } from '@inertiajs/react';
import { ArrowLeft, CalendarDays, Check, Clock, Link2, MapPin } from 'lucide-react';
import { useState } from 'react';
import { cn, date, titleCase } from '@/lib/utils';
import { DateBadge, NewsGrid } from './_components/blocks';
import type { PostCard, SiteChrome } from './_components/types';
import { dateParts, Prose, SiteImage } from './_components/ui';
import { Section, SectionHeading, SiteLayout, useTheme } from './_templates';

type Post = PostCard & { body: string | null; event_ends_at: string | null };

function ShareButton() {
    const [copied, setCopied] = useState(false);
    const t = useTheme();
    return (
        <button
            type="button"
            className={cn(t.btnAlt, t.btnSm)}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch {
                    /* clipboard unavailable */
                }
            }}
        >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Link copied' : 'Copy link'}
        </button>
    );
}

function PostContent({ site, post, related }: { site: SiteChrome; post: Post; related: PostCard[] }) {
    const t = useTheme();
    const start = post.event_starts_at ? dateParts(post.event_starts_at) : null;
    const end = post.event_ends_at ? dateParts(post.event_ends_at) : null;
    return (
        <>
            <Section narrow className="!pt-10 sm:!pt-14">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                    <Link href={`${site.base}/news`} className={cn('inline-flex items-center gap-1.5 text-sm', t.link)}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All news & events
                    </Link>
                    <ShareButton />
                </div>

                {post.cover_url && (
                    <SiteImage src={post.cover_url} alt={post.title} className={cn('mb-10 aspect-[16/9] w-full', t.imgRadius, t.key === 'playful' && 'border-[3px] border-slate-900')} />
                )}

                {post.type === 'event' && post.event_starts_at && (
                    <div className={cn('mb-10 flex flex-wrap items-center gap-5 p-5', t.card)}>
                        <DateBadge value={post.event_starts_at} />
                        <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-3">
                            <div>
                                <dt className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-500 uppercase">
                                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Date
                                </dt>
                                <dd className="mt-1 font-bold text-slate-900">
                                    {start?.weekday}, {date(post.event_starts_at)}
                                    {post.event_ends_at && date(post.event_ends_at) !== date(post.event_starts_at) && ` – ${date(post.event_ends_at)}`}
                                </dd>
                            </div>
                            {start?.time && (
                                <div>
                                    <dt className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-500 uppercase">
                                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Time
                                    </dt>
                                    <dd className="mt-1 font-bold text-slate-900">
                                        {start.time}
                                        {end?.time && ` – ${end.time}`}
                                    </dd>
                                </div>
                            )}
                            {post.event_location && (
                                <div>
                                    <dt className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-500 uppercase">
                                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Venue
                                    </dt>
                                    <dd className="mt-1 font-bold text-slate-900">{post.event_location}</dd>
                                </div>
                            )}
                        </dl>
                    </div>
                )}

                <article>{post.body ? <Prose html={post.body} /> : post.excerpt && <p className="text-lg leading-relaxed text-slate-700">{post.excerpt}</p>}</article>
            </Section>

            {related.length > 0 && (
                <Section alt label="Related posts">
                    <SectionHeading eyebrow="Keep reading" title="Related posts" align="left" />
                    <NewsGrid posts={related} />
                </Section>
            )}
        </>
    );
}

export default function SitePost({ site, post, related }: { site: SiteChrome; post: Post; related: PostCard[] }) {
    const label = { news: 'News', event: 'Event', notice: 'Notice' }[post.type] ?? titleCase(post.type);
    return (
        <SiteLayout
            site={site}
            title={post.title}
            description={post.excerpt}
            hero={{ title: post.title, eyebrow: label, subtitle: post.published_at ? `Published ${date(post.published_at)}` : undefined }}
        >
            <PostContent site={site} post={post} related={related} />
        </SiteLayout>
    );
}

