import { Link, useForm } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileUp, GraduationCap, Loader2, Lock, Paperclip, Search, Send, ShieldCheck, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { cn, date } from '@/lib/utils';
import { FeesTable } from './_components/blocks';
import { Field, Honeypot } from './_components/form';
import type { AdmissionData, SiteChrome } from './_components/types';
import { FlashBanner } from './_components/ui';
import { Section, SiteLayout, useTheme } from './_templates';

const STEPS = [
    { key: 'learner', title: 'Learner', icon: GraduationCap },
    { key: 'guardian', title: 'Parent / guardian', icon: Users },
    { key: 'review', title: 'Documents & submit', icon: ShieldCheck },
] as const;

const STEP_FIELDS: Record<number, string[]> = {
    0: ['first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth', 'nationality', 'school_class_id', 'residence_type', 'previous_school', 'medical_notes'],
    1: ['guardian_name', 'guardian_relationship', 'guardian_phone', 'guardian_email', 'guardian_occupation', 'address'],
    2: ['documents', 'notes', 'consent', 'form'],
};
const REQUIRED: Record<number, string[]> = {
    0: ['first_name', 'last_name', 'gender', 'date_of_birth', 'school_class_id', 'residence_type'],
    1: ['guardian_name', 'guardian_relationship', 'guardian_phone'],
};

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];

function ageFrom(dob: string): number | null {
    const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const now = new Date();
    let age = now.getFullYear() - Number(m[1]);
    if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age--;
    return age;
}

