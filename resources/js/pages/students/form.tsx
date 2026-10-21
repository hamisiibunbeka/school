import { Link, useForm } from '@inertiajs/react';
import { Camera, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import { ClassLevelSelect, classesOfLevel, levelOfClass } from '@/components/ui/class-level';
import { Checkbox, FormGrid, FormSection, Input, Select, Textarea } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import type { Option } from '@/types';
import DobAgeField from '@/components/ui/dob-age-field';
import SponsorshipFields, { emptySponsorship, type SponsorOption } from './_components/sponsorship-fields';

type GuardianInput = { id?: number | null; first_name: string; last_name: string; phone: string; email: string; occupation: string; relationship: string; is_primary: boolean };

type StudentData = {
    id: number;
    admission_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    gender: string;
    date_of_birth: string | null;
    nationality: string | null;
    religion: string | null;
    birth_cert_no: string | null;
    address: string | null;
    school_class_id: number | null;
    stream_id: number | null;
    residence_type: string;
    admission_date: string | null;
    previous_school: string | null;
    medical_notes: string | null;
    allergies: string | null;
    blood_group: string | null;
    photo_url: string | null;
    full_name: string;
    guardians: (GuardianInput & { id: number; pivot: { relationship: string; is_primary: boolean } })[];
    sponsorship: {
        id: number;
        attachment_name: string | null;
        sponsor_id: number;
        coverage: string;
        percentage: string | null;
        covers: string | null;
        reference: string | null;
        start_date: string | null;
        end_date: string | null;
    } | null;
};

type Props = { student: StudentData | null; classes: (Option & { education_level?: string; streams: Option[] })[]; sponsors: SponsorOption[]; sponsorTypes: Option[] };

const emptyGuardian = (primary = false): GuardianInput => ({ id: null, first_name: '', last_name: '', phone: '', email: '', occupation: '', relationship: primary ? 'Father' : 'Mother', is_primary: primary });
const relationships = ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor'];

export default function StudentForm({ student, classes, sponsors, sponsorTypes }: Props) {
    const editing = !!student;
    const current = student?.sponsorship ?? null;
    const currentSponsor = current ? sponsors.find((x) => x.value === current.sponsor_id) : undefined;
    const form = useForm({
        _method: editing ? 'put' : 'post',
        admission_no: student?.admission_no ?? '',
        first_name: student?.first_name ?? '',
        middle_name: student?.middle_name ?? '',
        last_name: student?.last_name ?? '',
        gender: student?.gender ?? '',
        date_of_birth: student?.date_of_birth ?? '',
        nationality: student?.nationality ?? 'Tanzanian',
        religion: student?.religion ?? '',
        birth_cert_no: student?.birth_cert_no ?? '',
        address: student?.address ?? '',
        school_class_id: student?.school_class_id ? String(student.school_class_id) : '',
        stream_id: student?.stream_id ? String(student.stream_id) : '',
        residence_type: student?.residence_type ?? 'day',
        admission_date: student?.admission_date ?? new Date().toISOString().slice(0, 10),
        previous_school: student?.previous_school ?? '',
        medical_notes: student?.medical_notes ?? '',
        allergies: student?.allergies ?? '',
        blood_group: student?.blood_group ?? '',
        photo: null as File | null,
        guardians: student?.guardians?.length
            ? student.guardians.map((g) => ({
                  id: g.id,
                  first_name: g.first_name,
                  last_name: g.last_name,
                  phone: g.phone,
                  email: g.email ?? '',
                  occupation: g.occupation ?? '',
                  relationship: g.pivot.relationship,
                  is_primary: !!g.pivot.is_primary,
              }))
            : [emptyGuardian(true)],
        sponsorship: {
            enabled: !!current,
            ...emptySponsorship(),
            ...(current
                ? {
                      sponsor_id: String(current.sponsor_id),
                      sponsor: {
                          name: currentSponsor?.label ?? '',
                          type: currentSponsor?.type ?? 'organization',
                          contact_person: currentSponsor?.contact_person ?? '',
                          phone: currentSponsor?.phone ?? '',
                          email: currentSponsor?.email ?? '',
                          address: currentSponsor?.address ?? '',
                      },
                      coverage: current.coverage,
                      percentage: current.percentage ? String(Number(current.percentage)) : '',
                      covers: current.covers ?? '',
                      reference: current.reference ?? '',
                      start_date: current.start_date ?? '',
                      end_date: current.end_date ?? '',
                  }
                : {}),
        },
    });

    const streams = classes.find((c) => String(c.value) === form.data.school_class_id)?.streams ?? [];
    // Pick the level first (multi-level schools), then one of that level's classes.
    const [level, setLevel] = useState(() => levelOfClass(classes, form.data.school_class_id));
    const err = form.errors as Record<string, string>;

    const setGuardian = (i: number, key: keyof GuardianInput, value: string | boolean) => {
        const next = form.data.guardians.map((g, idx) => {
            if (key === 'is_primary' && value === true) return { ...g, is_primary: idx === i };
            return idx === i ? { ...g, [key]: value } : g;
        });
        form.setData('guardians', next);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post(editing ? `/students/${student.id}` : '/students', { forceFormData: true, preserveScroll: true });
    };

    const photoPreview = form.data.photo ? URL.createObjectURL(form.data.photo) : student?.photo_url;

    return (
        <>
            <PageHeader
                title={editing ? `Edit ${student.full_name}` : 'Admit New Student'}
                subtitle={editing ? `Admission no. ${student.admission_no}` : 'Capture bio-data, class placement and guardians in one step.'}
                breadcrumbs={[{ title: 'Students', href: '/students' }, { title: editing ? 'Edit' : 'New student' }]}
            />

            <form onSubmit={submit} className="grid grid-cols-1 gap-6 xl:grid-cols-4">
                <div className="panel h-max xl:sticky xl:top-24">
                    <div className="flex flex-col items-center text-center">
                        <div className="relative">
                            <Avatar name={`${form.data.first_name} ${form.data.last_name}`} src={photoPreview} className="h-32 w-32 text-3xl" />
                            <label className="absolute end-1 bottom-1 mb-0 grid h-9 w-9 cursor-pointer place-content-center rounded-full bg-primary text-white shadow-lg">
                                <Camera className="h-4 w-4" />
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => form.setData('photo', e.target.files?.[0] ?? null)} />
                            </label>
                        </div>
                        <p className="mt-3 text-xs text-white-dark">Passport photo · JPG/PNG up to 2 MB</p>
                        {err.photo && <p className="form-error">{err.photo}</p>}
                        <div className="mt-5 w-full">
                            <Input
                                label="Admission number"
                                name="admission_no"
                                value={form.data.admission_no}
                                onChange={(e) => form.setData('admission_no', e.target.value)}
                                error={err.admission_no}
                                placeholder="Auto-generated if blank"
                            />
                        </div>
                    </div>
                </div>

                <div className="panel space-y-6 xl:col-span-3">
                    <FormSection title="Personal details" description="Legal names and identification as they appear on the birth certificate.">
                        <FormGrid cols={3}>
                            <Input label="First name" name="first_name" required value={form.data.first_name} onChange={(e) => form.setData('first_name', e.target.value)} error={err.first_name} />
                            <Input label="Middle name" name="middle_name" value={form.data.middle_name} onChange={(e) => form.setData('middle_name', e.target.value)} error={err.middle_name} />
                            <Input label="Last name" name="last_name" required value={form.data.last_name} onChange={(e) => form.setData('last_name', e.target.value)} error={err.last_name} />
                            <Select
                                label="Gender"
                                name="gender"
                                required
                                placeholder="Select…"
                                value={form.data.gender}
                                onChange={(e) => form.setData('gender', e.target.value)}
                                options={[
                                    { value: 'male', label: 'Male' },
                                    { value: 'female', label: 'Female' },
                                ]}
                                error={err.gender}
                            />
                            <DobAgeField value={form.data.date_of_birth} onChange={(v) => form.setData('date_of_birth', v)} error={err.date_of_birth} minAge={2} maxAge={30} typicalAge={14} />
                            <Input label="Birth certificate no." name="birth_cert_no" value={form.data.birth_cert_no} onChange={(e) => form.setData('birth_cert_no', e.target.value)} />
                            <Input label="Nationality" name="nationality" value={form.data.nationality} onChange={(e) => form.setData('nationality', e.target.value)} />
                            <Input label="Religion" name="religion" value={form.data.religion} onChange={(e) => form.setData('religion', e.target.value)} />
                            <Input label="Home address" name="address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Class placement" description="Where the learner sits this academic year.">
                        <FormGrid cols={3}>
                            <ClassLevelSelect
                                classes={classes}
                                value={level}
                                onChange={(l) => {
                                    setLevel(l);
                                    form.setData((d) => ({ ...d, school_class_id: '', stream_id: '' }));
                                }}
                            />
                            <Select
                                label="Class"
                                name="school_class_id"
                                required
                                placeholder="Select class…"
                                value={form.data.school_class_id}
                                onChange={(e) => form.setData((d) => ({ ...d, school_class_id: e.target.value, stream_id: '' }))}
                                options={classesOfLevel(classes, level)}
                                error={err.school_class_id}
                            />
                            <Select label="Stream" name="stream_id" placeholder={streams.length ? 'Select stream…' : 'No streams'} value={form.data.stream_id} onChange={(e) => form.setData('stream_id', e.target.value)} options={streams} error={err.stream_id} />
                            <Select
                                label="Residence"
                                name="residence_type"
                                required
                                value={form.data.residence_type}
                                onChange={(e) => form.setData('residence_type', e.target.value)}
                                options={[
                                    { value: 'day', label: 'Day scholar' },
                                    { value: 'boarding', label: 'Boarder' },
                                ]}
                            />
                            <Input label="Admission date" type="date" name="admission_date" value={form.data.admission_date} onChange={(e) => form.setData('admission_date', e.target.value)} error={err.admission_date} />
                            <Input label="Previous school" name="previous_school" value={form.data.previous_school} onChange={(e) => form.setData('previous_school', e.target.value)} wrapperClassName="sm:col-span-2" />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Health & welfare" description="Visible only to authorised staff (nurse, boarding, administrators).">
                        <FormGrid cols={3}>
                            <Input label="Blood group" name="blood_group" value={form.data.blood_group} onChange={(e) => form.setData('blood_group', e.target.value)} placeholder="e.g. O+" />
                            <Input label="Allergies" name="allergies" value={form.data.allergies} onChange={(e) => form.setData('allergies', e.target.value)} wrapperClassName="sm:col-span-2" />
                            <Textarea label="Medical notes" name="medical_notes" value={form.data.medical_notes} onChange={(e) => form.setData('medical_notes', e.target.value)} wrapperClassName="sm:col-span-3" rows={2} />
                        </FormGrid>
                    </FormSection>

                    <FormSection title="Parents & guardians" description="Existing guardians are matched by phone number, so siblings share the same parent record.">
                        <div className="space-y-4">
                            {form.data.guardians.map((g, i) => (
                                <div key={i} className="rounded-md border border-white-light p-4 dark:border-[#1b2e4b]">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="font-bold">Guardian {i + 1}</span>
                                        <div className="flex items-center gap-4">
                                            <Checkbox label="Primary contact" checked={g.is_primary} onChange={(e) => setGuardian(i, 'is_primary', e.target.checked)} />
                                            {form.data.guardians.length > 1 && (
                                                <button type="button" className="text-danger hover:opacity-70" onClick={() => form.setData('guardians', form.data.guardians.filter((_, idx) => idx !== i))}>
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <FormGrid cols={3}>
                                        <Select label="Relationship" value={g.relationship} onChange={(e) => setGuardian(i, 'relationship', e.target.value)} options={relationships} error={err[`guardians.${i}.relationship`]} />
                                        <Input label="First name" required value={g.first_name} onChange={(e) => setGuardian(i, 'first_name', e.target.value)} error={err[`guardians.${i}.first_name`]} />
                                        <Input label="Last name" required value={g.last_name} onChange={(e) => setGuardian(i, 'last_name', e.target.value)} error={err[`guardians.${i}.last_name`]} />
                                        <Input label="Phone" required value={g.phone} onChange={(e) => setGuardian(i, 'phone', e.target.value)} error={err[`guardians.${i}.phone`]} placeholder="+255…" />
                                        <Input label="Email" type="email" value={g.email} onChange={(e) => setGuardian(i, 'email', e.target.value)} error={err[`guardians.${i}.email`]} />
                                        <Input label="Occupation" value={g.occupation} onChange={(e) => setGuardian(i, 'occupation', e.target.value)} />
                                    </FormGrid>
                                </div>
                            ))}
                            {form.data.guardians.length < 4 && (
                                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => form.setData('guardians', [...form.data.guardians, emptyGuardian(false)])}>
                                    <Plus className="h-4 w-4" /> Add another guardian
                                </button>
                            )}
                        </div>
                    </FormSection>

                    <FormSection title="Sponsorship" description="Who pays for or supports this student's education, if not (only) the parents — NGO, church, company, government bursary or a well-wisher.">
                        <div className="space-y-4">
                            <Checkbox
                                label="This student is sponsored"
                                checked={form.data.sponsorship.enabled}
                                onChange={(e) => form.setData('sponsorship', { ...form.data.sponsorship, enabled: e.target.checked })}
                            />
                            {editing && current && !form.data.sponsorship.enabled && (
                                <p className="text-sm text-warning">Saving will end the current sponsorship (it stays in the student's sponsorship history).</p>
                            )}
                            {form.data.sponsorship.enabled && (
                                <SponsorshipFields
                                    value={form.data.sponsorship}
                                    onChange={(next) => form.setData('sponsorship', { ...next, enabled: true })}
                                    errors={err}
                                    errorPrefix="sponsorship."
                                    sponsors={sponsors}
                                    sponsorTypes={sponsorTypes}
                                    currentAttachment={
                                        current?.attachment_name && form.data.sponsorship.sponsor_id === String(current.sponsor_id)
                                            ? { name: current.attachment_name, url: `/sponsorships/${current.id}/attachment` }
                                            : null
                                    }
                                />
                            )}
                        </div>
                    </FormSection>

                    <div className="flex items-center justify-center gap-3 pt-2">
                        <Link href={editing ? `/students/${student.id}` : '/students'} className="btn btn-outline-dark">
                            Cancel
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={form.processing}>
                            {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {editing ? 'Save changes' : 'Admit student'}
                        </button>
                    </div>
                </div>
            </form>
        </>
    );
}
