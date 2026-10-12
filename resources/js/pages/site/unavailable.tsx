import { Head } from '@inertiajs/react';
import { Construction, ShieldAlert } from 'lucide-react';

/** Shown when a school's website is not yet published (coming soon) or its subscription is suspended. */
export default function SiteUnavailable({ name, reason, logo_url }: { name: string; reason: 'coming_soon' | 'suspended'; logo_url?: string | null }) {
    const soon = reason === 'coming_soon';
    const Icon = soon ? Construction : ShieldAlert;
    return (
        <>
            <Head title={soon ? `${name} — coming soon` : name} />
            <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-6 py-16 text-center text-white">
                <div aria-hidden="true" className="absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-600/30 blur-3xl" />
                <div aria-hidden="true" className="absolute -right-40 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
                <div className="relative max-w-lg">
                    {logo_url ? (
                        <img src={logo_url} alt="" className="mx-auto h-20 w-20 rounded-2xl bg-white object-contain p-2" />
                    ) : (
                        <span className="mx-auto grid h-20 w-20 place-content-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                            <Icon className="h-10 w-10 text-indigo-300" aria-hidden="true" />
                        </span>
                    )}
                    <p className="mt-8 text-xs font-bold tracking-[0.3em] text-indigo-300 uppercase">{soon ? 'Coming soon' : 'Temporarily unavailable'}</p>
                    <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">{name}</h1>
                    <p className="mt-5 text-lg text-slate-300">
                        {soon ? 'Our new website is being prepared. Please check back shortly.' : 'This website is temporarily unavailable. Please contact the school directly.'}
                    </p>
                </div>
            </main>
        </>
    );
}
