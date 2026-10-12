import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Children, isValidElement, useMemo, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SearchOption = { value: string; label: string; disabled?: boolean; group?: string };

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string };

function textOf(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
    return '';
}

/** Read <option>/<optgroup> children (including mapped arrays and fragments) into plain options. */
function optionsFromChildren(children: ReactNode, group?: string): SearchOption[] {
    const out: SearchOption[] = [];
    Children.toArray(children).forEach((child) => {
        if (!isValidElement(child)) return;
        const el = child as ReactElement<OptionProps>;
        if (el.type === 'option') {
            const label = textOf(el.props.children) || String(el.props.value ?? '');
            out.push({ value: String(el.props.value ?? label), label, disabled: el.props.disabled, group });
        } else if (el.type === 'optgroup') {
            out.push(...optionsFromChildren(el.props.children, el.props.label));
        } else if (el.props.children) {
            out.push(...optionsFromChildren(el.props.children, group));
        }
    });
    return out;
}

const normalise = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAX_RENDERED = 300;

type SearchSelectProps = {
    value?: string | number | null;
    /** Native-compatible: receives an event-like object whose target.value is the chosen option value. */
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
    onValueChange?: (value: string) => void;
    options?: SearchOption[];
    children?: ReactNode;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    title?: string;
    'aria-label'?: string;
};

/**
 * Searchable dropdown — a drop-in replacement for `<select>`.
 * Accepts the same `<option>` children (or an `options` array), `value`
 * and `onChange(e => e.target.value)`; users can type to filter the list.
 */
export default function SearchSelect({ value, onChange, onValueChange, options, children, placeholder, className, disabled, required, name, id, title, ...rest }: SearchSelectProps) {
    const [query, setQuery] = useState('');

    const all = useMemo(() => options ?? optionsFromChildren(children), [options, children]);
    const current = value === null || value === undefined ? '' : String(value);
    const selected = all.find((o) => o.value === current) ?? null;
    // An empty-value option ("All classes", "Select…") acts as the placeholder.
    const emptyOption = all.find((o) => o.value === '');
    const placeholderText = placeholder ?? emptyOption?.label ?? 'Select…';

    const filtered = useMemo(() => {
        const q = normalise(query.trim());
        if (!q) return all;
        const words = q.split(/\s+/);
        return all.filter((o) => {
            const hay = normalise(`${o.label} ${o.group ?? ''}`);
            return words.every((w) => hay.includes(w));
        });
    }, [all, query]);

    const emit = (next: string) => {
        if (next === current) return;
        onChange?.({ target: { value: next, name: name ?? '' }, currentTarget: { value: next, name: name ?? '' } } as unknown as ChangeEvent<HTMLSelectElement>);
        onValueChange?.(next);
    };

    let lastGroup: string | undefined;

    return (
        <Combobox
            as="div"
            className="w-full"
            value={selected}
            onChange={(o: SearchOption | null) => o && emit(o.value)}
            onClose={() => setQuery('')}
            disabled={disabled}
            immediate
            by={(a: SearchOption | null, b: SearchOption | null) => a?.value === b?.value}
        >
            {({ open }) => (
                <>
                    <div className="relative w-full" title={title}>
                        {/* While open, the field becomes a search box (magnifier + "Search…" placeholder). */}
                        {open && <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />}
                        <ComboboxInput
                            id={id}
                            aria-label={rest['aria-label']}
                            autoComplete="off"
                            required={required && !current}
                            className={cn('form-select cursor-pointer bg-none! pe-9 text-start', open && 'border-primary ps-9!', className)}
                            displayValue={(o: SearchOption | null) => (o && o.value !== '' ? o.label : '')}
                            placeholder={open ? 'Type to search…' : selected && selected.value === '' ? selected.label : placeholderText}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                        />
                        <ComboboxButton className="absolute inset-y-0 end-0 flex items-center pe-2.5 text-white-dark" aria-label="Show options">
                            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                        </ComboboxButton>
                        {name && <input type="hidden" name={name} value={current} />}
                    </div>
                    <ComboboxOptions
                        anchor={{ to: 'bottom start', gap: 4 }}
                        transition
                        className="z-[90] max-h-72 min-w-(--input-width) overflow-y-auto rounded-md bg-white py-1 text-sm text-black shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] ring-1 ring-black/5 transition duration-100 ease-out empty:invisible data-[closed]:opacity-0 dark:bg-[#1b2e4b] dark:text-white-dark"
                    >
                        {all.length > 3 && (
                            <div className="flex items-center gap-2 border-b border-white-light px-3 py-1.5 text-xs text-white-dark dark:border-[#253b5c]">
                                <Search className="h-3.5 w-3.5" />
                                {query ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `Type to search ${all.filter((o) => o.value !== '').length} options`}
                            </div>
                        )}
                        {filtered.length === 0 && <div className="px-4 py-2.5 text-white-dark">No matches for “{query}”</div>}
                        {filtered.slice(0, MAX_RENDERED).map((o) => {
                            const header = o.group && o.group !== lastGroup ? o.group : null;
                            lastGroup = o.group;
                            return (
                                <div key={`${o.group ?? ''}:${o.value}`}>
                                    {header && <div className="px-3 pt-2 pb-1 text-[11px] font-extrabold tracking-wide text-white-dark uppercase">{header}</div>}
                                    <ComboboxOption
                                        value={o}
                                        disabled={o.disabled}
                                        className={cn(
                                            'flex cursor-pointer items-center justify-between gap-3 px-4 py-2 select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[focus]:bg-primary/10 data-[focus]:text-primary',
                                            o.value === '' && 'text-white-dark italic',
                                            o.group && 'ps-6',
                                        )}
                                    >
                                        <span className="truncate">{o.label}</span>
                                        {o.value === current && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                    </ComboboxOption>
                                </div>
                            );
                        })}
                        {filtered.length > MAX_RENDERED && <div className="px-4 py-2 text-xs text-white-dark">Showing first {MAX_RENDERED} — keep typing to narrow down.</div>}
                    </ComboboxOptions>
                </>
            )}
        </Combobox>
    );
}
