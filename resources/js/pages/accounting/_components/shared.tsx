import { History } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import StatusBadge from '@/components/ui/status-badge';
import { dateTime, titleCase } from '@/lib/utils';

export type Audit = { id: number; action: string; description: string; user: string | null; reason: string | null; created_at: string | null };

export function AuditTrail({ audits }: { audits: Audit[] }) {
    return (
        <div className="panel no-print">
            <h5 className="mb-4 flex items-center gap-2 text-lg font-bold text-black dark:text-white-light">
                <History className="h-5 w-5 text-primary" /> Audit trail
            </h5>
            {audits.length === 0 ? (
                <p className="text-sm text-white-dark">No audit entries yet.</p>
            ) : (
                <ol className="relative space-y-4 border-s border-white-light ps-5 dark:border-[#1b2e4b]">
                    {audits.map((a) => (
                        <li key={a.id} className="relative">
                            <span className="absolute -start-[25px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary-light dark:ring-primary-dark-light" />
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <StatusBadge status={a.action} label={titleCase(a.action)} />
                                <span className="font-semibold text-black dark:text-white-light">{a.user ?? 'System'}</span>
                                <span className="text-xs text-white-dark">{dateTime(a.created_at)}</span>
                            </div>
                            <div className="mt-1 text-sm text-white-dark">{a.description}</div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

export function Signature({ label, name, sub }: { label: string; name: string | null; sub: string }) {
    return (
        <div>
            <div className="mb-1 h-6 font-semibold text-black dark:text-white-light">{name ?? ''}</div>
            <div className="border-t border-dashed border-white-dark pt-1 font-bold uppercase">{label}</div>
            <div className="text-white-dark">{sub}</div>
        </div>
    );
}

export function Meta({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <div className="text-xs font-bold tracking-wide text-white-dark uppercase">{label}</div>
            <div className="mt-0.5 font-semibold text-black dark:text-white-light">{value}</div>
        </div>
    );
}

const bannerTones = {
    info: 'border-info/30 bg-info-light text-info dark:bg-info-dark-light',
    danger: 'border-danger/30 bg-danger-light text-danger dark:bg-danger-dark-light',
    warning: 'border-warning/30 bg-warning-light text-warning dark:bg-warning-dark-light',
    secondary: 'border-secondary/30 bg-secondary-light text-secondary dark:bg-secondary-dark-light',
    success: 'border-success/30 bg-success-light text-success dark:bg-success-dark-light',
};

export function Banner({ tone, icon: Icon, title, children }: { tone: keyof typeof bannerTones; icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
    return (
        <div className={`flex items-start gap-3 rounded-md border p-4 ${bannerTones[tone]}`}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
                <div className="font-bold">{title}</div>
                <div className="text-sm">{children}</div>
            </div>
        </div>
    );
}
