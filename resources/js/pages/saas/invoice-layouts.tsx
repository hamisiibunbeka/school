import { router } from '@inertiajs/react';
import { Building2, LayoutTemplate, Undo2 } from 'lucide-react';
import type { InvoiceData, Layout } from '@/components/invoice-layout/schema';
import LayoutThumbnail from '@/components/invoice-layout/thumbnail';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { confirm } from '@/lib/swal';
import { dateTime } from '@/lib/utils';

type Row = {
    id: number;
    code: string;
    name: string;
    description: string | null;
    layout: Layout;
    is_active: boolean;
    school: { id: number; name: string; tenant: string | null } | null;
    claimed_at: string | null;
};

export default function SaasInvoiceLayouts({ templates, sample }: { templates: Row[]; sample: InvoiceData }) {
    const claimed = templates.filter((t) => t.school).length;

    const release = async (t: Row) => {
        const { confirmed } = await confirm({
            title: `Release “${t.name}” from ${t.school?.name}?`,
            text: 'The school loses its customised copy and goes back to the standard invoice format; the layout becomes available to every school again.',
            confirmText: 'Release',
            danger: true,
        });
        if (confirmed) router.post(`/saas/invoice-layouts/${t.id}/release`, {}, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader title="Invoice Layouts" subtitle="Sample invoice designs and the schools that own them" breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Invoice Layouts' }]} />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title="Samples in library" value={templates.length} icon={LayoutTemplate} tone="primary" />
                <StatCard title="Chosen by schools" value={claimed} icon={Building2} tone="success" hint="Exclusive to one school each" />
                <StatCard title="Still available" value={templates.length - claimed} icon={LayoutTemplate} tone="info" />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {templates.map((t) => (
                    <div key={t.id} className="panel flex flex-col p-3">
                        <div className="mb-3 flex justify-center rounded-md border border-white-light bg-[#f1f2f3] py-2 dark:border-[#1b2e4b] dark:bg-[#0e1726]">
                            <LayoutThumbnail layout={t.layout} data={sample} width={220} />
                        </div>
                        <div className="flex-1 px-1">
                            <div className="font-bold">{t.name}</div>
                            <div className="font-mono text-[11px] text-white-dark">{t.code}</div>
                            {t.school ? (
                                <div className="mt-2 rounded-md bg-success-light p-2 text-xs dark:bg-success-dark-light">
                                    <div className="font-bold text-success">{t.school.name}</div>
                                    <div className="text-white-dark">
                                        {t.school.tenant} · since {dateTime(t.claimed_at)}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2 text-xs text-white-dark">Available to all schools</div>
                            )}
                        </div>
                        {t.school && (
                            <button className="btn btn-sm btn-outline-danger mt-3" onClick={() => release(t)}>
                                <Undo2 className="h-3.5 w-3.5" /> Release
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}
