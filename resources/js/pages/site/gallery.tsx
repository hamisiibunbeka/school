import { Link } from '@inertiajs/react';
import { Images } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, GalleryGrid } from './_components/blocks';
import type { GalleryImage, SiteChrome } from './_components/types';
import { Section, SiteLayout, useTheme } from './_templates';

function GalleryContent({ site, images, albums, album }: { site: SiteChrome; images: GalleryImage[]; albums: (string | null)[]; album: string | null }) {
    const t = useTheme();
    const named = albums.filter((a): a is string => !!a);
    const chip = (active: boolean) =>
        cn(
            'inline-flex items-center px-4 py-2 text-sm font-bold transition',
            t.key === 'minimal' ? 'border-b-2' : t.key === 'classic' ? 'rounded-sm border' : t.key === 'playful' ? 'rounded-full border-[3px] border-slate-900' : 'rounded-full border',
            active
                ? t.key === 'minimal'
                    ? 'border-[var(--site-primary)] text-neutral-950'
                    : 'border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-on-primary)]'
                : t.key === 'minimal'
                  ? 'border-transparent text-neutral-500 hover:text-neutral-950'
                  : 'border-slate-200 bg-white text-slate-700 hover:text-[var(--site-primary)]',
            t.key === 'playful' && !active && 'border-slate-900',
        );

    return (
        <Section>
            {named.length > 1 && (
                <nav aria-label="Albums" className="mb-10">
                    <ul className="flex flex-wrap gap-2">
                        <li>
                            <Link href={`${site.base}/gallery`} preserveScroll className={chip(!album)} aria-current={!album ? 'page' : undefined}>
                                All photos
                            </Link>
                        </li>
                        {named.map((a) => (
                            <li key={a}>
                                <Link href={`${site.base}/gallery?album=${encodeURIComponent(a)}`} preserveScroll className={chip(album === a)} aria-current={album === a ? 'page' : undefined}>
                                    {a}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            )}
            {images.length ? (
                <GalleryGrid images={images} />
            ) : (
                <EmptyState icon={Images} title="No photos yet" text="Our photo gallery is being prepared — please check back soon." />
            )}
        </Section>
    );
}

export default function SiteGallery({ site, images, albums, album }: { site: SiteChrome; images: GalleryImage[]; albums: (string | null)[]; album: string | null }) {
    return (
        <SiteLayout site={site} hero={{ title: album ?? 'Gallery', subtitle: 'Moments from classrooms, sports, events and celebrations.', eyebrow: album ? 'Album' : 'Life at school' }}>
            <GalleryContent site={site} images={images} albums={albums} album={album} />
        </SiteLayout>
    );
}
