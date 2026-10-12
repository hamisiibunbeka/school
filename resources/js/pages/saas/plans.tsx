import { router, useForm } from '@inertiajs/react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { Checkbox, FormGrid, FormSection, Input, Select, Switch } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { confirm } from '@/lib/swal';
import { cn, money, num, titleCase } from '@/lib/utils';
import type { Option } from '@/types';

type Plan = {
    id: number;
    name: string;
    code: string;
    price: string;
    billing_interval: string;
    max_students: number | null;
    max_users: number | null;
    max_schools: number;
    sms_credits: number;
    modules: string[];
    is_active: boolean;
    tenants_count: number;
    website_features: WebsiteFeatures;
    website_tier: string;
};

type WebsiteFeatures = {
    templates: string[];
    max_pages: number | null;
    max_gallery: number | null;
    news: boolean;
    gallery: boolean;
    online_admission: boolean;
    document_uploads: boolean;
    custom_domain: boolean;
    remove_branding: boolean;
};

const WEBSITE_FLAGS: { key: keyof WebsiteFeatures; label: string }[] = [
    { key: 'online_admission', label: 'Online admission form' },
    { key: 'document_uploads', label: 'Document uploads with applications' },
    { key: 'news', label: 'News & events' },
    { key: 'gallery', label: 'Photo gallery' },
    { key: 'custom_domain', label: 'Custom domain' },
    { key: 'remove_branding', label: 'Remove platform branding' },
];

const blank = { name: '', code: '', price: '0', billing_interval: 'yearly', max_students: '', max_users: '', max_schools: '1', sms_credits: '0', modules: [] as string[], is_active: true, website_features: null as WebsiteFeatures | null };

