import { Link, useForm } from '@inertiajs/react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import PageTitle from '@/components/ui/page-title';

type Props = {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
    demoAccounts?: { role: string; email: string }[];
};

export default function Login({ status, canResetPassword, canRegister, demoAccounts = [] }: Props) {
    const form = useForm({ email: '', password: '', remember: false });
    const [show, setShow] = useState(false);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/login', { onFinish: () => form.reset('password') });
    };

    return (
        <>
            <PageTitle title="Sign in" />
            <div className="mb-8">
                <h1 className="text-3xl leading-snug! font-extrabold text-primary uppercase md:text-4xl">Sign in</h1>
                <p className="text-base leading-normal font-bold text-white-dark">Enter your email and password to access your school.</p>
            </div>

            {status && <div className="mb-5 rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success dark:bg-success-dark-light">{status}</div>}

            <form className="space-y-5 dark:text-white" onSubmit={submit}>
                <div className={form.errors.email ? 'has-error' : ''}>
                    <label htmlFor="email">Email</label>
                    <div className="relative text-white-dark">
                        <input
                            id="email"
                            type="email"
                            autoFocus
                            autoComplete="email"
                            value={form.data.email}
                            onChange={(e) => form.setData('email', e.target.value)}
                            placeholder="Enter email"
                            className="form-input ps-10 placeholder:text-white-dark"
                            required
                        />
                        <Mail className="absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2" />
                    </div>
                    {form.errors.email && <p className="form-error">{form.errors.email}</p>}
                </div>
                <div className={form.errors.password ? 'has-error' : ''}>
                    <div className="flex items-center justify-between">
                        <label htmlFor="password">Password</label>
                        {canResetPassword && (
                            <Link href="/forgot-password" className="mb-1.5 text-xs font-bold text-primary hover:underline">
                                Forgot password?
                            </Link>
                        )}
                    </div>
                    <div className="relative text-white-dark">
                        <input
                            id="password"
                            type={show ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={form.data.password}
                            onChange={(e) => form.setData('password', e.target.value)}
                            placeholder="Enter password"
                            className="form-input ps-10 pe-10 placeholder:text-white-dark"
                            required
                        />
                        <LockKeyhole className="absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2" />
                        <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 hover:text-primary" aria-label="Toggle password">
                            {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                        </button>
                    </div>
                    {form.errors.password && <p className="form-error">{form.errors.password}</p>}
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="form-checkbox" checked={form.data.remember} onChange={(e) => form.setData('remember', e.target.checked)} />
                    <span className="text-white-dark">Keep me signed in</span>
                </label>
                <button type="submit" disabled={form.processing} className="btn btn-gradient mt-6! w-full uppercase">
                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Sign in
                </button>
            </form>

            {canRegister && (
                <div className="mt-8 text-center dark:text-white">
                    New school?&nbsp;
                    <Link href="/register" className="font-bold text-primary uppercase underline transition hover:text-black dark:hover:text-white">
                        Register your school
                    </Link>
                </div>
            )}

            {demoAccounts.length > 0 && (
                <div className="mt-8 rounded-lg border border-dashed border-primary/40 bg-primary-light/40 p-4 dark:bg-primary-dark-light">
                    <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-primary uppercase">
                        <Sparkles className="h-4 w-4" /> Demo accounts (password: <code>password</code>)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {demoAccounts.map((a) => (
                            <button
                                key={a.email}
                                type="button"
                                onClick={() => form.setData({ email: a.email, password: 'password', remember: false })}
                                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-dark shadow-sm hover:bg-primary hover:text-white dark:bg-[#1b2e4b] dark:text-white-light"
                                title={a.email}
                            >
                                {a.role}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
