import { Link, useForm } from '@inertiajs/react';
import { LoaderCircle, Mail } from 'lucide-react';
import type { FormEvent } from 'react';
import PageTitle from '@/components/ui/page-title';

export default function ForgotPassword({ status }: { status?: string }) {
    const form = useForm({ email: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/forgot-password');
    };

    return (
        <>
            <PageTitle title="Forgot password" />
            <div className="mb-8">
                <h1 className="text-3xl leading-snug! font-extrabold text-primary uppercase">Password reset</h1>
                <p className="text-base font-bold text-white-dark">Enter your email and we will send you a reset link.</p>
            </div>
            {status && <div className="mb-5 rounded-md bg-success-light px-4 py-3 text-sm font-semibold text-success dark:bg-success-dark-light">{status}</div>}
            <form onSubmit={submit} className="space-y-5">
                <div className={form.errors.email ? 'has-error' : ''}>
                    <label htmlFor="email">Email</label>
                    <div className="relative text-white-dark">
                        <input id="email" type="email" required autoFocus value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} className="form-input ps-10" placeholder="Enter email" />
                        <Mail className="absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2" />
                    </div>
                    {form.errors.email && <p className="form-error">{form.errors.email}</p>}
                </div>
                <button type="submit" disabled={form.processing} className="btn btn-gradient w-full uppercase">
                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Email reset link
                </button>
            </form>
            <div className="mt-6 text-center">
                <Link href="/login" className="font-bold text-primary hover:underline">
                    Back to sign in
                </Link>
            </div>
        </>
    );
}
