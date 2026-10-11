import { usePage } from '@inertiajs/react';
import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * School letterhead used on printable documents (receipts, invoices,
 * report cards, statements, financial reports).
 */
export default function Letterhead({ title, meta }: { title?: ReactNode; meta?: ReactNode }) {
    const { school, name } = usePage().props;
    return (
        <div className="mb-6 border-b-2 border-primary pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {school?.logo_url ? (
                        <img src={school.logo_url} alt="logo" className="h-16 w-16 rounded-md object-cover" />
                    ) : (
                        <span className="grid h-16 w-16 place-content-center rounded-xl bg-gradient-to-br from-primary to-[#805dca] text-white">
                            <GraduationCap className="h-8 w-8" />
                        </span>
                    )}
                    <div>
                        <div className="text-xl font-extrabold text-black uppercase dark:text-white-light">{school?.name ?? name}</div>
                        {school?.motto && <div className="text-xs font-semibold text-white-dark italic">“{school.motto}”</div>}
                    </div>
                </div>
                {meta && <div className="text-end text-xs">{meta}</div>}
            </div>
            {title && <div className="mt-4 text-center text-lg font-extrabold tracking-wide text-primary uppercase">{title}</div>}
        </div>
    );
}