export default function Plans({ plans, modules, templates, websiteDefaults }: { plans: Plan[]; modules: Option[]; templates: Option[]; websiteDefaults: Record<string, WebsiteFeatures> }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const form = useForm(blank);

    const openForm = (p: Plan | null) => {
        setEditing(p);
        form.clearErrors();
        form.setData(
            p
                ? {
                      name: p.name,
                      code: p.code,
                      price: String(Number(p.price)),
                      billing_interval: p.billing_interval,
                      max_students: p.max_students ? String(p.max_students) : '',
                      max_users: p.max_users ? String(p.max_users) : '',
                      max_schools: String(p.max_schools),
                      sms_credits: String(p.sms_credits),
                      modules: p.modules,
                      is_active: p.is_active,
                      website_features: p.website_features,
                  }
                : { ...blank, modules: modules.map((m) => String(m.value)), website_features: websiteDefaults.starter },
        );
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, max_students: d.max_students || null, max_users: d.max_users || null }));
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/saas/plans/${editing.id}`, opts);
        else form.post('/saas/plans', opts);
    };

    const wf = form.data.website_features;
    const setWf = (patch: Partial<WebsiteFeatures>) => wf && form.setData('website_features', { ...wf, ...patch });

    const toggleModule = (key: string, on: boolean) => form.setData('modules', on ? [...form.data.modules, key] : form.data.modules.filter((m) => m !== key));

    const destroy = async (p: Plan) => {
        const { confirmed } = await confirm({
            title: `Delete plan "${p.name}"?`,
            text: p.tenants_count ? 'This plan is in use, so it will be deactivated instead of deleted.' : 'This cannot be undone.',
            confirmText: p.tenants_count ? 'Deactivate' : 'Delete',
            danger: true,
        });
        if (confirmed) router.delete(`/saas/plans/${p.id}`, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader
                title="Plans"
                subtitle="Pricing, limits and module entitlements for tenants."
                breadcrumbs={[{ title: 'SaaS Console', href: '/saas' }, { title: 'Plans' }]}
                actions={
                    <button className="btn btn-primary" onClick={() => openForm(null)}>
                        <Plus className="h-4 w-4" /> New plan
                    </button>
                }
            />

            {plans.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No plans yet" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {plans.map((p) => (
                        <div key={p.id} className={cn('panel flex flex-col', !p.is_active && 'opacity-60')}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h5 className="text-lg font-extrabold">{p.name}</h5>
                                    <div className="font-mono text-xs text-white-dark">{p.code}</div>
                                </div>
                                {p.is_active ? <span className="badge badge-soft-success">Active</span> : <span className="badge badge-soft-dark">Inactive</span>}
                            </div>
                            <div className="my-4">
                                <span className="text-2xl font-extrabold text-primary">{money(p.price)}</span>
                                <span className="text-sm text-white-dark"> / {p.billing_interval.replace('ly', '')}</span>
                            </div>
                            <ul className="mb-4 space-y-1.5 text-sm">
                                {[
                                    p.max_students ? `${num(p.max_students)} students` : 'Unlimited students',
                                    p.max_users ? `${num(p.max_users)} staff users` : 'Unlimited users',
                                    `${p.max_schools} school${p.max_schools > 1 ? 's' : ''}`,
                                    `${num(p.sms_credits)} SMS credits / month`,
                                    `${p.modules.length} of ${modules.length} modules`,
                                    `Website: ${p.website_features.templates.length} template${p.website_features.templates.length === 1 ? '' : 's'}${p.website_features.online_admission ? ' + online admission' : ''}`,
                                ].map((l) => (
                                    <li key={l} className="flex items-center gap-2">
                                        <Check className="h-4 w-4 text-success" /> {l}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-auto flex items-center justify-between border-t border-white-light pt-3 dark:border-[#1b2e4b]">
                                <span className="text-xs text-white-dark">{p.tenants_count} tenant(s)</span>
                                <div className="flex gap-2">
                                    <button className="btn btn-sm btn-outline-primary" onClick={() => openForm(p)}>
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={() => destroy(p)} title="Delete">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New plan'} size="xl">
                <form onSubmit={submit} className="space-y-5">
                    <FormSection title="Pricing">
                        <FormGrid cols={4}>
                            <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} />
                            <Input label="Code" required value={form.data.code} onChange={(e) => form.setData('code', e.target.value)} error={form.errors.code} />
                            <Input label="Price (TZS)" type="number" min={0} required value={form.data.price} onChange={(e) => form.setData('price', e.target.value)} error={form.errors.price} />
                            <Select
                                label="Billing interval"
                                value={form.data.billing_interval}
                                onChange={(e) => form.setData('billing_interval', e.target.value)}
                                options={['monthly', 'termly', 'yearly'].map((v) => ({ value: v, label: titleCase(v) }))}
                            />
                        </FormGrid>
                    </FormSection>
                    <FormSection title="Limits" description="Leave students/users blank for unlimited.">
                        <FormGrid cols={4}>
                            <Input label="Max students" type="number" min={1} value={form.data.max_students} onChange={(e) => form.setData('max_students', e.target.value)} error={form.errors.max_students} />
                            <Input label="Max staff users" type="number" min={1} value={form.data.max_users} onChange={(e) => form.setData('max_users', e.target.value)} error={form.errors.max_users} />
                            <Input label="Max schools" type="number" min={1} required value={form.data.max_schools} onChange={(e) => form.setData('max_schools', e.target.value)} error={form.errors.max_schools} />
                            <Input label="SMS credits / month" type="number" min={0} required value={form.data.sms_credits} onChange={(e) => form.setData('sms_credits', e.target.value)} error={form.errors.sms_credits} />
                        </FormGrid>
                    </FormSection>
                    <FormSection title="Modules">
                        <div className="mb-3 flex gap-2">
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => form.setData('modules', modules.map((m) => String(m.value)))}>
                                Select all
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => form.setData('modules', [])}>
                                Clear
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {modules.map((m) => (
                                <Checkbox key={m.value} label={m.label} checked={form.data.modules.includes(String(m.value))} onChange={(e) => toggleModule(String(m.value), e.target.checked)} />
                            ))}
                        </div>
                        {form.errors.modules && <p className="mt-2 text-sm text-danger">{form.errors.modules}</p>}
                    </FormSection>
                    {wf && (
                        <FormSection title="School website" description="Templates and website features schools on this plan can use.">
                            <div className="mb-4">
                                <label>Templates</label>
                                <div className="flex flex-wrap gap-2">
                                    {templates.map((t) => {
                                        const on = wf.templates.includes(String(t.value));
                                        return (
                                            <button
                                                key={t.value}
                                                type="button"
                                                onClick={() => setWf({ templates: on ? wf.templates.filter((x) => x !== t.value) : [...wf.templates, String(t.value)] })}
                                                className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold transition', on ? 'border-primary bg-primary text-white' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]')}
                                            >
                                                {on && <Check className="me-1 inline h-3.5 w-3.5" />}
                                                {t.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {(form.errors as Record<string, string>)['website_features.templates'] && <p className="form-error">{(form.errors as Record<string, string>)['website_features.templates']}</p>}
                            </div>
                            <FormGrid cols={4}>
                                <Input label="Max custom pages" type="number" min={0} value={wf.max_pages ?? ''} onChange={(e) => setWf({ max_pages: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Unlimited" />
                                <Input label="Max gallery photos" type="number" min={0} value={wf.max_gallery ?? ''} onChange={(e) => setWf({ max_gallery: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Unlimited" />
                            </FormGrid>
                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {WEBSITE_FLAGS.map((f) => (
                                    <Checkbox key={f.key} label={f.label} checked={!!wf[f.key]} onChange={(e) => setWf({ [f.key]: e.target.checked })} />
                                ))}
                            </div>
                        </FormSection>
                    )}
                    <Switch checked={form.data.is_active} onChange={(v) => form.setData('is_active', v)} label="Available for new subscriptions" />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save plan
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
