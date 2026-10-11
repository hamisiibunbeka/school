import { useForm } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import type { FormEvent } from 'react';
import { Input } from '@/components/ui/form';
import PageTitle from '@/components/ui/page-title';

export default function ConfirmPassword() {
    const form = useForm({ password: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/user/confirm-password', { onFinish: () => form.reset('password') });
    };

    return (
        <>
            <PageTitle title="Confirm password" />
            <div className="mb-8">
                <h1 className="text-2xl font-extrabold text-primary uppercase">Confirm password</h1>
                <p className="font-bold text-white-dark">This is a secure area. Please confirm your password to continue.</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
                <Input label="Password" type="password" name="password" autoFocus required value={form.data.password} onChange={(e) => form.setData('password', e.target.value)} error={form.errors.password} />
                <button type="submit" disabled={form.processing} className="btn btn-gradient w-full uppercase">
                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Confirm
                </button>
            </form>
        </>
    );
}
