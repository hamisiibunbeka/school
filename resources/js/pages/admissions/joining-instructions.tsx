import { Link, useForm } from '@inertiajs/react';
import { FileText, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DateInput } from '@/components/ui/date-picker';
import { Checkbox, Field, FormGrid, FormSection, Input, Select, Textarea } from '@/components/ui/form';
import ImportButton from '@/components/ui/import-button';
import PageHeader from '@/components/ui/page-header';
import { cn, num } from '@/lib/utils';
import type { Option } from '@/types';

export type JoiningTemplate = {
    authority: string;
    council: string;
    reference: string;
    reporting_date: string | null;
    subject: string;
    intro: string;
    directions: string;
    documents: string;
    requirements: string;
    combination_items: Record<string, string>;
    contributions: { item: string; amount: number | string }[];
    bank_name: string;
    account_name: string;
    account_no: string;
    branch: string;
    contacts: string;
    books: string;
    rules: string;
    motto: string;
    head_name: string;
    head_title: string;
    include_acceptance_form: boolean;
    include_medical_form: boolean;
};

type Props = {
    template: JoiningTemplate;
    combinations: (Option & { code: string })[];
    years: Option[];
    defaultYear: number | null;
    selected: Record<string, number>;
};

type TemplateForm = Omit<JoiningTemplate, 'reporting_date'> & { reporting_date: string };

const PLACEHOLDERS = ['{student_name}', '{combination}', '{combination_name}', '{school_name}', '{year}', '{reporting_date}'];

