import { Head, Link } from '@inertiajs/react';

const messages: Record<number, { title: string; text: string }> = {
    403: { title: 'Access denied', text: 'You do not have permission to view this page. Ask your administrator if you need access.' },
    404: { title: 'Page not found', text: 'The page you are looking for does not exist or has been moved.' },
    500: { title: 'Something went wrong', text: 'An unexpected error occurred. The team has been notified.' },
    503: { title: 'Under maintenance', text: 'We are performing scheduled maintenance. Please check back shortly.' },
};

export default function ErrorPage({ status }: { status: number }) {
    const m = messages[status] ?? messages[500];
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fafafa] font-nunito dark:bg-[#060818]">
            <Head title={m.title} />
            <div className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-40 -bottom-40 h-[480px] w-[480px] rounded-full bg-[#ef1262]/15 blur-3xl" />
            <div className="relative px-6 py-16 text-center">
                <div className="bg-gradient-to-r from-[#EF1262] to-[#4361EE] bg-clip-text text-[120px] leading-none font-black text-transparent md:text-[180px]">{status}</div>
                <h1 className="mt-2 text-2xl font-extrabold text-black dark:text-white-light">{m.title}</h1>
                <p className="mx-auto mt-3 max-w-md text-base text-white-dark">{m.text}</p>
                <Link href="/dashboard" className="btn btn-gradient mx-auto mt-8 w-max">
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}
