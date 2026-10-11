import { useForm } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import type { FormEvent } from 'react';
import { Input } from '@/components/ui/form';
import PageTitle from '@/components/ui/page-title';

export default function ResetPassword({ token, email }: { token: string; email: string }) {
    const form = useForm({ token, email, password: '', password_confirmation: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/reset-password', { onFinish: () => form.reset('password', 'password_confirmation') });
    };

    return (
        <>
            <PageTitle title="Reset password" />
            <div className="mb-8">
                <h1 className="text-3xl leading-snug! font-extrabold text-primary uppercase">New password</h1>
                <p className="text-base font-bold text-white-dark">Choose a strong password for your account.</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
                <Input label="Email" type="email" name="email" value={form.data.email} readOnly error={form.errors.email} />
                <Input label="Password" type="password" name="password" required autoFocus value={form.data.password} onChange={(e) => form.setData('password', e.target.value)} error={form.errors.password} />
                <Input label="Confirm password" type="password" name="password_confirmation" required value={form.data.password_confirmation} onChange={(e) => form.setData('password_confirmation', e.target.value)} />
                <button type="submit" disabled={form.processing} className="btn btn-gradient w-full uppercase">
                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Reset password
                </button>
            </form>
        </>
    );
}
