import { useForm, usePage } from '@inertiajs/react';
import { Camera, LoaderCircle, Save } from 'lucide-react';
import type { FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import { FormGrid, Input } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import SettingsNav from '@/components/layout/settings-nav';
import { dateTime } from '@/lib/utils';

type Props = {
    profile: { name: string; email: string; phone: string | null; avatar_url: string | null; last_login_at: string | null; created_at: string };
};

export default function Profile({ profile }: Props) {
    const { auth } = usePage().props;
    const form = useForm<{ _method: string; name: string; email: string; phone: string; avatar: File | null }>({
        _method: 'patch',
        name: profile.name,
        email: profile.email,
        phone: profile.phone ?? '',
        avatar: null,
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/settings/profile', { forceFormData: true, preserveScroll: true });
    };

    const preview = form.data.avatar ? URL.createObjectURL(form.data.avatar) : profile.avatar_url;

    return (
        <>
            <PageHeader title="My Profile" breadcrumbs={[{ title: 'Account' }, { title: 'Profile' }]} />
            <SettingsNav active="profile" />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="panel">
                    <div className="flex flex-col items-center text-center">
                        <div className="relative">
                            <Avatar name={profile.name} src={preview} className="h-28 w-28 text-2xl" />
                            <label className="absolute end-0 bottom-0 mb-0 grid h-9 w-9 cursor-pointer place-content-center rounded-full bg-primary text-white shadow-lg">
                                <Camera className="h-4 w-4" />
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => form.setData('avatar', e.target.files?.[0] ?? null)} />
                            </label>
                        </div>
                        <h3 className="mt-4 text-xl font-bold text-black dark:text-white-light">{profile.name}</h3>
                        <span className="badge badge-soft-primary mt-2">{auth.user?.role}</span>
                        <ul className="mt-6 w-full space-y-3 text-start text-sm">
                            <li className="flex justify-between">
                                <span className="text-white-dark">Email</span>
                                <span className="font-semibold">{profile.email}</span>
                            </li>
                            <li className="flex justify-between">
                                <span className="text-white-dark">Last sign-in</span>
                                <span className="font-semibold">{dateTime(profile.last_login_at)}</span>
                            </li>
                            <li className="flex justify-between">
                                <span className="text-white-dark">Member since</span>
                                <span className="font-semibold">{dateTime(profile.created_at)}</span>
                            </li>
                        </ul>
                    </div>
                </div>
                <form onSubmit={submit} className="panel xl:col-span-2">
                    <h5 className="mb-5 text-lg font-bold">Personal information</h5>
                    <FormGrid>
                        <Input label="Full name" name="name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                        <Input label="Phone" name="phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                        <Input label="Email" type="email" name="email" required value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} wrapperClassName="sm:col-span-2" />
                    </FormGrid>
                    {form.errors.avatar && <p className="form-error">{form.errors.avatar}</p>}
                    <div className="mt-6 flex justify-end">
                        <button type="submit" className="btn btn-primary" disabled={form.processing}>
                            {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
