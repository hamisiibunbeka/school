import type { HomeData, SiteChrome } from './_components/types';
import { HomePage, SiteLayout } from './_templates';

export default function SiteHome({ site, home }: { site: SiteChrome; home: HomeData }) {
    return (
        <SiteLayout site={site}>
            <HomePage site={site} home={home} />
        </SiteLayout>
    );
}
