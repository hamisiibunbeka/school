import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabItem = { key: string; label: string; icon?: LucideIcon; count?: number };

/** Underlined tab strip (Vristo style). Control the active key from the parent. */
export default function Tabs({ tabs, active, onChange, className }: { tabs: TabItem[]; active: string; onChange: (key: string) => void; className?: string }) {
    return (
        <div className={cn('no-print mb-5 flex overflow-x-auto border-b border-white-light dark:border-[#191e3a]', className)}>
            {tabs.map((t) => {
                const Icon = t.icon;
                return (
                    <button key={t.key} type="button" onClick={() => onChange(t.key)} className={cn('tab-btn', active === t.key && 'active')}>
                        {Icon && <Icon className="h-4 w-4" />}
                        {t.label}
                        {t.count !== undefined && <span className="badge badge-soft-primary rounded-full!">{t.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}
