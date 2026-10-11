import { Banknote, CreditCard, Landmark, Smartphone, Ticket, type LucideIcon } from 'lucide-react';
import { cn, titleCase } from '@/lib/utils';

export const methodMeta: Record<string, { label: string; icon: LucideIcon; color: string; badge: string }> = {
    mobile_money: { label: 'Mobile money', icon: Smartphone, color: '#00ab55', badge: 'badge-soft-success' },
    bank: { label: 'Bank', icon: Landmark, color: '#4361ee', badge: 'badge-soft-primary' },
    cash: { label: 'Cash', icon: Banknote, color: '#e2a03f', badge: 'badge-soft-warning' },
    cheque: { label: 'Cheque', icon: Ticket, color: '#805dca', badge: 'badge-soft-secondary' },
    card: { label: 'Card', icon: CreditCard, color: '#2196f3', badge: 'badge-soft-info' },
};

export function MethodBadge({ method, className }: { method: string; className?: string }) {
    const meta = methodMeta[method];
    const Icon = meta?.icon ?? Banknote;
    return (
        <span className={cn('badge inline-flex items-center gap-1', meta?.badge ?? 'badge-soft-dark', className)}>
            <Icon className="h-3 w-3" />
            {meta?.label ?? titleCase(method)}
        </span>
    );
}

/** Thin progress bar showing paid / total. */
export function PaidBar({ paid, total, className }: { paid: string | number; total: string | number; className?: string }) {
    const t = Number(total);
    const pct = t > 0 ? Math.min(100, Math.round((Number(paid) / t) * 100)) : 100;
    const tone = pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-info' : pct > 0 ? 'bg-warning' : 'bg-danger';
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div className="h-1.5 w-full min-w-[60px] overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-9 text-end text-xs font-semibold text-white-dark">{pct}%</span>
        </div>
    );
}

export type Instructions = {
    banks: { bank: string; account_name: string; account_no: string | null }[];
    mobile: { provider: string; number: string | null; name: string }[];
    note: string;
};

/** "How to pay" box printed on invoices and statements. */
export function PaymentInstructionsBox({ instructions, reference }: { instructions: Instructions; reference?: string }) {
    return (
        <div className="rounded-md border border-dashed border-primary/40 bg-primary-light/40 p-4 text-sm dark:bg-primary-dark-light">
            <div className="mb-2 font-bold text-primary uppercase">How to pay</div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <div className="mb-1 flex items-center gap-1.5 font-semibold text-black dark:text-white-light">
                        <Landmark className="h-4 w-4" /> Bank deposit / transfer
                    </div>
                    <ul className="space-y-0.5 text-xs">
                        {instructions.banks.map((b) => (
                            <li key={b.bank + (b.account_no ?? '')}>
                                <strong>{b.bank}</strong> — A/C name: {b.account_name}
                                {b.account_no && <> · A/C no: {b.account_no}</>}
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    <div className="mb-1 flex items-center gap-1.5 font-semibold text-black dark:text-white-light">
                        <Smartphone className="h-4 w-4" /> Mobile money
                    </div>
                    <ul className="space-y-0.5 text-xs">
                        {instructions.mobile.map((m) => (
                            <li key={m.provider}>
                                <strong>{m.provider}</strong>
                                {m.number && <> — {m.number}</>} ({m.name})
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <p className="mt-3 text-xs text-white-dark">
                {reference && (
                    <>
                        Payment reference: <strong className="text-black dark:text-white-light">{reference}</strong>.{' '}
                    </>
                )}
                {instructions.note}
            </p>
        </div>
    );
}
