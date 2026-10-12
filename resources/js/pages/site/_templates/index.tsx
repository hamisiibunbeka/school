import type { ReactNode } from 'react';
import type { HomeData, SiteChrome, TemplateKey } from '../_components/types';
import { ClassicCta, ClassicHome, ClassicLayout, ClassicPageHeader } from './classic';
import { MinimalCta, MinimalHome, MinimalLayout, MinimalPageHeader } from './minimal';
import { ModernCta, ModernHome, ModernLayout, ModernPageHeader } from './modern';
import { PlayfulCta, PlayfulHome, PlayfulLayout, PlayfulPageHeader } from './playful';
import { SiteShell } from './shell';

export { Container, Section, SectionHeading, useSite, useTheme } from './theme';

type HeaderProps = { title: string; subtitle?: string | null; eyebrow?: string; children?: ReactNode };

const registry: Record<
    TemplateKey,
    {
        Layout: (p: { site: SiteChrome; children: ReactNode }) => ReactNode;
        Header: (p: HeaderProps) => ReactNode;
        Home: (p: { site: SiteChrome; home: HomeData }) => ReactNode;
        Cta: (p: { site: SiteChrome }) => ReactNode;
    }
> = {
    modern: { Layout: ModernLayout, Header: ModernPageHeader, Home: ModernHome, Cta: ModernCta },
    classic: { Layout: ClassicLayout, Header: ClassicPageHeader, Home: ClassicHome, Cta: ClassicCta },
    minimal: { Layout: MinimalLayout, Header: MinimalPageHeader, Home: MinimalHome, Cta: MinimalCta },
    playful: { Layout: PlayfulLayout, Header: PlayfulPageHeader, Home: PlayfulHome, Cta: PlayfulCta },
};

const pick = (site: SiteChrome) => registry[site.template] ?? registry.modern;

/**
 * Wraps a public page in the school's chosen template: header, navigation,
 * footer, colours, fonts and (optionally) the template's page header.
 */
export function SiteLayout({
    site,
    children,
    title,
    description,
    hero,
}: {
    site: SiteChrome;
    children: ReactNode;
    /** Document title (the school name is appended). */
    title?: string;
    description?: string | null;
    /** Page header shown in the template's style. */
    hero?: HeaderProps;
}) {
    const { Layout, Header } = pick(site);
    return (
        <SiteShell site={site} title={title ?? hero?.title} description={description}>
            <Layout site={site}>
                {hero && <Header {...hero} />}
                {children}
            </Layout>
        </SiteShell>
    );
}

export function HomePage({ site, home }: { site: SiteChrome; home: HomeData }) {
    const { Home } = pick(site);
    return <Home site={site} home={home} />;
}

/** Admissions / contact call-to-action band in the template's style. */
export function CtaBand({ site }: { site: SiteChrome }) {
    const { Cta } = pick(site);
    return <Cta site={site} />;
}
