import { useForm } from '@inertiajs/react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/form';
import PageTitle from '@/components/ui/page-title';

export default function TwoFactorChallenge() {
    const [recovery, setRecovery] = useState(false);
    const form = useForm({ code: '', recovery_code: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/two-factor-challenge');
    };

    return (
        <>
            <PageTitle title="Two-factor authentication" />
            <div className="mb-8">
                <span className="mb-4 grid h-14 w-14 place-content-center rounded-xl bg-primary-light text-primary dark:bg-primary-dark-light">
                    <ShieldCheck className="h-7 w-7" />
                </span>
                <h1 className="text-2xl font-extrabold text-primary uppercase">Two-factor check</h1>
                <p className="font-bold text-white-dark">
                    {recovery ? 'Enter one of your emergency recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}
                </p>
            </div>
            <form onSubmit={submit} className="space-y-5">
                {recovery ? (
                    <Input label="Recovery code" name="recovery_code" autoFocus value={form.data.recovery_code} onChange={(e) => form.setData('recovery_code', e.target.value)} error={form.errors.recovery_code} />
                ) : (
                    <Input
                        label="Authentication code"
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={6}
                        className="text-center text-2xl tracking-[0.5em]"
                        value={form.data.code}
                        onChange={(e) => form.setData('code', e.target.value)}
                        error={form.errors.code}
                    />
                )}
                <button type="submit" disabled={form.processing} className="btn btn-gradient w-full uppercase">
                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Verify
                </button>
            </form>
            <button type="button" onClick={() => setRecovery((r) => !r)} className="mt-6 w-full text-center text-sm font-bold text-primary hover:underline">
                {recovery ? 'Use an authentication code' : 'Use a recovery code'}
            </button>
        </>
    );
}
