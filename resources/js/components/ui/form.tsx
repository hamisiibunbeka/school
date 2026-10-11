import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { Option } from '@/types';

/** Label + control + error message. Wrap any control in it. */
export function Field({
    label,
    error,
    help,
    required,
    className,
    children,
    htmlFor,
}: {
    label?: ReactNode;
    error?: string;
    help?: ReactNode;
    required?: boolean;
    className?: string;
    children: ReactNode;
    htmlFor?: string;
}) {
    return (
        <div className={cn(error && 'has-error', className)}>
            {label && (
                <label htmlFor={htmlFor}>
                    {label}
                    {required && <span className="ms-0.5 text-danger">*</span>}
                </label>
            )}
            {children}
            {help && !error && <p className="form-help">{help}</p>}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string; help?: ReactNode; wrapperClassName?: string };

export function Input({ label, error, help, wrapperClassName, className, required, id, ...props }: InputProps) {
    const inputId = id ?? (typeof props.name === 'string' ? props.name : undefined);
    return (
        <Field label={label} error={error} help={help} required={required} className={wrapperClassName} htmlFor={inputId}>
            <input id={inputId} required={required} className={cn('form-input', className)} {...props} />
        </Field>
    );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
    label?: ReactNode;
    error?: string;
    help?: ReactNode;
    options: (Option | string)[];
    placeholder?: string;
    wrapperClassName?: string;
};

export function Select({ label, error, help, options, placeholder, wrapperClassName, className, required, id, ...props }: SelectProps) {
    const selectId = id ?? (typeof props.name === 'string' ? props.name : undefined);
    return (
        <Field label={label} error={error} help={help} required={required} className={wrapperClassName} htmlFor={selectId}>
            <select id={selectId} required={required} className={cn('form-select', className)} {...props}>
                {placeholder !== undefined && <option value="">{placeholder}</option>}
                {options.map((o) => {
                    const opt = typeof o === 'string' ? { value: o, label: o } : o;
                    return (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    );
                })}
            </select>
        </Field>
    );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; error?: string; help?: ReactNode; wrapperClassName?: string };

export function Textarea({ label, error, help, wrapperClassName, className, required, id, rows = 3, ...props }: TextareaProps) {
    const textareaId = id ?? (typeof props.name === 'string' ? props.name : undefined);
    return (
        <Field label={label} error={error} help={help} required={required} className={wrapperClassName} htmlFor={textareaId}>
            <textarea id={textareaId} rows={rows} required={required} className={cn('form-textarea', className)} {...props} />
        </Field>
    );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
    return (
        <label className={cn('mb-0 inline-flex cursor-pointer items-center gap-2 font-semibold', className)}>
            <input type="checkbox" className="form-checkbox" {...props} />
            <span>{label}</span>
        </label>
    );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
    return (
        <label className="mb-0 inline-flex cursor-pointer items-center gap-3 font-semibold">
            <button type="button" role="switch" aria-checked={checked} data-checked={checked} className="switch" onClick={() => onChange(!checked)}>
                <span />
            </button>
            {label && <span>{label}</span>}
        </label>
    );
}

/** Responsive grid for form fields. */
export function FormGrid({ cols = 2, children, className }: { cols?: 1 | 2 | 3 | 4; children: ReactNode; className?: string }) {
    const map = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };
    return <div className={cn('grid grid-cols-1 gap-5', map[cols], className)}>{children}</div>;
}

/** Section heading inside a long form. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <div className="border-b border-white-light pb-6 last:border-0 last:pb-0 dark:border-[#1b2e4b]">
            <h6 className="mb-1 text-base font-bold text-black dark:text-white-light">{title}</h6>
            {description && <p className="mb-4 text-xs text-white-dark">{description}</p>}
            <div className={cn(!description && 'mt-4')}>{children}</div>
        </div>
    );
}
