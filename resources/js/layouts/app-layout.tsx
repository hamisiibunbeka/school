import { usePage } from '@inertiajs/react';
import { ArrowUp, ShieldAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import Footer from '@/components/layout/footer';
import Header from '@/components/layout/header';
import Sidebar from '@/components/layout/sidebar';
import { useFlashToast } from '@/hooks/use-flash-toast';

/** Vristo "DefaultLayout": vertical sidebar, sticky header, animated content area, footer. */
export default function AppLayout({ children }: { children: ReactNode }) {
    useFlashToast();
    const { school, auth } = usePage().props;
    const [showTop, setShowTop] = useState(false);

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
                        <div className="no-print flex items-center gap-2 bg-warning px-6 py-2 text-xs font-bold text-white">
                            <ShieldAlert className="h-4 w-4" /> Support session: you are viewing {school.name} as a platform administrator. All actions are audited.
                        </div>
                    )}
                    {school?.tenant_status === 'trial' && !auth.user?.is_super_admin && (
                        <div className="no-print bg-info-light px-6 py-2 text-xs font-semibold text-info dark:bg-info-dark-light">
                            You are on a free trial of the {school.plan ?? 'Starter'} plan. Upgrade from Administration → Subscription to keep access after the trial.
                        </div>
                    )}
                    <div className="animate-fade-in p-4 sm:p-6">{children}</div>
                    <Footer />
                </div>
            </div>
        </div>
    );
}
