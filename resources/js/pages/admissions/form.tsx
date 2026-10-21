import { Link, useForm } from '@inertiajs/react';
import { FileText, LoaderCircle, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import { ClassLevelSelect, classesOfLevel, levelOfClass } from '@/components/ui/class-level';
import { FormGrid, FormSection, Input, Select, Textarea } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import type { Option } from '@/types';
import DobAgeField from '@/components/ui/dob-age-field';

type Application = {
    id: number;
    application_no: string;
    status: string;
    full_name: string;
    academic_year_id: number | null;
    school_class_id: number | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    gender: string;
    date_of_birth: string | null;
    residence_type: string;
    previous_school: string | null;
    address: string | null;
    guardian_name: string;
    guardian_relationship: string;
    guardian_phone: string;
    guardian_email: string | null;
    medical_notes: string | null;
    notes: string | null;
    combination_id: number | null;
    csee_index_no: string | null;
    csee_division: string | null;
    csee_points: number | null;
};

type ClassOption = Option & { education_level?: string };
type Props = { application: Application | null; classes: ClassOption[]; years: (Option & { education_level?: string })[]; defaultYearId: number | null; combinations: Option[] };

const relationships = ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor'];

export default function AdmissionForm({ application, classes, years, defaultYearId, combinations }: Props) {
    const editing = !!application;
    const form = useForm({
        academic_year_id: application?.academic_year_id ? String(application.academic_year_id) : defaultYearId ? String(defaultYearId) : '',
        school_class_id: application?.school_class_id ? String(application.school_class_id) : '',
        first_name: application?.first_name ?? '',
        middle_name: application?.middle_name ?? '',
        last_name: application?.last_name ?? '',
        gender: application?.gender ?? '',
        date_of_birth: application?.date_of_birth ?? '',
        residence_type: application?.residence_type ?? 'day',
        previous_school: application?.previous_school ?? '',
        address: application?.address ?? '',
        guardian_name: application?.guardian_name ?? '',
        guardian_relationship: application?.guardian_relationship ?? 'Father',
        guardian_phone: application?.guardian_phone ?? '',
        guardian_email: application?.guardian_email ?? '',
        medical_notes: application?.medical_notes ?? '',
        notes: application?.notes ?? '',
        combination_id: application?.combination_id ? String(application.combination_id) : '',
        csee_index_no: application?.csee_index_no ?? '',
        csee_division: application?.csee_division ?? '',
        csee_points: application?.csee_points ? String(application.csee_points) : '',
    });
    const err = form.errors;
    const aLevel = classes.find((c) => String(c.value) === form.data.school_class_id)?.education_level === 'a_level';
    // Pick the level first (multi-level schools), then one of that level's classes.
    const [level, setLevel] = useState(() => levelOfClass(classes, form.data.school_class_id));
    // A-Level applicants go into an A-Level year (separate July–May calendar).
    const yearOptions = form.data.school_class_id ? years.filter((y) => !y.education_level || y.education_level === (aLevel ? 'a_level' : 'o_level')) : years;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (editing) form.put(`/admissions/${application.id}`, { preserveScroll: true });
        else form.post('/admissions', { preserveScroll: true });
    };

    const name = `${form.data.first_name} ${form.data.last_name}`.trim();

    return (
        <>
            <PageHeader
                title={editing ? `Edit application ${application.application_no}` : 'New Admission Application'}
                subtitle={editing ? application.full_name : 'Staff-assisted application. An application number is generated on save.'}
                breadcrumbs={[
                    { title: 'Admissions', href: '/admissions' },
                    ...(editing ? [{ title: application.application_no, href: `/admissions/${application.id}` }] : []),
                    { title: editing ? 'Edit' : 'New application' },
                ]}
            />

            <form onSubmit={submit} className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <div className="panel h-max xl:sticky xl:top-24">
                    <div className="flex flex-col items-center text-center">
                        <Avatar name={name || '?'} className="h-24 w-24 text-2xl" />
                        <div className="mt-3 text-lg font-extrabold text-black dark:text-white-light">{name || 'New applicant'}</div>
                        {editing ? (
                            <div className="mt-2 flex items-center gap-2">
                                <span className="badge badge-soft-dark">{application.application_no}</span>
                                <StatusBadge status={application.status} />
                            </div>
                        ) : (
                            <span className="badge badge-soft-info mt-2">Will be submitted</span>
                        )}
                    </div>
                    <div className="mt-6 space-y-3 border-t border-white-light pt-4 text-sm dark:border-[#1b2e4b]">
                        <div className="flex items-start gap-2 text-white-dark">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>
                                After saving, move the application through review, interview and a decision from its detail page. Accepted applicants are enrolled without re-typing
                                their details.
                            </span>
                        </div>
                    </div>
                </div>

                <div className="panel space-y-6 xl:col-span-3">
                    <FormSection title="Intake" description="Which class and academic year the learner is applying for.">
                        <FormGrid cols={3}>
                            <Select
                                label="Academic year"
                                required
                                placeholder="Select…"
                                options={yearOptions}
                                value={form.data.academic_year_id}
                                onChange={(e) => form.setData('academic_year_id', e.target.value)}
                                error={err.academic_year_id}
                            />
                            <ClassLevelSelect
                                classes={classes}
                                value={level}
                                onChange={(l) => {
                                    setLevel(l);
                                    form.setData((d) => ({ ...d, school_class_id: '', combination_id: '', academic_year_id: (l === 'a_level') === aLevel ? d.academic_year_id : '' }));
                                }}
                            />
                            <Select
                                label="Class applied for"
                                required
                                placeholder="Select…"
                                options={classesOfLevel(classes, level)}
                                value={form.data.school_class_id}
                                onChange={(e) => {
                                    const next = classes.find((c) => String(c.value) === e.target.value)?.education_level === 'a_level';
                                    form.setData((d) => ({
                                        ...d,
                                        school_class_id: e.target.value,
                                        combination_id: next ? d.combination_id : '',
                                        academic_year_id: next === aLevel ? d.academic_year_id : '',
                                    }));
                                }}
                                error={err.school_class_id}
                            />
                            <Select
                                label="Residence"
                                required
                                options={[
                                    { value: 'day', label: 'Day scholar' },
                                    { value: 'boarding', label: 'Boarder' },
                                ]}
                                value={form.data.residence_type}
                                onChange={(e) => form.setData('residence_type', e.target.value)}
                                error={err.residence_type}
                            />
                        </FormGrid>
                    </FormSection>

                    {aLevel && (
                        <FormSection title="Form Five selection" description="Combination the applicant is joining and their Form Four (CSEE) result.">
                            <FormGrid cols={4}>
                                <Select
                                    label="Combination"
                                    required
                                    placeholder={combinations.length ? 'Select…' : 'No combinations set up'}
                                    options={combinations}
                                    value={form.data.combination_id}
                                    onChange={(e) => form.setData('combination_id', e.target.value)}
                                    error={err.combination_id}
                                />
                                <Input
                                    label="CSEE index no."
                                    placeholder="S0101/0001/2025"
                                    value={form.data.csee_index_no}
                                    onChange={(e) => form.setData('csee_index_no', e.target.value.toUpperCase())}
                                    error={err.csee_index_no}
                                />
                                <Select
                                    label="Division"
                                    placeholder="—"
                                    options={['I', 'II', 'III', 'IV', '0']}
                                    value={form.data.csee_division}
                                    onChange={(e) => form.setData('csee_division', e.target.value)}
                                    error={err.csee_division}
                                />
                                <Input
                                    label="Points"
                                    type="number"
                                    min={7}
                                    max={35}
                                    value={form.data.csee_points}
                                    onChange={(e) => form.setData('csee_points', e.target.value)}
                                    error={err.csee_points}
                                />
                            </FormGrid>
                        </FormSection>
                    )}

                    <FormSection title="Applicant bio-data" description="Names exactly as on the birth certificate.">
                        <FormGrid cols={3}>
                            <Input label="First name" required value={form.data.first_name} onChange={(e) => form.setData('first_name', e.target.value)} error={err.first_name} />
                            <Input label="Middle name" value={form.data.middle_name} onChange={(e) => form.setData('middle_name', e.target.value)} error={err.middle_name} />
                            <Input label="Last name" required value={form.data.last_name} onChange={(e) => form.setData('last_name', e.target.value)} error={err.last_name} />
                            <Select
                                label="Gender"
                                required
                                placeholder="Select…"
                                options={[
                                    { value: 'male', label: 'Male' },
                                    { value: 'female', label: 'Female' },
                                ]}
                                value={form.data.gender}
                                onChange={(e) => form.setData('gender', e.target.value)}
                                error={err.gender}
                            />
                            <DobAgeField
                                required
                                value={form.data.date_of_birth}
                                onChange={(v) => form.setData('date_of_birth', v)}
                                error={err.date_of_birth}
                                minAge={2}
                                maxAge={30}
                                typicalAge={13}
                            />
                            <Input
                                label="Previous school"
                                value={form.data.previous_school}
                                onChange={(e) => form.setData('previous_school', e.target.value)}
                                error={err.previous_school}
                                placeholder="e.g. Mlimani Primary School"
                            />
                            <Input
                                label="Home address"
                                value={form.data.address}
                                onChange={(e) => form.setData('address', e.target.value)}
                                error={err.address}
                                wrapperClassName="sm:col-span-2 lg:col-span-3"
                                placeholder="Street, ward, district, region"
                            />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Parent / guardian" description="Matched by phone number on enrolment, so siblings share one guardian record.">
                        <FormGrid cols={2}>
                            <Input
                                label="Full name"
                                required
                                value={form.data.guardian_name}
                                onChange={(e) => form.setData('guardian_name', e.target.value)}
                                error={err.guardian_name}
                            />
                            <Select
                                label="Relationship"
                                required
                                options={relationships}
                                value={form.data.guardian_relationship}
                                onChange={(e) => form.setData('guardian_relationship', e.target.value)}
                                error={err.guardian_relationship}
                            />
                            <Input
                                label="Phone"
                                required
                                placeholder="+255…"
                                value={form.data.guardian_phone}
                                onChange={(e) => form.setData('guardian_phone', e.target.value)}
                                error={err.guardian_phone}
                            />
                            <Input
                                label="Email"
                                type="email"
                                value={form.data.guardian_email}
                                onChange={(e) => form.setData('guardian_email', e.target.value)}
                                error={err.guardian_email}
                            />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Health, welfare & notes" description="Medical notes are visible to authorised staff only.">
                        <FormGrid cols={2}>
                            <Textarea
                                label="Medical / welfare notes"
                                value={form.data.medical_notes}
                                onChange={(e) => form.setData('medical_notes', e.target.value)}
                                error={err.medical_notes}
                            />
                            <Textarea
                                label="Office notes"
                                value={form.data.notes}
                                onChange={(e) => form.setData('notes', e.target.value)}
                                error={err.notes}
                                placeholder="Documents received, fees paid, sibling at school…"
                            />
                        </FormGrid>
                    </FormSection>

                    <div className="flex items-center justify-center gap-3 pt-2">
                        <Link href={editing ? `/admissions/${application.id}` : '/admissions'} className="btn btn-outline-dark">
                            Cancel
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={form.processing}>
                            {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {editing ? 'Save changes' : 'Submit application'}
                        </button>
                    </div>
                </div>
            </form>
        </>
    );
}
