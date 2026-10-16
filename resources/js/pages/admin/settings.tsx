import { useForm } from '@inertiajs/react';
import { Building2, Camera, Hash, LoaderCircle, Save, SlidersHorizontal, Trash2, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormGrid, FormSection, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import Tabs from '@/components/ui/tabs';
import { useCan } from '@/hooks/use-can';
import { titleCase } from '@/lib/utils';

type School = {
    id: number;
    name: string;
    code: string | null;
    registration_no: string | null;
    level: string;
    residence_type: string;
    motto: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    region: string | null;
    currency: string;
    timezone: string;
    logo_url: string | null;
};
type Settings = {
    pass_mark: number | string;
    attendance_alert_threshold: number | string;
    fee_reminder_days: number | string;
    late_after: string;
    sms_sender_id: string;
    payment_instructions: string;
    bank_name: string;
    bank_account_name: string;
    bank_account_no: string;
    mobile_money_provider: string;
    mobile_money_paybill: string;
    mobile_money_account: string;
};
type Sequence = { type: string; prefix: string; padding: number; next_number: number; preview: string; exists: boolean };
type Props = {
    school: School;
    settings: Settings;
    numbering: Sequence[];
    options: { levels: string[]; residence: string[]; regions: string[]; currencies: string[]; timezones: string[] };
};

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: titleCase(x) }));

export default function SchoolSettings({ school, settings, numbering, options }: Props) {
    const can = useCan();
    const manage = can('administration.manage');
    const [tab, setTab] = useState('profile');

    return (
        <>
            <PageHeader title="School Settings" subtitle="Profile, branding, numbering and operational defaults." breadcrumbs={[{ title: 'Administration' }, { title: 'Settings' }]} />
            <Tabs
                tabs={[
                    { key: 'profile', label: 'School profile', icon: Building2 },
                    { key: 'general', label: 'General', icon: SlidersHorizontal },
                    { key: 'payments', label: 'Payment instructions', icon: Wallet },
                    { key: 'numbering', label: 'Document numbering', icon: Hash },
                ]}
                active={tab}
                onChange={setTab}
            />
            {tab === 'profile' && <ProfileForm school={school} options={options} manage={manage} />}
            {tab === 'general' && <GeneralForm settings={settings} manage={manage} />}
            {tab === 'payments' && <PaymentForm settings={settings} manage={manage} currency={school.currency} />}
            {tab === 'numbering' && <Numbering numbering={numbering} manage={manage} />}
        </>
    );
}

function ProfileForm({ school, options, manage }: { school: School; options: Props['options']; manage: boolean }) {
    const form = useForm({
        name: school.name,
        code: school.code ?? '',
        registration_no: school.registration_no ?? '',
        level: school.level,
        residence_type: school.residence_type,
        motto: school.motto ?? '',
        email: school.email ?? '',
        phone: school.phone ?? '',
        address: school.address ?? '',
        region: school.region ?? '',
        currency: school.currency,
        timezone: school.timezone,
        logo: null as File | null,
        remove_logo: false,
    });
    const [preview, setPreview] = useState<string | null>(school.logo_url);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/admin/settings/profile', { forceFormData: true, preserveScroll: true, onSuccess: () => form.setData('logo', null) });
    };

    return (
        <form onSubmit={submit} className="panel space-y-6">
            <FormSection title="Identity & branding" description="Shown on the sidebar, receipts, invoices, report cards and letters.">
                <div className="flex flex-col gap-6 md:flex-row">
                    <div className="flex flex-col items-center gap-3">
                        <div className="grid h-28 w-28 place-content-center overflow-hidden rounded-xl border-2 border-dashed border-white-light bg-[#f6f8fa] dark:border-[#1b2e4b] dark:bg-[#1a2941]">
                            {preview ? <img src={preview} alt="logo" className="h-full w-full object-cover" /> : <Building2 className="h-10 w-10 text-white-dark" />}
                        </div>
                        {manage && (
                            <div className="flex gap-2">
                                <label className="btn btn-sm btn-outline-primary mb-0 cursor-pointer">
                                    <Camera className="h-4 w-4" /> Upload
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] ?? null;
                                            form.setData((d) => ({ ...d, logo: f, remove_logo: false }));
                                            if (f) setPreview(URL.createObjectURL(f));
                                        }}
                                    />
                                </label>
                                {preview && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => {
                                            form.setData((d) => ({ ...d, logo: null, remove_logo: true }));
                                            setPreview(null);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        )}
                        {form.errors.logo && <p className="form-error text-xs text-danger">{form.errors.logo}</p>}
                    </div>
                    <div className="flex-1">
                        <FormGrid>
                            <Input label="School name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} wrapperClassName="sm:col-span-2" />
                            <Input label="School code" value={form.data.code} onChange={(e) => form.setData('code', e.target.value)} error={form.errors.code} />
                            <Input label="Registration no." value={form.data.registration_no} onChange={(e) => form.setData('registration_no', e.target.value)} error={form.errors.registration_no} placeholder="e.g. S.4521" />
                            <Input label="Motto" value={form.data.motto} onChange={(e) => form.setData('motto', e.target.value)} wrapperClassName="sm:col-span-2" />
                        </FormGrid>
                    </div>
                </div>
            </FormSection>
            <FormSection title="Type">
                <FormGrid cols={4}>
                    <Select label="Level" value={form.data.level} onChange={(e) => form.setData('level', e.target.value)} options={opts(options.levels)} />
                    <Select label="Residence type" value={form.data.residence_type} onChange={(e) => form.setData('residence_type', e.target.value)} options={opts(options.residence)} />
                    <Select label="Currency" value={form.data.currency} onChange={(e) => form.setData('currency', e.target.value)} options={options.currencies} error={form.errors.currency} />
                    <Select label="Timezone" value={form.data.timezone} onChange={(e) => form.setData('timezone', e.target.value)} options={options.timezones} error={form.errors.timezone} />
                </FormGrid>
            </FormSection>
            <FormSection title="Contacts & address">
                <FormGrid cols={3}>
                    <Input label="Email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} error={form.errors.email} />
                    <Input label="Phone" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} error={form.errors.phone} />
                    <Select label="Region" placeholder="Select region" value={form.data.region} onChange={(e) => form.setData('region', e.target.value)} options={options.regions} />
                    <Input label="Postal / physical address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} wrapperClassName="sm:col-span-2 lg:col-span-3" />
                </FormGrid>
            </FormSection>
            {manage && (
                <div className="flex justify-center">
                    <button className="btn btn-primary" disabled={form.processing}>
                        {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile
                    </button>
                </div>
            )}
        </form>
    );
}