export default function JoiningInstructions({ template, combinations, years, defaultYear, selected }: Props) {
    const form = useForm<TemplateForm>({
        ...template,
        reporting_date: template.reporting_date ?? '',
        combination_items: template.combination_items ?? {},
        contributions: template.contributions ?? [],
    });
    const [printYear, setPrintYear] = useState(defaultYear ? String(defaultYear) : '');
    const [printCombination, setPrintCombination] = useState('');
    const err = form.errors as Record<string, string>;
    const total = form.data.contributions.reduce((a, c) => a + Number(c.amount || 0), 0);
    const selectedTotal = Object.values(selected).reduce((a, n) => a + n, 0);

    const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => form.setData((d) => ({ ...d, [key]: value }));
    const setContribution = (i: number, key: 'item' | 'amount', value: string) =>
        set(
            'contributions',
            form.data.contributions.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)),
        );

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put('/admissions/joining-instructions', { preserveScroll: true });
    };

    const printUrl = `/admissions/joining-instructions/print?${new URLSearchParams({ ...(printYear ? { year: printYear } : {}), ...(printCombination ? { combination: printCombination } : {}) })}`;

    return (
        <>
            <PageHeader
                title="Form Five Joining Instructions"
                subtitle="One template for your school. Each selected student gets a personalised letter with their combination, the items for that combination, and the acceptance and medical forms."
                breadcrumbs={[{ title: 'Admissions', href: '/admissions' }, { title: 'Form Five Joining' }]}
                actions={<ImportButton type="form-five-selection" label="Import TAMISEMI selection" />}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <form onSubmit={submit} className="panel space-y-6 xl:col-span-3">
                    <FormSection title="Letter heading" description="Printed above the school letterhead details.">
                        <FormGrid>
                            <Textarea label="Authority lines" rows={2} value={form.data.authority} onChange={(e) => set('authority', e.target.value)} error={err.authority} />
                            <Input
                                label="Council / district"
                                placeholder="e.g. HALMASHAURI YA WILAYA YA CHALINZE"
                                value={form.data.council}
                                onChange={(e) => set('council', e.target.value)}
                                error={err.council}
                            />
                            <Input
                                label="Reference (Kumb. Na.)"
                                placeholder="e.g. KSS/Admn/vol-"
                                value={form.data.reference}
                                onChange={(e) => set('reference', e.target.value)}
                                error={err.reference}
                            />
                            <Field label="Reporting date" error={err.reporting_date}>
                                <DateInput className="form-input" value={form.data.reporting_date} clearable onChange={(e) => set('reporting_date', e.target.value)} />
                            </Field>
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Letter" description={`Placeholders filled per student: ${PLACEHOLDERS.join(' ')}`}>
                        <div className="space-y-4">
                            <Input label="Subject line (YAH)" required value={form.data.subject} onChange={(e) => set('subject', e.target.value)} error={err.subject} />
                            <Textarea label="Introduction" required rows={5} value={form.data.intro} onChange={(e) => set('intro', e.target.value)} error={err.intro} />
                            <Textarea
                                label="How to get to the school"
                                rows={4}
                                placeholder="Directions from Dar es Salaam, Arusha/Tanga, Morogoro … with fares."
                                value={form.data.directions}
                                onChange={(e) => set('directions', e.target.value)}
                                error={err.directions}
                            />
                            <Textarea
                                label="Documents to bring (one per line)"
                                rows={4}
                                value={form.data.documents}
                                onChange={(e) => set('documents', e.target.value)}
                                error={err.documents}
                            />
                        </div>
                    </FormSection>

                    <FormSection title="Uniform and requirements" description="One item per line — printed as a numbered list.">
                        <Textarea
                            rows={8}
                            placeholder={'Suruali za rangi ya dark blue (02)…\nMashati meupe mikono mirefu (02)…'}
                            value={form.data.requirements}
                            onChange={(e) => set('requirements', e.target.value)}
                            error={err.requirements}
                        />
                    </FormSection>

                    <FormSection title="Items per combination" description="Each student sees only the line for their own combination.">
                        {combinations.length ? (
                            <FormGrid>
                                {combinations.map((c) => (
                                    <Input
                                        key={c.code}
                                        label={c.code}
                                        placeholder="e.g. Hard broom – moja, Jembe – moja"
                                        value={form.data.combination_items[c.code] ?? ''}
                                        onChange={(e) => set('combination_items', { ...form.data.combination_items, [c.code]: e.target.value })}
                                    />
                                ))}
                            </FormGrid>
                        ) : (
                            <p className="text-sm text-white-dark">
                                No combinations yet —{' '}
                                <Link href="/academics/combinations" className="text-primary underline">
                                    set them up
                                </Link>
                                .
                            </p>
                        )}
                    </FormSection>

                    <FormSection title="Contributions (michango)" description="Same amounts for all combinations.">
                        <div className="space-y-2">
                            {form.data.contributions.map((c, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <Input
                                        wrapperClassName="flex-1"
                                        placeholder="e.g. Mchango wa uendeshaji wa shule"
                                        value={c.item}
                                        onChange={(e) => setContribution(i, 'item', e.target.value)}
                                        error={err[`contributions.${i}.item`]}
                                    />
                                    <Input
                                        wrapperClassName="w-40"
                                        type="number"
                                        min={0}
                                        placeholder="Amount"
                                        value={c.amount}
                                        onChange={(e) => setContribution(i, 'amount', e.target.value)}
                                        error={err[`contributions.${i}.amount`]}
                                    />
                                    <button
                                        type="button"
                                        className="mt-2 text-danger hover:opacity-70"
                                        onClick={() =>
                                            set(
                                                'contributions',
                                                form.data.contributions.filter((_, idx) => idx !== i),
                                            )
                                        }
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => set('contributions', [...form.data.contributions, { item: '', amount: '' }])}
                                >
                                    <Plus className="h-4 w-4" /> Add contribution
                                </button>
                                {form.data.contributions.length > 0 && <span className="font-bold">Jumla: {num(total)}</span>}
                            </div>
                        </div>
                        <FormGrid cols={4} className="mt-4">
                            <Input label="Bank" placeholder="NMB" value={form.data.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
                            <Input label="Account name" value={form.data.account_name} onChange={(e) => set('account_name', e.target.value)} />
                            <Input label="Account no." value={form.data.account_no} onChange={(e) => set('account_no', e.target.value)} />
                            <Input label="Branch" value={form.data.branch} onChange={(e) => set('branch', e.target.value)} />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Contacts, books and rules">
                        <div className="space-y-4">
                            <Textarea
                                label="Contacts (one per line)"
                                rows={4}
                                placeholder={'Mkuu wa shule: 0789…\nMatron (wasichana): 0782…'}
                                value={form.data.contacts}
                                onChange={(e) => set('contacts', e.target.value)}
                            />
                            <Textarea label="Recommended books" rows={6} value={form.data.books} onChange={(e) => set('books', e.target.value)} />
                            <Textarea label="School rules (one per line)" rows={8} value={form.data.rules} onChange={(e) => set('rules', e.target.value)} />
                            <FormGrid cols={3}>
                                <Input label="Motto / closing line" value={form.data.motto} onChange={(e) => set('motto', e.target.value)} />
                                <Input label="Head of school name" value={form.data.head_name} onChange={(e) => set('head_name', e.target.value)} />
                                <Input label="Title" value={form.data.head_title} onChange={(e) => set('head_title', e.target.value)} />
                            </FormGrid>
                            <div className="flex flex-wrap gap-6">
                                <Checkbox
                                    label="Attach acceptance form (Fomu Na. 01)"
                                    checked={form.data.include_acceptance_form}
                                    onChange={(e) => set('include_acceptance_form', e.target.checked)}
                                />
                                <Checkbox
                                    label="Attach medical form (Fomu Na. 02)"
                                    checked={form.data.include_medical_form}
                                    onChange={(e) => set('include_medical_form', e.target.checked)}
                                />
                            </div>
                        </div>
                    </FormSection>

                    <div className="flex justify-end">
                        <button className="btn btn-primary" disabled={form.processing}>
                            <Save className="h-4 w-4" /> Save template
                        </button>
                    </div>
                </form>

                <div className="space-y-6">
                    <div className="panel xl:sticky xl:top-24">
                        <h5 className="mb-1 text-lg font-bold">Print letters</h5>
                        <p className="mb-4 text-xs text-white-dark">Every accepted Form Five applicant of the year, one letter each. Save the template first.</p>
                        <div className="space-y-3">
                            <Select label="Intake year" placeholder="Any year" options={years} value={printYear} onChange={(e) => setPrintYear(e.target.value)} />
                            <Select
                                label="Combination"
                                placeholder="All combinations"
                                options={combinations.map((c) => ({ value: c.value, label: `${c.code} (${selected[String(c.value)] ?? 0})` }))}
                                value={printCombination}
                                onChange={(e) => setPrintCombination(e.target.value)}
                            />
                            <Link href={printUrl} className={cn('btn btn-primary w-full', form.isDirty && 'pointer-events-none opacity-60')}>
                                <Printer className="h-4 w-4" /> Open letters
                            </Link>
                            {form.isDirty && <p className="text-xs text-warning">Save your changes before printing.</p>}
                        </div>
                        <div className="mt-5 border-t border-white-light pt-4 text-sm dark:border-[#1b2e4b]">
                            <div className="mb-2 flex items-center gap-2 font-bold">
                                <FileText className="h-4 w-4 text-primary" /> {num(selectedTotal)} selected students
                            </div>
                            <ul className="space-y-1 text-xs text-white-dark">
                                {combinations
                                    .filter((c) => selected[String(c.value)])
                                    .map((c) => (
                                        <li key={c.code} className="flex justify-between">
                                            <span>{c.code}</span>
                                            <b>{selected[String(c.value)]}</b>
                                        </li>
                                    ))}
                            </ul>
                            <p className="mt-3 text-xs text-white-dark">
                                Add students with <b>Import TAMISEMI selection</b> above, or one by one from{' '}
                                <Link href="/admissions/create" className="text-primary underline">
                                    New application
                                </Link>{' '}
                                (choose an A-Level class).
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
