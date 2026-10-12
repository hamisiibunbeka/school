import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

/** Vristo-styled modal: coloured title bar, scrollable body, optional footer. */
export default function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    size = 'md',
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    size?: keyof typeof sizes;
}) {
    return (
        <Dialog open={open} onClose={onClose} className="relative z-[60]">
            <div className="fixed inset-0 bg-[black]/60 transition-opacity duration-200 data-[closed]:opacity-0" />
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-start justify-center px-4 py-8">
                    <DialogPanel
                        transition
                        className={cn(
                            'panel my-8 w-full overflow-hidden rounded-lg border-0 p-0 text-black transition duration-200 data-[closed]:translate-y-3 data-[closed]:opacity-0 dark:text-white-dark',
                            sizes[size],
                        )}
                    >
                        <div className="flex items-center justify-between bg-[#fbfbfb] px-5 py-3 dark:bg-[#121c2c]">
                            <DialogTitle as="h5" className="text-lg font-bold">
                                {title}
                            </DialogTitle>
                            <button type="button" onClick={onClose} className="text-white-dark hover:text-dark" aria-label="Close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-5">{children}</div>
                        {footer && <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white-light px-5 py-3 dark:border-[#1b2e4b]">{footer}</div>}
                    </DialogPanel>
                </div>
            </div>
        </Dialog>
    );
}