function GeneralForm({ settings, manage }: { settings: Settings; manage: boolean }) {
    const form = useForm({
        ...settings,
        pass_mark: String(settings.pass_mark),
        attendance_alert_threshold: String(settings.attendance_alert_threshold),
        fee_reminder_days: String(settings.fee_reminder_days),
        late_after: settings.late_after ?? '',
    });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put('/admin/settings/general', { preserveScroll: true });
    };

    return (
        <form onSubmit={submit} className="panel space-y-6">
            <FormSection title="Academics & attendance" description="Defaults used by exams, attendance alerts and reports.">
                <FormGrid cols={3}>
                    <Input label="Pass mark (%)" type="number" min={0} max={100} value={form.data.pass_mark} onChange={(e) => form.setData('pass_mark', e.target.value)} error={form.errors.pass_mark} />
                    <Input
                        label="Attendance alert threshold (%)"
                        type="number"
                        min={0}
                        max={100}
                        value={form.data.attendance_alert_threshold}
                        onChange={(e) => form.setData('attendance_alert_threshold', e.target.value)}
                        error={form.errors.attendance_alert_threshold}
                        help="Flag learners whose attendance falls below this rate."
                    />
                    <Input label="Mark late after" type="time" value={form.data.late_after} onChange={(e) => form.setData('late_after', e.target.value)} error={form.errors.late_after} />
                </FormGrid>
            </FormSection>
            <FormSection title="Fees & messaging">
                <FormGrid cols={3}>
                    <Input
                        label="Fee reminder (days before due)"
                        type="number"
                        min={0}
                        max={90}
                        value={form.data.fee_reminder_days}
                        onChange={(e) => form.setData('fee_reminder_days', e.target.value)}
                        error={form.errors.fee_reminder_days}
                    />
                    <Input label="SMS sender ID" maxLength={11} value={form.data.sms_sender_id} onChange={(e) => form.setData('sms_sender_id', e.target.value)} error={form.errors.sms_sender_id} help="Up to 11 letters or digits, e.g. MZENZISS. It must be registered and approved with the SMS provider (Beem) first; leave blank to use the platform default." />
                </FormGrid>
            </FormSection>
            {manage && (
                <div className="flex justify-center">
                    <button className="btn btn-primary" disabled={form.processing}>
                        <Save className="h-4 w-4" /> Save settings
                    </button>
                </div>
            )}
        </form>
    );
}

