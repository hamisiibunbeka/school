import { router, usePage } from '@inertiajs/react';
import { ArrowLeftRight, ArrowUp, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Footer from '@/components/layout/footer';
import Header from '@/components/layout/header';
import Sidebar from '@/components/layout/sidebar';
import { useFlashToast } from '@/hooks/use-flash-toast';
import { cn } from '@/lib/utils';

/**
 * True while an Inertia request is in flight (after a short delay, so fast
 * responses don't flicker). Prefetches and background polls are ignored.
 */
function usePageLoading(delay = 180) {
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const active = useRef(0);

    useEffect(() => {
        const offStart = router.on('start', (event) => {
            const visit = (event as CustomEvent).detail?.visit as { prefetch?: boolean; async?: boolean } | undefined;
            if (visit?.prefetch || visit?.async) return;
            active.current++;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setLoading(true), delay);
        });
        const offFinish = router.on('finish', () => {
            active.current = Math.max(0, active.current - 1);
            if (active.current === 0) {
                if (timer.current) clearTimeout(timer.current);
                setLoading(false);
            }
        });
        return () => {
            offStart();
            offFinish();
            if (timer.current) clearTimeout(timer.current);
        };
    }, [delay]);

    return loading;
}

/** Vristo "DefaultLayout": vertical sidebar, sticky header, animated content area, footer. */
export default function AppLayout({ children }: { children: ReactNode }) {
    useFlashToast();
    const { school, auth } = usePage().props;
    const [showTop, setShowTop] = useState(false);
    const loading = usePageLoading();

    useEffect(() => {
        const onScroll = () => setShowTop(document.documentElement.scrollTop > 50);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="main-section relative font-nunito text-sm font-normal antialiased">
            <div className="fixed end-6 bottom-6 z-50">
                {showTop && (
                    <button
                        type="button"
                        className="btn btn-outline-primary animate-pulse rounded-full bg-[#fafafa] p-2 dark:bg-[#060818] dark:hover:bg-primary"
                        onClick={() => window.scrollTo({ top: 0 })}
                    >
                        <ArrowUp className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="main-container min-h-screen text-black dark:text-white-dark">
                <Sidebar />
                <div className="main-content">
                    <Header />
                    {auth.user?.is_super_admin && school && (
                        <div className="no-print flex flex-wrap items-center gap-2 bg-warning px-6 py-2 text-xs font-bold text-white">
                            <ShieldAlert className="h-4 w-4" /> Support session: you are viewing {school.name} as a platform administrator. All actions are audited.
                            <button
                                type="button"
                                onClick={() => router.post('/switch-school', { school_id: null })}
                                className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 hover:bg-white/30"
                            >
                                <ArrowLeftRight className="h-3.5 w-3.5" /> Back to platform
                            </button>
                        </div>
                    )}
                    {school?.tenant_status === 'trial' && !auth.user?.is_super_admin && (
                        <div className="no-print bg-info-light px-6 py-2 text-xs font-semibold text-info dark:bg-info-dark-light">
                            You are on a free trial of the {school.plan ?? 'Starter'} plan. Upgrade from Administration → Subscription to keep access after the trial.
                        </div>
                    )}

                    {/* Page body: dims with a spinner while loading; sidebar and navbar stay as they are. */}
                    <div className="relative flex-1" aria-busy={loading}>
                        <div className={cn('animate-fade-in p-4 transition-opacity duration-200 sm:p-6', loading && 'pointer-events-none opacity-40 select-none')}>{children}</div>
                        {loading && (
                            <div className="pointer-events-none absolute inset-0 z-20">
                                <div className="sticky top-[45vh] flex justify-center">
                                    <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-[0_10px_30px_-10px_rgba(67,97,238,0.5)] dark:bg-[#1b2e4b]">
                                        <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
                                        <span className="text-sm font-bold text-black dark:text-white-light">Loading…</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <Footer />
                </div>
            </div>
        </div>
    );
}
