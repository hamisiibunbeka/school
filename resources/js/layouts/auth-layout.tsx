import { usePage } from '@inertiajs/react';
import { BookOpenCheck, CalendarCheck, GraduationCap, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFlashToast } from '@/hooks/use-flash-toast';

/** Vristo "Login Cover" layout: gradient brand panel + glass form panel. */
export default function AuthLayout({ children }: { children: ReactNode }) {
    useFlashToast();
    const { name } = usePage().props;

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#fafafa] font-nunito dark:bg-[#060818]">
            {/* decorative background */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -right-40 -bottom-40 h-[480px] w-[480px] rounded-full bg-[#ef1262]/15 blur-3xl" />
                <svg className="absolute inset-0 h-full w-full opacity-[0.04] dark:opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
            </div>

            <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-10">
                <div className="relative flex w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl bg-white/70 shadow-[0_30px_80px_-30px_rgba(67,97,238,0.35)] backdrop-blur-lg lg:min-h-[680px] lg:flex-row dark:bg-black/50">
                    {/* brand panel */}
                    <div className="relative hidden w-full items-center justify-center overflow-hidden bg-[linear-gradient(225deg,rgba(239,18,98,1)_0%,rgba(67,97,238,1)_100%)] p-10 text-white lg:flex lg:max-w-[560px]">
                        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full border-[40px] border-white/10" />
                        <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full border-[50px] border-white/10" />
                        <div className="relative max-w-[400px]">
                            <div className="mb-10 flex items-center gap-3">
                                <span className="grid h-12 w-12 place-content-center rounded-xl bg-white/20 backdrop-blur">
                                    <GraduationCap className="h-7 w-7" />
                                </span>
                                <span className="text-3xl font-extrabold tracking-tight">{name}</span>
                            </div>
                            <h2 className="text-3xl leading-tight font-extrabold">One platform to run your whole school.</h2>
                            <p className="mt-4 text-base leading-relaxed text-white/80">
                                Admissions, academics, attendance, examinations, fees, accounting, HR, boarding, transport and reports — secure, cloud-based and built for Tanzanian schools.
                            </p>
                            <ul className="mt-10 space-y-4">
                                {[
                                    { icon: CalendarCheck, text: 'Daily attendance & instant guardian alerts' },
                                    { icon: BookOpenCheck, text: 'Exams, grading & printable report cards' },
                                    { icon: Wallet, text: 'Fees, receipts & double-entry accounting' },
                                ].map(({ icon: Icon, text }) => (
                                    <li key={text} className="flex items-center gap-3 text-sm font-semibold">
                                        <span className="grid h-9 w-9 place-content-center rounded-lg bg-white/15">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        {text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* form panel */}
                    <div className="relative flex w-full flex-col items-center justify-center gap-6 px-4 pt-10 pb-16 sm:px-10">
                        <div className="w-full max-w-[440px]">{children}</div>
                        <p className="absolute bottom-5 w-full text-center text-xs text-white-dark">
                            © {new Date().getFullYear()} {name}. All rights reserved.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