function PaymentForm({ settings, manage, currency }: { settings: Settings; manage: boolean; currency: string }) {
    const form = useForm({
        ...settings,
        pass_mark: String(settings.pass_mark),
        attendance_alert_threshold: String(settings.attendance_alert_threshold),
        fee_reminder_days: String(settings.fee_reminder_days),
        late_after: settings.late_after ?? '',
    });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put('/admin/settings/general', { preserveScroll: true });
    };
    const compose = () => {
        const d = form.data;
        const lines = [
            `Pay school fees (${currency}) using any of the following:`,
            d.bank_name && `• Bank: ${d.bank_name}${d.bank_account_name ? `, A/C name: ${d.bank_account_name}` : ''}${d.bank_account_no ? `, A/C no: ${d.bank_account_no}` : ''}`,
            d.mobile_money_paybill && `• ${d.mobile_money_provider || 'Mobile money'}: Lipa namba / Paybill ${d.mobile_money_paybill}${d.mobile_money_account ? `, account: ${d.mobile_money_account}` : ''}`,
            'Always quote the student admission number as the reference and keep your bank slip / SMS confirmation.',
        ].filter(Boolean);
        form.setData('payment_instructions', lines.join('\n'));
    };

    return (
        <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="panel space-y-6 lg:col-span-2">
                <FormSection title="Bank account">
                    <FormGrid cols={3}>
                        <Input label="Bank" value={form.data.bank_name} onChange={(e) => form.setData('bank_name', e.target.value)} placeholder="NMB Bank" />
                        <Input label="Account name" value={form.data.bank_account_name} onChange={(e) => form.setData('bank_account_name', e.target.value)} />
                        <Input label="Account number" value={form.data.bank_account_no} onChange={(e) => form.setData('bank_account_no', e.target.value)} />
                    </FormGrid>
                </FormSection>
                <FormSection title="Mobile money">
                    <FormGrid cols={3}>
                        <Input label="Provider" value={form.data.mobile_money_provider} onChange={(e) => form.setData('mobile_money_provider', e.target.value)} placeholder="M-Pesa / Tigo Pesa / Airtel Money" />
                        <Input label="Paybill / Lipa namba" value={form.data.mobile_money_paybill} onChange={(e) => form.setData('mobile_money_paybill', e.target.value)} />
                        <Input label="Account / reference format" value={form.data.mobile_money_account} onChange={(e) => form.setData('mobile_money_account', e.target.value)} placeholder="Admission number" />
                    </FormGrid>
                </FormSection>
                <FormSection title="Instructions printed on invoices & parent portal">
                    <Textarea rows={6} value={form.data.payment_instructions} onChange={(e) => form.setData('payment_instructions', e.target.value)} error={form.errors.payment_instructions} />
                    {manage && (
                        <button type="button" className="btn btn-sm btn-outline-primary mt-3" onClick={compose}>
                            Generate from details above
                        </button>
                    )}
                </FormSection>
                {manage && (
                    <div className="flex justify-center">
                        <button className="btn btn-primary" disabled={form.processing}>
                            <Save className="h-4 w-4" /> Save payment details
                        </button>
                    </div>
                )}
            </div>
            <div className="panel h-fit">
                <h5 className="mb-3 text-base font-bold">Preview</h5>
                <div className="rounded-lg border border-dashed border-primary/40 bg-primary-light/40 p-4 text-sm whitespace-pre-line dark:bg-primary-dark-light">
                    {form.data.payment_instructions || <span className="text-white-dark">No instructions yet.</span>}
                </div>
            </div>
        </form>
    );
}

function Numbering({ numbering, manage }: { numbering: Sequence[]; manage: boolean }) {
    const [editing, setEditing] = useState<Sequence | null>(null);
    const form = useForm({ prefix: '', padding: '5' });
    const open = (s: Sequence) => {
        form.clearErrors();
        form.setData({ prefix: s.prefix, padding: String(s.padding) });
        setEditing(s);
    };
    const preview = editing ? `${form.data.prefix}${String(editing.next_number).padStart(Number(form.data.padding) || 1, '0')}` : '';

    return (
        <div className="panel">
            <h5 className="mb-1 text-lg font-bold">Document numbering</h5>
            <p className="mb-5 text-sm text-white-dark">Numbers are issued sequentially per school and never reused. You can change the prefix and zero-padding; the counter itself cannot be reset.</p>
            <div className="table-responsive">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Document</th>
                            <th>Prefix</th>
                            <th className="text-center!">Padding</th>
                            <th className="text-center!">Next no.</th>
                            <th>Next document</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {numbering.map((s) => (
                            <tr key={s.type}>
                                <td className="font-bold">{titleCase(s.type)}</td>
                                <td>
                                    <code className="rounded bg-[#f1f2f3] px-2 py-0.5 dark:bg-[#1b2e4b]">{s.prefix}</code>
                                </td>
                                <td className="text-center!">{s.padding}</td>
                                <td className="text-center!">{s.next_number}</td>
                                <td>
                                    <span className="badge badge-soft-primary font-mono">{s.preview}</span>
                                    {!s.exists && <span className="ms-2 text-xs text-white-dark">(not used yet)</span>}
                                </td>
                                <td className="text-end!">
                                    {manage && (
                                        <button className="btn btn-sm btn-outline-primary" onClick={() => open(s)}>
                                            Change
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Modal open={!!editing} onClose={() => setEditing(null)} title={`${titleCase(editing?.type ?? '')} numbering`} size="sm">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.put(`/admin/settings/numbering/${editing?.type}`, { preserveScroll: true, onSuccess: () => setEditing(null) });
                    }}
                    className="space-y-4"
                >
                    <Input label="Prefix" value={form.data.prefix} onChange={(e) => form.setData('prefix', e.target.value)} error={form.errors.prefix} />
                    <Input label="Zero padding (digits)" type="number" min={1} max={10} value={form.data.padding} onChange={(e) => form.setData('padding', e.target.value)} error={form.errors.padding} />
                    <div className="rounded-md bg-[#f6f8fa] p-3 text-center dark:bg-[#1a2941]">
                        <div className="text-xs text-white-dark uppercase">Next number will be</div>
                        <div className="font-mono text-lg font-extrabold text-primary">{preview}</div>
                    </div>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