function ApplicationForm({ site, admission }: { site: SiteChrome; admission: AdmissionData }) {
    const t = useTheme();
    const [step, setStep] = useState(0);
    const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
    const form = useForm({
        first_name: '',
        middle_name: '',
        last_name: '',
        gender: '',
        date_of_birth: '',
        nationality: 'Tanzanian',
        school_class_id: admission.classes.length === 1 ? String(admission.classes[0].value) : '',
        residence_type: admission.residence_options.length === 1 ? String(admission.residence_options[0].value) : '',
        previous_school: '',
        medical_notes: '',
        guardian_name: '',
        guardian_relationship: '',
        guardian_phone: '',
        guardian_email: '',
        guardian_occupation: '',
        address: '',
        notes: '',
        documents: [] as File[],
        consent: false,
        website: '',
    });

    const errors = { ...localErrors, ...(form.errors as Record<string, string>) };
    const err = (key: string) => errors[key] ?? Object.entries(errors).find(([k]) => k.startsWith(`${key}.`))?.[1];
    const set = <K extends keyof typeof form.data>(key: K, value: (typeof form.data)[K]) => {
        (form.setData as (k: string, v: unknown) => void)(key as string, value);
        if (localErrors[key as string]) setLocalErrors(({ [key as string]: _, ...rest }) => rest);
        form.clearErrors(key);
    };

    const docs = admission.documents;
    const maxFiles = docs.max_files ?? 4;
    const maxMb = docs.max_mb ?? 4;

    const validateStep = (s: number): boolean => {
        const missing: Record<string, string> = {};
        for (const key of REQUIRED[s] ?? []) {
            if (!String(form.data[key as keyof typeof form.data] ?? '').trim()) missing[key] = 'This field is required.';
        }
        if (s === 1 && form.data.guardian_phone && !/^[+0-9 ()-]{9,20}$/.test(form.data.guardian_phone)) missing.guardian_phone = 'Enter a valid phone number.';
        if (s === 0 && form.data.date_of_birth) {
            const age = ageFrom(form.data.date_of_birth);
            if (age !== null && (age < 2 || age > 30)) missing.date_of_birth = 'Please check the date of birth.';
        }
        setLocalErrors(missing);
        return Object.keys(missing).length === 0;
    };

    const go = (to: number) => {
        if (to > step && !validateStep(step)) return;
        setStep(to);
        document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const addFiles = (list: FileList | null) => {
        if (!list) return;
        const incoming = Array.from(list);
        const tooBig = incoming.find((f) => f.size > maxMb * 1024 * 1024);
        if (tooBig) {
            setLocalErrors((e) => ({ ...e, documents: `"${tooBig.name}" is larger than ${maxMb} MB.` }));
            return;
        }
        set('documents', [...form.data.documents, ...incoming].slice(0, maxFiles));
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!validateStep(0)) return setStep(0);
        if (!validateStep(1)) return setStep(1);
        if (docs.enabled && docs.required && form.data.documents.length === 0) {
            setLocalErrors({ documents: 'Please attach the required documents.' });
            return;
        }
        if (!form.data.consent) {
            setLocalErrors({ consent: 'Please confirm the information is correct.' });
            return;
        }
        form.post(`${site.base}/admissions`, {
            forceFormData: true,
            preserveScroll: true,
            onError: (serverErrors) => {
                const keys = Object.keys(serverErrors);
                const first = [0, 1, 2].find((s) => keys.some((k) => STEP_FIELDS[s].some((f) => k === f || k.startsWith(`${f}.`))));
                if (first !== undefined) setStep(first);
            },
        });
    };

    const age = ageFrom(form.data.date_of_birth);
    const className = admission.classes.find((c) => String(c.value) === form.data.school_class_id)?.label;

    return (
        <form onSubmit={submit} noValidate className={cn('relative p-5 sm:p-8', t.key !== 'minimal' && t.card, t.key === 'minimal' && 'border-t border-neutral-950 px-0 sm:px-0')}>
            <Honeypot value={form.data.website} onChange={(v) => set('website', v)} />

            <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Application progress">
                {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const done = i < step;
                    const active = i === step;
                    return (
                        <li key={s.key}>
                            <button
                                type="button"
                                onClick={() => (i < step ? go(i) : i === step + 1 ? go(i) : undefined)}
                                aria-current={active ? 'step' : undefined}
                                className="flex w-full flex-col items-center gap-2 text-center sm:flex-row sm:text-start"
                            >
                                <span
                                    className={cn(
                                        'grid h-10 w-10 shrink-0 place-content-center transition',
                                        t.key === 'classic' ? 'rounded-sm' : 'rounded-full',
                                        active || done ? 'bg-[var(--site-primary)] text-[var(--site-on-primary,#fff)]' : 'bg-slate-100 text-slate-400',
                                    )}
                                >
                                    {done ? <Check className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[11px] font-bold tracking-wider text-slate-400 uppercase">Step {i + 1}</span>
                                    <span className={cn('block truncate text-sm font-bold', active ? 'text-slate-900' : 'text-slate-500')}>{s.title}</span>
                                </span>
                            </button>
                            <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full bg-[var(--site-primary)] transition-all duration-500" style={{ width: done ? '100%' : active ? '50%' : '0%' }} />
                            </div>
                        </li>
                    );
                })}
            </ol>

            <FlashBanner className="mb-6" />
            {errors.form && (
                <p role="alert" className="mb-6 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {errors.form}
                </p>
            )}

            {step === 0 && (
                <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="First name" required error={err('first_name')}>
                        {(p) => <input {...p} className={t.input} value={form.data.first_name} onChange={(e) => set('first_name', e.target.value)} autoComplete="off" maxLength={100} />}
                    </Field>
                    <Field label="Middle name" error={err('middle_name')}>
                        {(p) => <input {...p} className={t.input} value={form.data.middle_name} onChange={(e) => set('middle_name', e.target.value)} autoComplete="off" maxLength={100} />}
                    </Field>
                    <Field label="Surname" required error={err('last_name')}>
                        {(p) => <input {...p} className={t.input} value={form.data.last_name} onChange={(e) => set('last_name', e.target.value)} autoComplete="off" maxLength={100} />}
                    </Field>
                    <Field label="Gender" required error={err('gender')}>
                        {(p) => (
                            <div className="flex gap-2" role="radiogroup" aria-labelledby={p.id}>
                                {[
                                    ['female', 'Girl'],
                                    ['male', 'Boy'],
                                ].map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={form.data.gender === value}
                                        onClick={() => set('gender', value)}
                                        className={cn(t.input, 'flex-1 text-center font-bold', form.data.gender === value && 'border-[var(--site-primary)] bg-[color-mix(in_srgb,var(--site-primary)_8%,white)] text-[var(--site-primary)]')}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Field>
                    <Field label="Date of birth" required error={err('date_of_birth')} hint={age !== null ? `Age: ${age} years` : 'dd/mm/yyyy'}>
                        {(p) => (
                            <DatePicker
                                id={p.id}
                                className={t.input}
                                value={form.data.date_of_birth}
                                onValueChange={(v) => set('date_of_birth', v)}
                                max={new Date().toISOString().slice(0, 10)}
                                openTo={`${new Date().getFullYear() - 13}-01-01`}
                            />
                        )}
                    </Field>
                    <Field label="Nationality" error={err('nationality')}>
                        {(p) => <input {...p} className={t.input} value={form.data.nationality} onChange={(e) => set('nationality', e.target.value)} maxLength={60} />}
                    </Field>
                    <Field label="Class applying for" required error={err('school_class_id')} className="sm:col-span-2">
                        {(p) => (
                            <select {...p} className={t.input} value={form.data.school_class_id} onChange={(e) => set('school_class_id', e.target.value)}>
                                <option value="">Select a class…</option>
                                {admission.classes.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </Field>
                    <Field label="Day or boarding" required error={err('residence_type')}>
                        {(p) => (
                            <select {...p} className={t.input} value={form.data.residence_type} onChange={(e) => set('residence_type', e.target.value)}>
                                <option value="">Select…</option>
                                {admission.residence_options.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </Field>
                    <Field label="Current / previous school" error={err('previous_school')} className="sm:col-span-3">
                        {(p) => <input {...p} className={t.input} value={form.data.previous_school} onChange={(e) => set('previous_school', e.target.value)} maxLength={150} placeholder="e.g. Mbezi Beach Primary School" />}
                    </Field>
                    <Field label="Medical conditions or allergies" error={err('medical_notes')} className="sm:col-span-3" hint="Helps us care for your child. Kept confidential.">
                        {(p) => <textarea {...p} rows={2} className={cn(t.input, 'resize-y')} value={form.data.medical_notes} onChange={(e) => set('medical_notes', e.target.value)} maxLength={1000} />}
                    </Field>
                </div>
            )}

            {step === 1 && (
                <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Full name" required error={err('guardian_name')}>
                        {(p) => <input {...p} className={t.input} value={form.data.guardian_name} onChange={(e) => set('guardian_name', e.target.value)} autoComplete="name" maxLength={150} />}
                    </Field>
                    <Field label="Relationship to learner" required error={err('guardian_relationship')}>
                        {(p) => (
                            <select {...p} className={t.input} value={form.data.guardian_relationship} onChange={(e) => set('guardian_relationship', e.target.value)}>
                                <option value="">Select…</option>
                                {RELATIONSHIPS.map((r) => (
                                    <option key={r}>{r}</option>
                                ))}
                            </select>
                        )}
                    </Field>
                    <Field label="Phone number" required error={err('guardian_phone')} hint="We will call or SMS you on this number. You also need it to track the application.">
                        {(p) => <input {...p} type="tel" className={t.input} value={form.data.guardian_phone} onChange={(e) => set('guardian_phone', e.target.value)} autoComplete="tel" maxLength={25} placeholder="e.g. 0712 345 678" />}
                    </Field>
                    <Field label="Email" error={err('guardian_email')}>
                        {(p) => <input {...p} type="email" className={t.input} value={form.data.guardian_email} onChange={(e) => set('guardian_email', e.target.value)} autoComplete="email" maxLength={150} />}
                    </Field>
                    <Field label="Occupation" error={err('guardian_occupation')}>
                        {(p) => <input {...p} className={t.input} value={form.data.guardian_occupation} onChange={(e) => set('guardian_occupation', e.target.value)} maxLength={100} />}
                    </Field>
                    <Field label="Home address" error={err('address')}>
                        {(p) => <input {...p} className={t.input} value={form.data.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" maxLength={255} placeholder="Area, district, region" />}
                    </Field>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <div className="grid gap-3 rounded-xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
                        <Summary label="Learner" value={[form.data.first_name, form.data.middle_name, form.data.last_name].filter(Boolean).join(' ')} />
                        <Summary label="Date of birth" value={form.data.date_of_birth ? `${date(form.data.date_of_birth)}${age !== null ? ` (${age} yrs)` : ''}` : '—'} />
                        <Summary label="Applying for" value={`${className ?? '—'} · ${admission.residence_options.find((o) => String(o.value) === form.data.residence_type)?.label ?? ''}`} />
                        <Summary label="Parent / guardian" value={`${form.data.guardian_name} (${form.data.guardian_relationship}) · ${form.data.guardian_phone}`} />
                    </div>

                    {docs.enabled ? (
                        <Field
                            label="Supporting documents"
                            required={docs.required}
                            error={err('documents')}
                            hint={`Birth certificate, latest school report or results slip, passport photo. PDF, JPG or PNG · up to ${maxFiles} files · max ${maxMb} MB each.`}
                        >
                            {(p) => (
                                <div>
                                    <label
                                        htmlFor={p.id}
                                        className={cn('flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-[var(--site-primary)]', t.radius)}
                                    >
                                        <FileUp className="h-8 w-8 text-[var(--site-primary)]" aria-hidden="true" />
                                        <span className="text-sm font-bold text-slate-700">Click to attach files</span>
                                        <span className="text-xs text-slate-500">
                                            {form.data.documents.length} of {maxFiles} attached
                                        </span>
                                    </label>
                                    <input {...p} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="sr-only" disabled={form.data.documents.length >= maxFiles} onChange={(e) => addFiles(e.target.files)} />
                                    {form.data.documents.length > 0 && (
                                        <ul className="mt-3 space-y-2">
                                            {form.data.documents.map((f, i) => (
                                                <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                                                    <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                                                    <span className="text-xs text-slate-400">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                                                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set('documents', form.data.documents.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </Field>
                    ) : (
                        <p className="flex items-start gap-2 text-sm text-slate-500">
                            <Paperclip className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Bring the birth certificate and latest school report when the admissions office contacts you.
                        </p>
                    )}

                    <Field label="Anything else we should know?" error={err('notes')}>
                        {(p) => <textarea {...p} rows={3} className={cn(t.input, 'resize-y')} value={form.data.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1500} placeholder="Siblings at the school, special needs, preferred interview dates…" />}
                    </Field>

                    <div>
                        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--site-primary)]" checked={form.data.consent} onChange={(e) => set('consent', e.target.checked)} />
                            <span>I confirm the information above is correct and I agree to {site.name} processing it for admission purposes.</span>
                        </label>
                        {err('consent') && (
                            <p role="alert" className="mt-1.5 text-xs font-bold text-rose-600">
                                {err('consent')}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6">
                {step > 0 ? (
                    <button type="button" className={t.btnAlt} onClick={() => go(step - 1)}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                    </button>
                ) : (
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Your details are sent securely to the school only.
                    </span>
                )}
                {step < STEPS.length - 1 ? (
                    <button type="button" className={t.btn} onClick={() => go(step + 1)}>
                        Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : (
                    <button type="submit" className={t.btn} disabled={form.processing}>
                        {form.processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {form.processing ? (form.progress ? `Uploading ${form.progress.percentage}%…` : 'Submitting…') : 'Submit application'}
                    </button>
                )}
            </div>
        </form>
    );
}

function Summary({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">{label}</div>
            <div className="font-semibold text-slate-800">{value || '—'}</div>
        </div>
    );
}

function AdmissionsContent({ site, admission }: { site: SiteChrome; admission: AdmissionData }) {
    const t = useTheme();
    return (
        <Section>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <aside className="space-y-6">
                    <div>
                        <h2 className={cn(t.heading, 'text-2xl sm:text-3xl')}>{admission.open ? `Apply for ${admission.year ?? 'the next intake'}` : 'Admissions'}</h2>
                        {admission.intro && <p className="mt-3 text-slate-600">{admission.intro}</p>}
                    </div>
                    <ol className="space-y-4">
                        {[
                            ['Apply online', 'Fill in the form — it takes about 5 minutes.'],
                            ['Review', 'The admissions office reviews your application and calls you.'],
                            ['Interview / assessment', 'Your child may be invited for a short assessment.'],
                            ['Admission letter', 'Successful applicants receive a letter with fees and joining instructions.'],
                        ].map(([title, text], i) => (
                            <li key={title} className="flex gap-4">
                                <span className={cn('grid h-9 w-9 shrink-0 place-content-center text-sm font-extrabold text-[var(--site-primary)]', t.key === 'classic' ? 'rounded-sm' : 'rounded-full', 'bg-[color-mix(in_srgb,var(--site-primary)_10%,white)]')}>{i + 1}</span>
                                <div>
                                    <div className="font-bold text-slate-900">{title}</div>
                                    <div className="text-sm text-slate-500">{text}</div>
                                </div>
                            </li>
                        ))}
                    </ol>
                    {admission.closing_date && (
                        <p className={cn('flex items-center gap-2 p-4 text-sm font-semibold', t.card)}>
                            <CalendarClock className="h-5 w-5 text-[var(--site-primary)]" aria-hidden="true" /> Applications close on {date(admission.closing_date)}
                        </p>
                    )}
                    {admission.fee_note && <p className="text-sm text-slate-500">{admission.fee_note}</p>}
                    <Link href={`${site.base}/admissions/track`} className={cn(t.btnAlt, 'w-full justify-center')}>
                        <Search className="h-4 w-4" aria-hidden="true" /> Track an application
                    </Link>
                </aside>

                <div id="apply" className="scroll-mt-28">
                    {admission.open ? (
                        <ApplicationForm site={site} admission={admission} />
                    ) : (
                        <div className={cn('p-8 text-center', t.card)}>
                            <CalendarClock className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
                            <h3 className={cn(t.heading, 'mt-4 text-xl')}>Online applications are currently closed</h3>
                            <p className="mt-2 text-slate-500">Please check back later or contact the school office for information about the next intake.</p>
                            <Link href={`${site.base}/contact`} className={cn(t.btn, 'mt-6')}>
                                Contact the office
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {admission.fees.length > 0 && (
                <div className="mt-16">
                    <h2 className={cn(t.heading, 'mb-6 text-2xl')}>Fee structure</h2>
                    <FeesTable fees={admission.fees} />
                </div>
            )}
        </Section>
    );
}

export default function SiteAdmissions({ site, admission }: { site: SiteChrome; admission: AdmissionData }) {
    return (
        <SiteLayout site={site} title="Admissions" hero={{ title: 'Admissions', subtitle: admission.open ? 'Apply online — quick, simple and free.' : 'Join our school community.', eyebrow: admission.year ? `Intake ${admission.year}` : 'Join us' }}>
            <AdmissionsContent site={site} admission={admission} />
        </SiteLayout>
    );
}
