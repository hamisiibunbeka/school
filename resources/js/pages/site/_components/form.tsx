import { AlertCircle } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '../_templates/theme';

export type FieldControlProps = {
    id: string;
    name?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
};

/** Accessible label + control + hint + error, styled by the active template. */
export function Field({
    label,
    required,
    error,
    hint,
    className,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string;
    hint?: ReactNode;
    className?: string;
    children: (props: FieldControlProps) => ReactNode;
}) {
    const t = useTheme();
    const id = useId();
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
    return (
        <div className={className} data-field-error={error ? 'true' : undefined}>
            <label htmlFor={id} className={t.labelCls}>
                {label}
                {required ? (
                    <span className="ml-0.5 text-rose-600" aria-hidden="true">
                        *
                    </span>
                ) : (
                    <span className="ml-1.5 text-xs font-normal tracking-normal text-slate-400 normal-case">(optional)</span>
                )}
            </label>
            <div className={cn(error && '[&_input]:border-rose-400 [&_select]:border-rose-400 [&_textarea]:border-rose-400')}>
                {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })}
            </div>
            {hint && !error && (
                <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
                    {hint}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-bold text-rose-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
                </p>
            )}
        </div>
    );
}

/** Invisible field bots fill in; the server silently drops submissions that include it. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden opacity-0">
            <label htmlFor="site-website-field">Leave this field empty</label>
            <input id="site-website-field" type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
    );
}
