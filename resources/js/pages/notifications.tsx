import { Link, router } from '@inertiajs/react';
import { Bell, CheckCheck } from 'lucide-react';
import EmptyState from '@/components/ui/empty-state';
import PageHeader from '@/components/ui/page-header';
import Pagination from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/types';

type Notification = { id: string; title: string; message: string; url: string | null; type: string; read_at: string | null; time: string };

const toneFor: Record<string, string> = {
    success: 'bg-success-light text-success dark:bg-success-dark-light',
    warning: 'bg-warning-light text-warning dark:bg-warning-dark-light',
    error: 'bg-danger-light text-danger dark:bg-danger-dark-light',
    info: 'bg-info-light text-info dark:bg-info-dark-light',
};

export default function Notifications({ notifications }: { notifications: Paginated<Notification> }) {
    return (
        <>
            <PageHeader
                title="Notifications"
                breadcrumbs={[{ title: 'Notifications' }]}
                actions={
                    <button className="btn btn-outline-primary" onClick={() => router.post('/notifications/read-all', {}, { preserveScroll: true })}>
                        <CheckCheck className="h-4 w-4" /> Mark all as read
                    </button>
                }
            />
            <div className="panel p-0">
                {notifications.data.length === 0 ? (
                    <EmptyState title="You're all caught up" description="New alerts about fees, attendance, approvals and announcements will appear here." />
                ) : (
                    <ul className="divide-y divide-white-light dark:divide-[#1b2e4b]">
                        {notifications.data.map((n) => (
                            <li key={n.id} className={cn('flex items-start gap-4 px-5 py-4', !n.read_at && 'bg-primary-light/30 dark:bg-primary-dark-light')}>
                                <span className={cn('grid h-10 w-10 shrink-0 place-content-center rounded-full', toneFor[n.type] ?? toneFor.info)}>
                                    <Bell className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-black dark:text-white-light">{n.title}</div>
                                    <div className="text-sm text-white-dark">{n.message}</div>
                                    {n.url && (
                                        <Link href={n.url} className="mt-1 inline-block text-xs font-bold text-primary hover:underline">
                                            Open →
                                        </Link>
                                    )}
                                </div>
                                <span className="shrink-0 text-xs text-white-dark">{n.time}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Pagination meta={notifications as Paginated<unknown>} />
        </>
    );
}
