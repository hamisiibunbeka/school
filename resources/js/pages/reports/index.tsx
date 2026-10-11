import { Link } from '@inertiajs/react';
import { ArrowRight, ExternalLink, FileBarChart, LayoutGrid, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/filters';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';
import { categoryTones, FavouriteStar, reportIcon, useFavourites } from './_components/report-kit';

type ReportCard = {
    key: string;
    title: string;
    description: string;
    category: string;
    icon: string;
    href: string;
    external: boolean;
};

type Category = { key: string; label: string; icon: string; description: string; reports: ReportCard[] };

type Props = { categories: Category[]; total: number };

export default function ReportsIndex({ categories, total }: Props) {
    const [search, setSearch] = useState('');
    const [active, setActive] = useState<string>('all');
    const { favourites, isFavourite, toggle } = useFavourites();

    const all = useMemo(() => categories.flatMap((c) => c.reports), [categories]);
    const term = search.trim().toLowerCase();
    const matches = (r: ReportCard) => !term || `${r.title} ${r.description}`.toLowerCase().includes(term);

    const visible = categories
        .filter((c) => active === 'all' || active === 'favourites' || c.key === active)
        .map((c) => ({ ...c, reports: c.reports.filter((r) => matches(r) && (active !== 'favourites' || isFavourite(r.key))) }))
        .filter((c) => c.reports.length > 0);

    const favouriteReports = all.filter((r) => favourites.includes(r.key) && matches(r));

    return (
        <>
            <PageHeader
                title="Reports & Analytics"
                subtitle="Standard reports across every module. Filter, print or export to CSV — every export is audited."
                breadcrumbs={[{ title: 'Reports' }]}
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Available reports" value={total} icon={FileBarChart} tone="primary" />
                <StatCard title="Categories" value={categories.length} icon={LayoutGrid} tone="info" />
                <StatCard title="Your favourites" value={favourites.filter((f) => all.some((r) => r.key === f)).length} icon={Star} tone="warning" />
                <StatCard title="Formats" value="Screen · Print · CSV" icon={ExternalLink} tone="success" />
            </div>

            <div className="panel mb-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <SearchInput value={search} onChange={setSearch} placeholder="Search reports…" className="sm:w-80" />
                    <div className="flex flex-wrap gap-2">
                        {[{ key: 'all', label: 'All' }, { key: 'favourites', label: '★ Favourites' }, ...categories.map((c) => ({ key: c.key, label: c.label }))].map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setActive(t.key)}
                                className={cn('btn btn-sm', active === t.key ? 'btn-primary' : 'btn-outline-primary')}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {active === 'all' && favouriteReports.length > 0 && (
                <section className="mb-8">
                    <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-black dark:text-white-light">
                        <Star className="h-4 w-4 fill-warning text-warning" /> Favourites
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {favouriteReports.map((r) => (
                            <ReportTile key={`fav-${r.key}`} report={r} favourite onToggle={() => toggle(r.key)} />
                        ))}
                    </div>
                </section>
            )}

            {visible.length === 0 ? (
                <div className="panel">
                    <EmptyState
                        title={active === 'favourites' ? 'No favourite reports yet' : 'No reports match your search'}
                        description={active === 'favourites' ? 'Tap the star on any report to pin it here.' : 'Try a different keyword or category.'}
                    />
                </div>
            ) : (
                visible.map((c) => {
                    const Icon = reportIcon(c.icon);
                    return (
                        <section key={c.key} className="mb-8">
                            <div className="mb-3 flex items-center gap-3">
                                <span className={cn('grid h-9 w-9 place-content-center rounded-lg', categoryTones[c.key])}>
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="text-base font-extrabold text-black dark:text-white-light">
                                        {c.label} <span className="ms-1 text-xs font-semibold text-white-dark">({c.reports.length})</span>
                                    </h2>
                                    <p className="text-xs text-white-dark">{c.description}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {c.reports.map((r) => (
                                    <ReportTile key={r.key} report={r} favourite={isFavourite(r.key)} onToggle={() => toggle(r.key)} />
                                ))}
                            </div>
                        </section>
                    );
                })
            )}
        </>
    );
}

function ReportTile({ report, favourite, onToggle }: { report: ReportCard; favourite: boolean; onToggle: () => void }) {
    const Icon = reportIcon(report.icon);
    return (
        <Link
            href={report.href}
            className="panel group relative flex h-full flex-col gap-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(67,97,238,0.45)]"
        >
            <div className="flex items-start justify-between gap-3">
                <span className={cn('grid h-11 w-11 shrink-0 place-content-center rounded-xl', categoryTones[report.category])}>
                    <Icon className="h-5 w-5" />
                </span>
                <FavouriteStar active={favourite} onClick={onToggle} className="-me-2 -mt-1" />
            </div>
            <div className="flex-1">
                <h3 className="font-bold text-black group-hover:text-primary dark:text-white-light">{report.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-white-dark">{report.description}</p>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold">
                {report.external ? <span className="badge badge-soft-info">Accounting module</span> : <span className="text-white-dark">Print · CSV</span>}
                <span className="flex items-center gap-1 text-primary opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
            </div>
        </Link>
    );
}
