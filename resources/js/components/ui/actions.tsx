import { Link, router } from '@inertiajs/react';
import { Eye, Pencil, Printer, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { confirm } from '@/lib/swal';
import { cn } from '@/lib/utils';

const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white-light/60 dark:hover:bg-[#1b2e4b]';

export function IconLink({ href, icon: Icon, title, className }: { href: string; icon: LucideIcon; title: string; className?: string }) {
    return (
        <Link href={href} title={title} className={cn(iconBtn, className)} onClick={(e) => e.stopPropagation()}>
            <Icon className="h-4 w-4" />
        </Link>
    );
}

export function IconButton({ onClick, icon: Icon, title, className }: { onClick: () => void; icon: LucideIcon; title: string; className?: string }) {
    return (
        <button
            type="button"
            title={title}
            className={cn(iconBtn, className)}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <Icon className="h-4 w-4" />
        </button>
    );
}

/** Deletes via router.delete after a confirmation dialog. */
export function DeleteButton({ href, label = 'record', title = 'Delete' }: { href: string; label?: string; title?: string }) {
    return (
        <IconButton
            title={title}
            icon={Trash2}
            className="text-danger"
            onClick={async () => {
                const { confirmed } = await confirm({ title: `Delete this ${label}?`, text: 'This action cannot be undone.', confirmText: 'Delete', danger: true });
                if (confirmed) router.delete(href, { preserveScroll: true });
            }}
        />
    );
}

/** Standard row actions: view / edit / delete (each optional). */
export function RowActions({ view, edit, onEdit, destroy, label, children }: { view?: string; edit?: string; onEdit?: () => void; destroy?: string; label?: string; children?: ReactNode }) {
    return (
        <div className="flex items-center justify-end gap-1">
            {children}
            {view && <IconLink href={view} icon={Eye} title="View" className="text-info" />}
            {edit && <IconLink href={edit} icon={Pencil} title="Edit" className="text-primary" />}
            {onEdit && <IconButton onClick={onEdit} icon={Pencil} title="Edit" className="text-primary" />}
            {destroy && <DeleteButton href={destroy} label={label} />}
        </div>
    );
}

export function PrintButton({ label = 'Print' }: { label?: string }) {
    return (
        <button type="button" className="btn btn-outline-dark no-print" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> {label}
        </button>
    );
}
