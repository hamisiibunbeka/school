import { Link } from '@inertiajs/react';
import { Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, EventList, NewsCard, NoticeList, Pagination } from './_components/blocks';
import type { EventItem, Notice, Paginated, PostCard, SiteChrome } from './_components/types';
import { Reveal } from './_components/ui';
import { Section, SiteLayout, useTheme } from './_templates';

const filters: { value: string | null; label: string }[] = [
    { value: null, label: 'All' },
    { value: 'news', label: 'News' },
    { value: 'event', label: 'Events' },
    { value: 'notice', label: 'Notices' },
];

function NewsContent({ site, posts, type, events, notices }: { site: SiteChrome; posts: Paginated<PostCard>; type: string | null; events: EventItem[]; notices: Notice[] }) {
    const t = useTheme();
    const hasSidebar = events.length > 0 || notices.length > 0;
    return (
        <Section>
            <nav aria-label="Filter posts" className="mb-10">
                <ul className="flex flex-wrap gap-2">
                    {filters.map((f) => {
                        const active = f.value === type;
                        return (
                            <li key={f.label}>
                                <Link
                                    href={f.value ? `${site.base}/news?type=${f.value}` : `${site.base}/news`}
                                    aria-current={active ? 'page' : undefined}
                                    preserveScroll
                                    className={cn(
                                        'inline-flex items-center px-4 py-2 text-sm font-bold transition',
                                        t.key === 'minimal' ? 'border-b-2' : t.key === 'classic' ? 'rounded-sm border' : t.key === 'playful' ? 'rounded-full border-[3px] border-slate-900' : 'rounded-full border',
                                        active
                                            ? t.key === 'minimal'
                                                ? 'border-[var(--site-primary)] text-neutral-950'
                                                : 'border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-on-primary)]'
                                            : t.key === 'minimal'
                                              ? 'border-transparent text-neutral-500 hover:text-neutral-950'
                                              : 'border-slate-200 bg-white text-slate-700 hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]',
                                        t.key === 'playful' && !active && 'border-slate-900',
                                    )}
                                >
                                    {f.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div className={cn('grid gap-12', hasSidebar && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
                <div>
                    {posts.data.length === 0 ? (
                        <EmptyState icon={Newspaper} title="Nothing here yet" text="There are no published posts in this category. Please check back soon." />
                    ) : (
                        <>
                            <div className={cn('grid gap-6 sm:grid-cols-2', !hasSidebar && 'lg:grid-cols-3')}>
                                {posts.data.map((p, i) => (
                                    <Reveal key={p.slug} enabled={t.reveal} delay={(i % 3) * 70}>
                                        <NewsCard post={p} />
                                    </Reveal>
                                ))}
                            </div>
                            <Pagination paginator={posts} />
                        </>
                    )}
                </div>
                {hasSidebar && (
                    <aside className="space-y-10">
                        {events.length > 0 && (
                            <div>
                                <h2 className={cn(t.heading, 'mb-4 text-xl')}>Upcoming events</h2>
                                <EventList events={events} compact />
                            </div>
                        )}
                        {notices.length > 0 && (
                            <div>
                                <h2 className={cn(t.heading, 'mb-4 text-xl')}>Notice board</h2>
                                <NoticeList notices={notices} />
                            </div>
                        )}
                    </aside>
                )}
            </div>
        </Section>
    );
}

export default function SiteNews({ site, posts, type, events, notices }: { site: SiteChrome; posts: Paginated<PostCard>; type: string | null; events: EventItem[]; notices: Notice[] }) {
    const label = filters.find((f) => f.value === type)?.label;
    return (
        <SiteLayout site={site} hero={{ title: 'News & Events', subtitle: 'Stories, achievements, announcements and dates for your diary.', eyebrow: type ? label : 'Stay informed' }}>
            <NewsContent site={site} posts={posts} type={type} events={events} notices={notices} />
        </SiteLayout>
    );
}
