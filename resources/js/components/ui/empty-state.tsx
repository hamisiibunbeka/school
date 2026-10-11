import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export default function EmptyState({ title = 'Nothing here yet', description, action }: { title?: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-4 grid h-16 w-16 place-content-center rounded-full bg-primary-light text-primary ring-8 ring-primary/5 dark:bg-primary-dark-light">
                <Inbox className="h-7 w-7" />
            </div>
            <p className="text-base font-bold text-black dark:text-white-light">{title}</p>
            {description && <p className="mt-1 max-w-sm text-sm text-white-dark">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
