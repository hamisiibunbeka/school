import { Link, usePage } from '@inertiajs/react';
import { Lock } from 'lucide-react';
import PageTitle from '@/components/ui/page-title';

export default function SubscriptionSuspended() {
    const { school } = usePage().props;
    return (
        <>
            <PageTitle title="Subscription suspended" />
            <div className="text-center">
                <span className="mx-auto mb-5 grid h-16 w-16 place-content-center rounded-full bg-danger-light text-danger ring-8 ring-danger/10 dark:bg-danger-dark-light">
                    <Lock className="h-7 w-7" />
                </span>
                <h1 className="text-2xl font-extrabold text-black dark:text-white-light">Access temporarily suspended</h1>
                <p className="mt-3 text-white-dark">
                    The subscription for <strong>{school?.tenant ?? 'your school'}</strong> is {school?.tenant_status}. Your data is safe and retained. Please contact the platform team to renew
                    or reactivate the account.
                </p>
                <Link href="/logout" method="post" as="button" className="btn btn-primary mx-auto mt-8">
                    Sign out
                </Link>
            </div>
        </>
    );
}
