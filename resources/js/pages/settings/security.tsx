import { router, useForm } from '@inertiajs/react';
import { KeyRound, LoaderCircle, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormGrid, Input } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import SettingsNav from '@/components/layout/settings-nav';
import { confirm, toast } from '@/lib/swal';

type Props = { canManageTwoFactor: boolean; twoFactorEnabled?: boolean; requiresConfirmation?: boolean; passwordRules?: string };

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' });
    return res.json() as Promise<T>;
}

export default function Security({ canManageTwoFactor, twoFactorEnabled = false, requiresConfirmation = true, passwordRules }: Props) {
    const form = useForm({ current_password: '', password: '', password_confirmation: '' });
    const [qr, setQr] = useState<string | null>(null);
    const [codes, setCodes] = useState<string[]>([]);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put('/settings/password', { preserveScroll: true, onSuccess: () => form.reset() });
    };

    const enable2fa = () => {
        setBusy(true);
        router.post(
            '/user/two-factor-authentication',
            {},
            {
                preserveScroll: true,
                onSuccess: async () => {
                    const { svg } = await getJson<{ svg: string }>('/user/two-factor-qr-code');
                    setQr(svg);
                    if (!requiresConfirmation) setCodes(await getJson<string[]>('/user/two-factor-recovery-codes'));
                },
                onFinish: () => setBusy(false),
            },
        );
    };

    const confirm2fa = (e: FormEvent) => {
        e.preventDefault();
        router.post(
            '/user/confirmed-two-factor-authentication',
            { code },
            {
                preserveScroll: true,
                onSuccess: async () => {
                    setQr(null);
                    setCodes(await getJson<string[]>('/user/two-factor-recovery-codes'));
                    toast('Two-factor authentication enabled');
                },
            },
        );
    };

    const disable2fa = async () => {
        const { confirmed } = await confirm({ title: 'Disable two-factor authentication?', danger: true, confirmText: 'Disable' });
        if (confirmed) router.delete('/user/two-factor-authentication', { preserveScroll: true, onSuccess: () => setCodes([]) });
    };

    return (
        <>
            <PageHeader title="Password & Security" breadcrumbs={[{ title: 'Account' }, { title: 'Security' }]} />
            <SettingsNav active="security" />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <form onSubmit={submit} className="panel">
                    <div className="mb-5 flex items-center gap-3">
                        <span className="grid h-10 w-10 place-content-center rounded-lg bg-primary-light text-primary dark:bg-primary-dark-light">
                            <KeyRound className="h-5 w-5" />
                        </span>
                        <div>
                            <h5 className="text-lg font-bold">Change password</h5>
                            <p className="text-xs text-white-dark">Use a long, unique password you do not use elsewhere.</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <Input label="Current password" type="password" name="current_password" value={form.data.current_password} onChange={(e) => form.setData('current_password', e.target.value)} error={form.errors.current_password} />
                        <FormGrid>
                            <Input label="New password" type="password" name="password" passwordrules={passwordRules} value={form.data.password} onChange={(e) => form.setData('password', e.target.value)} error={form.errors.password} />
                            <Input label="Confirm password" type="password" name="password_confirmation" value={form.data.password_confirmation} onChange={(e) => form.setData('password_confirmation', e.target.value)} />
                        </FormGrid>
                    </div>
                    <div className="mt-6 flex justify-center">
                        <button className="btn btn-primary" disabled={form.processing}>
                            {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Update password
                        </button>
                    </div>
                </form>

                {canManageTwoFactor && (
                    <div className="panel">
                        <div className="mb-5 flex items-center gap-3">
                            <span className="grid h-10 w-10 place-content-center rounded-lg bg-success-light text-success dark:bg-success-dark-light">
                                <ShieldCheck className="h-5 w-5" />
                            </span>
                            <div>
                                <h5 className="text-lg font-bold">Two-factor authentication</h5>
                                <p className="text-xs text-white-dark">Recommended for administrators, bursars and anyone handling sensitive records.</p>
                            </div>
                            <span className={`badge ms-auto ${twoFactorEnabled ? 'badge-soft-success' : 'badge-soft-dark'}`}>{twoFactorEnabled ? 'Enabled' : 'Disabled'}</span>
                        </div>

                        {qr ? (
                            <form onSubmit={confirm2fa} className="space-y-4">
                                <p className="text-sm">Scan this QR code with Google Authenticator, Microsoft Authenticator or Authy, then enter the 6-digit code.</p>
                                <div className="inline-block rounded-lg bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
                                <Input label="Authentication code" name="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} inputMode="numeric" />
                                <button className="btn btn-success">Confirm & enable</button>
                            </form>
                        ) : twoFactorEnabled ? (
                            <button type="button" onClick={disable2fa} className="btn btn-outline-danger">
                                <ShieldOff className="h-4 w-4" /> Disable 2FA
                            </button>
                        ) : (
                            <button type="button" onClick={enable2fa} disabled={busy} className="btn btn-success">
                                {busy && <LoaderCircle className="h-4 w-4 animate-spin" />} Enable 2FA
                            </button>
                        )}

                        {codes.length > 0 && (
                            <div className="mt-6 rounded-md bg-[#f6f8fa] p-4 dark:bg-[#1a2941]">
                                <p className="mb-3 text-sm font-bold">Recovery codes — store them somewhere safe:</p>
                                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                                    {codes.map((c) => (
                                        <span key={c}>{c}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
