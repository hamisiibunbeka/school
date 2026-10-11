import { Link, useForm } from '@inertiajs/react';
import { LoaderCircle } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormGrid, Input, Select } from '@/components/ui/form';
import PageTitle from '@/components/ui/page-title';

export default function Register({ passwordRules }: { passwordRules?: string }) {
    const form = useForm({
        school_name: '',
        level: 'secondary',
        residence_type: 'mixed',
        name: '',
        email: '',
        phone: '',
        password: '',
        password_confirmation: '',
    });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/register', { onFinish: () => form.reset('password', 'password_confirmation') });
    };

    return (
        <>
            <PageTitle title="Register your school" />
            <div className="mb-6">
                <h1 className="text-3xl leading-snug! font-extrabold text-primary uppercase">Register school</h1>
                <p className="text-base font-bold text-white-dark">Start a free 30-day trial. No card required.</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
                <Input label="School name" name="school_name" required value={form.data.school_name} onChange={(e) => form.setData('school_name', e.target.value)} error={form.errors.school_name} placeholder="e.g. Mzenzi Secondary School" />
                <FormGrid>
                    <Select
                        label="School level"
                        name="level"
                        value={form.data.level}
                        onChange={(e) => form.setData('level', e.target.value)}
                        options={[
                            { value: 'nursery', label: 'Nursery / Pre-primary' },
                            { value: 'primary', label: 'Primary' },
                            { value: 'secondary', label: 'Secondary' },
                            { value: 'combined', label: 'Combined' },
                        ]}
                    />
                    <Select
                        label="Residence"
                        name="residence_type"
                        value={form.data.residence_type}
                        onChange={(e) => form.setData('residence_type', e.target.value)}
                        options={[
                            { value: 'day', label: 'Day school' },
                            { value: 'boarding', label: 'Boarding school' },
                            { value: 'mixed', label: 'Day & boarding' },
                        ]}
                    />
                </FormGrid>
                <FormGrid>
                    <Input label="Your full name" name="name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                    <Input label="Phone" name="phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} placeholder="+255 7xx xxx xxx" />
                </FormGrid>
                <Input label="Email" type="email" name="email" required value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                <FormGrid>
                    <Input label="Password" type="password" name="password" required passwordrules={passwordRules} value={form.data.password} onChange={(e) => form.setData('password', e.target.value)} error={form.errors.password} />
                    <Input label="Confirm password" type="password" name="password_confirmation" required value={form.data.password_confirmation} onChange={(e) => form.setData('password_confirmation', e.target.value)} />
                </FormGrid>
                <button type="submit" disabled={form.processing} className="btn btn-gradient mt-2 w-full uppercase">
                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Create school account
                </button>
            </form>
            <div className="mt-6 text-center dark:text-white">
                Already registered?&nbsp;
                <Link href="/login" className="font-bold text-primary uppercase underline">
                    Sign in
                </Link>
            </div>
        </>
    );
}
