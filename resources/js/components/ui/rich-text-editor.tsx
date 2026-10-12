import { Bold, Heading2, Heading3, ImageIcon, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Underline, Undo2 } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight WYSIWYG editor for website content (no extra dependency).
 * Emits HTML; the server sanitises it with an allow-list before publishing.
 */
export default function RichTextEditor({ value, onChange, placeholder = 'Start writing…', minHeight = 220 }: { value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number }) {
    const ref = useRef<HTMLDivElement>(null);

    // Only push external value into the DOM when it differs (keeps the caret stable while typing).
    useEffect(() => {
        if (ref.current && ref.current.innerHTML !== (value || '')) {
            ref.current.innerHTML = value || '';
        }
    }, [value]);

    const exec = (command: string, arg?: string) => {
        ref.current?.focus();
        document.execCommand(command, false, arg);
        onChange(ref.current?.innerHTML ?? '');
    };

    const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
        <button
            type="button"
            title={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className="grid h-8 w-8 place-content-center rounded-md text-dark hover:bg-primary/10 hover:text-primary dark:text-white-dark"
        >
            {children}
        </button>
    );

    return (
        <div className="rounded-md border border-white-light focus-within:border-primary dark:border-[#17263c]">
            <div className="flex flex-wrap items-center gap-0.5 border-b border-white-light bg-[#fafafa] px-1.5 py-1 dark:border-[#17263c] dark:bg-[#121e32]">
                <Btn title="Heading" onClick={() => exec('formatBlock', '<h2>')}>
                    <Heading2 className="h-4 w-4" />
                </Btn>
                <Btn title="Sub-heading" onClick={() => exec('formatBlock', '<h3>')}>
                    <Heading3 className="h-4 w-4" />
                </Btn>
                <Btn title="Paragraph" onClick={() => exec('formatBlock', '<p>')}>
                    <span className="text-xs font-bold">P</span>
                </Btn>
                <span className="mx-1 h-5 w-px bg-white-light dark:bg-[#17263c]" />
                <Btn title="Bold" onClick={() => exec('bold')}>
                    <Bold className="h-4 w-4" />
                </Btn>
                <Btn title="Italic" onClick={() => exec('italic')}>
                    <Italic className="h-4 w-4" />
                </Btn>
                <Btn title="Underline" onClick={() => exec('underline')}>
                    <Underline className="h-4 w-4" />
                </Btn>
                <span className="mx-1 h-5 w-px bg-white-light dark:bg-[#17263c]" />
                <Btn title="Bulleted list" onClick={() => exec('insertUnorderedList')}>
                    <List className="h-4 w-4" />
                </Btn>
                <Btn title="Numbered list" onClick={() => exec('insertOrderedList')}>
                    <ListOrdered className="h-4 w-4" />
                </Btn>
                <Btn title="Quote" onClick={() => exec('formatBlock', '<blockquote>')}>
                    <Quote className="h-4 w-4" />
                </Btn>
                <Btn
                    title="Link"
                    onClick={() => {
                        const url = window.prompt('Link address (https://…)');
                        if (url) exec('createLink', url);
                    }}
                >
                    <Link2 className="h-4 w-4" />
                </Btn>
                <Btn
                    title="Image from URL"
                    onClick={() => {
                        const url = window.prompt('Image address (https://…)');
                        if (url) exec('insertImage', url);
                    }}
                >
                    <ImageIcon className="h-4 w-4" />
                </Btn>
                <span className="mx-1 h-5 w-px bg-white-light dark:bg-[#17263c]" />
                <Btn title="Clear formatting" onClick={() => exec('removeFormat')}>
                    <RemoveFormatting className="h-4 w-4" />
                </Btn>
                <Btn title="Undo" onClick={() => exec('undo')}>
                    <Undo2 className="h-4 w-4" />
                </Btn>
            </div>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                data-placeholder={placeholder}
                onInput={() => onChange(ref.current?.innerHTML ?? '')}
                onPaste={(e) => {
                    // Paste as plain text to avoid bringing in Word/Web styles.
                    e.preventDefault();
                    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
                }}
                className={cn(
                    'cms-prose max-w-none px-4 py-3 text-sm outline-none',
                    'empty:before:pointer-events-none empty:before:text-white-dark empty:before:content-[attr(data-placeholder)]',
                )}
                style={{ minHeight }}
            />
        </div>
    );
}
