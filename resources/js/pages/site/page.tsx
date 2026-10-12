import { cn } from '@/lib/utils';
import type { SiteChrome } from './_components/types';
import { Prose, SiteImage } from './_components/ui';
import { Section, SiteLayout, useTheme } from './_templates';

type CmsPage = { title: string; summary: string | null; body: string | null; cover_url: string | null };

function PageContent({ page }: { page: CmsPage }) {
    const t = useTheme();
    return (
        <Section narrow>
            {page.cover_url && <SiteImage src={page.cover_url} alt={page.title} className={cn('mb-10 aspect-[16/9] w-full', t.imgRadius, t.key === 'playful' && 'border-[3px] border-slate-900')} />}
            {page.body ? <Prose html={page.body} /> : <p className="text-lg text-slate-600">This page is being updated. Please check back soon.</p>}
        </Section>
    );
}

export default function SitePage({ site, page }: { site: SiteChrome; page: CmsPage }) {
    return (
        <SiteLayout site={site} description={page.summary} hero={{ title: page.title, subtitle: page.summary }}>
            <PageContent page={page} />
        </SiteLayout>
    );
}
