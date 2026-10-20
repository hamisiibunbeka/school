import { Link, router, usePage } from '@inertiajs/react';
import { CheckCircle2, Eye, LayoutTemplate, Lock, Palette, Undo2 } from 'lucide-react';
import { useState } from 'react';
import InvoiceDocumentView from '@/components/invoice-layout/document';
import type { InvoiceData, Layout } from '@/components/invoice-layout/schema';
import LayoutThumbnail from '@/components/invoice-layout/thumbnail';
import EmptyState from '@/components/ui/empty-state';
import Modal from '@/components/ui/modal';
import { confirm } from '@/lib/swal';
import { dateTime } from '@/lib/utils';

type Template = { id: number; code: string; name: string; description: string | null; layout: Layout; mine: boolean };
export type InvoiceLayoutTabProps = {
    templates: Template[];
    taken: number;
    current: { template_id: number | null; template: string | null; layout: Layout; updated_at: string | null; updated_by: string | null } | null;
    sample: InvoiceData;
};

const BASE = '/admin/settings/invoice-layout';

/** School Settings → Invoice layout: the school's current layout and the library of samples it can choose from. */
export default function InvoiceLayoutTab({ data, manage }: { data: InvoiceLayoutTabProps; manage: boolean }) {
    const { templates, taken, current, sample } = data;
    const errors = usePage().props.errors as Record<string, string>;
    const [preview, setPreview] = useState<Template | null>(null);
    const available = templates.filter((t) => !t.mine);

    const claim = async (t: Template) => {
        const { confirmed } = await confirm({
            title: `Use “${t.name}” for your invoices?`,
            text: current
                ? `This replaces your current layout (“${current.template ?? 'custom'}”) and its customisations; that layout goes back to the library. “${t.name}” becomes exclusive to your school and disappears from other schools.`
                : `“${t.name}” becomes exclusive to your school and disappears from other schools. You can then customise it.`,
            confirmText: 'Approve & use',
        });
        if (confirmed) router.post(`${BASE}/${t.id}/claim`, {}, { preserveScroll: true, onSuccess: () => setPreview(null) });
    };

    const release = async () => {
        const { confirmed } = await confirm({
            title: 'Release your invoice layout?',
            text: 'Your customisations are discarded, the layout returns to the library for other schools, and invoices print in the standard format.',
            confirmText: 'Release layout',
            danger: true,
        });
        if (confirmed) router.post(`${BASE}/release`, {}, { preserveScroll: true });
    };

    return (
        <>
            {errors.template && <div className="mb-4 rounded-md bg-danger-light p-3 text-sm text-danger dark:bg-danger-dark-light">{errors.template}</div>}

            <div className="panel mb-6">
                {current ? (
                    <div className="flex flex-col gap-6 md:flex-row">
                        <div className="shrink-0 rounded-md border border-white-light p-2 dark:border-[#1b2e4b]">
                            <LayoutThumbnail layout={current.layout} data={sample} width={230} />
                        </div>
                        <div className="flex-1">
                            <div className="mb-1 flex items-center gap-2 text-xs font-bold text-success uppercase">
                                <CheckCircle2 className="h-4 w-4" /> Your school's invoice layout
                            </div>
                            <h3 className="text-2xl font-extrabold text-black dark:text-white-light">{current.template ?? 'Custom layout'}</h3>
                            <p className="mt-1 text-sm text-white-dark">
                                Exclusive to your school — no other school can choose it while you use it. Every invoice you open or print uses this design.
                            </p>
                            <p className="mt-2 text-xs text-white-dark">
                                {current.layout.blocks.filter((b) => b.visible).length} blocks · {current.layout.page.font} · {current.layout.page.paper}
                                {current.updated_at && (
                                    <>
                                        {' '}
                                        · last edited {dateTime(current.updated_at)}
                                        {current.updated_by && ` by ${current.updated_by}`}
                                    </>
                                )}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {manage && (
                                    <Link href={`${BASE}/designer`} className="btn btn-primary">
                                        <Palette className="h-4 w-4" /> Customise
                                    </Link>
                                )}
                                <Link href="/fees/invoices" className="btn btn-outline-primary">
                                    <Eye className="h-4 w-4" /> See it on an invoice
                                </Link>
                                {manage && (
                                    <button className="btn btn-outline-danger" onClick={release}>
                                        <Undo2 className="h-4 w-4" /> Release layout
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-3">
                        <LayoutTemplate className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                        <div className="text-sm">
                            <div className="font-bold text-black dark:text-white-light">Your invoices use the standard format.</div>
                            <div className="text-white-dark">
                                Pick a layout below. Choosing one approves it for your school; it then becomes exclusive to your school and can be customised — fonts, sizes, colours, block order,
                                extra sections.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h4 className="text-lg font-bold">Layout library</h4>
                    <p className="text-sm text-white-dark">
                        {available.length} available{taken > 0 && ` · ${taken} already taken by other schools`} · previews use sample data with your letterhead
                    </p>
                </div>
                {!manage && (
                    <span className="flex items-center gap-1.5 text-xs text-white-dark">
                        <Lock className="h-3.5 w-3.5" /> Only the school administrator can choose a layout
                    </span>
                )}
            </div>

            {available.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No layouts available" description="Every sample is in use by a school. Customise your current layout instead, or contact support." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {available.map((t) => (
                        <div key={t.id} className="panel flex flex-col p-3">
                            <button type="button" className="group relative mb-3 overflow-hidden rounded-md border border-white-light dark:border-[#1b2e4b]" onClick={() => setPreview(t)} title="Preview">
                                <div className="flex justify-center bg-[#f1f2f3] py-2 dark:bg-[#0e1726]">
                                    <LayoutThumbnail layout={t.layout} data={sample} width={240} />
                                </div>
                                <span className="absolute inset-0 grid place-content-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                                    <Eye className="h-8 w-8" />
                                </span>
                            </button>
                            <div className="flex-1 px-1">
                                <div className="font-bold text-black dark:text-white-light">{t.name}</div>
                                <div className="mt-0.5 text-xs text-white-dark">{t.description}</div>
                                <div className="mt-1 text-[11px] text-white-dark">
                                    {t.layout.page.font} · {t.layout.page.paper}
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2 px-1">
                                <button className="btn btn-sm btn-outline-primary flex-1" onClick={() => setPreview(t)}>
                                    <Eye className="h-3.5 w-3.5" /> Preview
                                </button>
                                {manage && (
                                    <button className="btn btn-sm btn-primary flex-1" onClick={() => claim(t)}>
                                        Use this
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ''} size="full">
                {preview && (
                    <>
                        <p className="mb-4 text-sm text-white-dark">{preview.description}</p>
                        <div className="overflow-x-auto rounded-md bg-[#f1f2f3] p-4 dark:bg-[#0e1726]">
                            <InvoiceDocumentView layout={preview.layout} data={sample} />
                        </div>
                        <div className="mt-4 flex justify-center gap-3">
                            <button className="btn btn-outline-dark" onClick={() => setPreview(null)}>
                                Close
                            </button>
                            {manage && (
                                <button className="btn btn-primary" onClick={() => claim(preview)}>
                                    Approve &amp; use for my school
                                </button>
                            )}
                        </div>
                    </>
                )}
            </Modal>
        </>
    );
}
