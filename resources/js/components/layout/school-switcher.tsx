import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { router, usePage } from '@inertiajs/react';
import { Building, Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn, titleCase } from '@/lib/utils';

/**
 * Header school switcher. Tenant admins see their own schools; platform admins
 * (while inside a school) see every school grouped by tenant, with search.
 */
export default function SchoolSwitcher() {
    const { school, schools, auth } = usePage().props;
    const [query, setQuery] = useState('');
    const grouped = !!auth.user?.is_super_admin;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? schools.filter((s) => `${s.name} ${s.tenant ?? ''}`.toLowerCase().includes(q)) : schools;
    }, [schools, query]);

    const groups = useMemo(() => {
        const map = new Map<string, typeof schools>();
        filtered.forEach((s) => {
            const key = grouped ? (s.tenant ?? 'Other') : '';
            map.set(key, [...(map.get(key) ?? []), s]);
        });
        return [...map.entries()];
    }, [filtered, grouped]);

    const switchTo = (id: number, close: () => void) => {
        close();
        setQuery('');
        if (id !== school?.id) router.post('/switch-school', { school_id: id });
    };

    return (
        <Popover className="relative hidden md:block">
            {({ close }) => (
                <>
                    <PopoverButton
                        className="flex items-center gap-2 rounded-full border border-white-light px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary focus:outline-none dark:border-[#1b2e4b]"
                        title="Switch school"
                    >
                        <Building className="h-4 w-4" />
                        <span className="max-w-[160px] truncate">{school?.name ?? 'Select school'}</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                    </PopoverButton>
                    <PopoverPanel anchor={{ to: 'bottom end', gap: 8 }} className="dropdown-menu z-[70] w-80 py-0! focus:outline-none">
                        <div className="border-b border-white-light p-3 dark:border-[#253b5c]">
                            <div className="mb-2 text-xs font-bold text-white-dark uppercase">{grouped ? `Switch school · ${schools.length} schools` : 'Switch school'}</div>
                            {schools.length > 6 && (
                                <div className="relative">
                                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white-dark" />
                                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search school or tenant…" className="form-input form-input-sm ps-9" />
                                </div>
                            )}
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto py-1">
                            {groups.length === 0 && <div className="px-4 py-3 text-sm text-white-dark">No schools match “{query}”.</div>}
                            {groups.map(([tenant, items]) => (
                                <div key={tenant || 'all'}>
                                    {grouped && (
                                        <div className="flex items-center justify-between px-4 pt-2.5 pb-1 text-[11px] font-extrabold tracking-wide text-white-dark uppercase">
                                            <span className="truncate">{tenant}</span>
                                            {items[0]?.tenant_status && items[0].tenant_status !== 'active' && (
                                                <span className={cn('badge normal-case', items[0].tenant_status === 'trial' ? 'badge-soft-info' : 'badge-soft-danger')}>{titleCase(items[0].tenant_status)}</span>
                                            )}
                                        </div>
                                    )}
                                    {items.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => switchTo(s.id, close)}
                                            className={cn('dropdown-item justify-between text-sm', grouped && 'ps-6', s.id === school?.id && 'font-bold text-primary')}
                                        >
                                            <span className="truncate">{s.name}</span>
                                            {s.id === school?.id && <Check className="h-4 w-4 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </PopoverPanel>
                </>
            )}
        </Popover>
    );
}
