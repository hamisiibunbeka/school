import { Head, Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import type { BreadcrumbItem } from '@/types';

/**
 * Page title + Vristo breadcrumb trail + right-aligned actions.
 * Also sets the document <title>.
 */
export default function PageHeader({
    title,
    subtitle,
    breadcrumbs = [],
    actions,
}: {
    title: string;
    subtitle?: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    actions?: ReactNode;
}) {
    return (
        <>
            <Head title={title} />
            <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <ul className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <li>
                            <Link href="/dashboard" className="text-primary hover:underline">
                                Home
                            </Link>
                        </li>
                        {breadcrumbs.map((b, i) => (
                            <li key={i} className="flex items-center gap-2 before:text-white-dark before:content-['/']">
                                {b.href ? (
                                    <Link href={b.href} className="text-primary hover:underline">
                                        {b.title}
                                    </Link>
                                ) : (
                                    <span className="text-white-dark">{b.title}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <h1 className="truncate text-xl font-extrabold text-black dark:text-white-light">{title}</h1>
                    {subtitle && <p className="mt-0.5 text-sm text-white-dark">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </>
    );
}
