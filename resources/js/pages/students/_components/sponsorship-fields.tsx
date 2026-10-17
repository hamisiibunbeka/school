import { Paperclip, Undo2, X } from 'lucide-react';
import { DateInput } from '@/components/ui/date-picker';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { Option } from '@/types';

export type SponsorOption = Option & {
    type: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    active_count: number;
};

export type SponsorshipInput = {
    sponsor_id: string;
    sponsor: { name: string; type: string; contact_person: string; phone: string; email: string; address: string };
    coverage: string;
    percentage: string;
    covers: string;
    reference: string;
    start_date: string;
    end_date: string;
    notes: string;
    attachment: File | null;
    remove_attachment: boolean;
};

export type CurrentAttachment = { name: string; url: string } | null;

export const MAX_ATTACHMENT_MB = 5;

export const emptySponsorship = (): SponsorshipInput => ({
    sponsor_id: '',
    sponsor: { name: '', type: 'organization', contact_person: '', phone: '', email: '', address: '' },
    coverage: 'full',
    percentage: '',
    covers: '',
    reference: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    notes: '',
    attachment: null,
    remove_attachment: false,
});

const fileSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const COVER_CHIPS = ['Tuition', 'Boarding', 'Meals', 'Uniform', 'Transport', 'Exams', 'Books & stationery'];

/**
 * Sponsor picker (existing or new) plus the sponsorship terms.
 * `errorPrefix` maps server errors, e.g. "sponsorship." on the admission form.
 */
export default function SponsorshipFields({
    value,
    onChange,
    errors,
    errorPrefix = '',
    sponsors,
    sponsorTypes,
    lockSponsor = false,
    currentAttachment = null,
}: {
    value: SponsorshipInput;
    onChange: (next: SponsorshipInput) => void;
    errors: Record<string, string>;
    errorPrefix?: string;
    sponsors: SponsorOption[];
    sponsorTypes: Option[];
    lockSponsor?: boolean;
    currentAttachment?: CurrentAttachment;
}) {
    const err = (k: string) => errors[`${errorPrefix}${k}`];
    const set = (patch: Partial<SponsorshipInput>) => onChange({ ...value, ...patch });
    const setSponsor = (patch: Partial<SponsorshipInput['sponsor']>) => onChange({ ...value, sponsor: { ...value.sponsor, ...patch } });
    const mode = value.sponsor_id ? 'existing' : 'new';
    const chosen = sponsors.find((s) => String(s.value) === value.sponsor_id);
    const covers = value.covers
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

    const tooBig = !!value.attachment && value.attachment.size > MAX_ATTACHMENT_MB * 1048576;

    const toggleCover = (c: string) => set({ covers: (covers.includes(c) ? covers.filter((x) => x !== c) : [...covers, c]).join(', ') });

    const pick = (id: string) => {
        const s = sponsors.find((x) => String(x.value) === id);
        onChange({
            ...value,
            sponsor_id: id,
            sponsor: s
                ? { name: s.label, type: s.type, contact_person: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '' }
                : emptySponsorship().sponsor,
        });
    };

    return (
        <div className="space-y-4">
            {!lockSponsor && (
                <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                    <button
                        type="button"
                        className={cn('btn btn-sm', mode === 'existing' ? 'btn-primary' : 'btn-outline-primary')}
                        disabled={!sponsors.length}
                        onClick={() => sponsors[0] && pick(String(sponsors[0].value))}
                    >
                        Existing sponsor{sponsors.length ? ` (${sponsors.length})` : ''}
                    </button>
                    <button type="button" className={cn('btn btn-sm', mode === 'new' ? 'btn-primary' : 'btn-outline-primary')} onClick={() => pick('')}>
                        New sponsor
                    </button>
                </div>
            )}

            {mode === 'existing' && !lockSponsor && (
                <Select
                    label="Sponsor"
                    required
                    value={value.sponsor_id}
                    onChange={(e) => pick(e.target.value)}
                    options={sponsors.map((s) => ({ value: s.value, label: `${s.label}${s.active_count ? ` — sponsoring ${s.active_count}` : ''}` }))}
                    error={err('sponsor_id')}
                />
            )}

            <FormGrid cols={3}>
                {(mode === 'new' || lockSponsor) && (
                    <Input
                        label="Sponsor name"
                        required
                        value={value.sponsor.name}
                        onChange={(e) => setSponsor({ name: e.target.value })}
                        error={err('sponsor.name')}
                        placeholder="e.g. Compassion Tanzania"
                        wrapperClassName="sm:col-span-2"
                    />
                )}
                {(mode === 'new' || lockSponsor) && (
                    <Select label="Sponsor type" value={value.sponsor.type} onChange={(e) => setSponsor({ type: e.target.value })} options={sponsorTypes} />
                )}
                <Input
                    label="Contact person"
                    value={value.sponsor.contact_person}
                    onChange={(e) => setSponsor({ contact_person: e.target.value })}
                    error={err('sponsor.contact_person')}
                />
                <Input label="Sponsor phone" value={value.sponsor.phone} onChange={(e) => setSponsor({ phone: e.target.value })} error={err('sponsor.phone')} placeholder="+255…" />
                <Input label="Sponsor email" type="email" value={value.sponsor.email} onChange={(e) => setSponsor({ email: e.target.value })} error={err('sponsor.email')} />
            </FormGrid>
            {chosen && !lockSponsor && <p className="-mt-2 text-xs text-white-dark">Changes to the contact details update this sponsor for all their students.</p>}

            <div className="rounded-md border border-dashed border-white-light p-3 dark:border-[#1b2e4b]">
                <div className="mb-3 text-xs font-bold tracking-wide text-white-dark uppercase">Sponsorship terms</div>
                <FormGrid cols={3}>
                    <Field label="Coverage" required error={err('coverage')}>
                        <div className="grid grid-cols-2 gap-2">
                            {(['full', 'partial'] as const).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    className={cn('btn btn-sm', value.coverage === c ? 'btn-success' : 'btn-outline-success')}
                                    onClick={() => set({ coverage: c })}
                                >
                                    {c === 'full' ? 'Full' : 'Partial'}
                                </button>
                            ))}
                        </div>
                    </Field>
                    {value.coverage === 'partial' ? (
                        <Input
                            label="Percentage covered"
                            type="number"
                            min={1}
                            max={99.99}
                            step="any"
                            required
                            value={value.percentage}
                            onChange={(e) => set({ percentage: e.target.value })}
                            error={err('percentage')}
                            placeholder="e.g. 60"
                        />
                    ) : (
                        <div />
                    )}
                    <Input label="Agreement / bursary ref." value={value.reference} onChange={(e) => set({ reference: e.target.value })} error={err('reference')} />
                    <Field label="Start date" error={err('start_date')}>
                        <DateInput className="form-input" value={value.start_date} onChange={(e) => set({ start_date: e.target.value })} />
                    </Field>
                    <Field label="End date" error={err('end_date')} help="Leave empty if open-ended.">
                        <DateInput className="form-input" value={value.end_date} clearable onChange={(e) => set({ end_date: e.target.value })} />
                    </Field>
                </FormGrid>
                <Field
                    label="Attachment (optional)"
                    error={err('attachment') ?? (tooBig ? `The file is larger than ${MAX_ATTACHMENT_MB} MB.` : undefined)}
                    help="Sponsorship agreement, bursary or award letter — PDF, JPG/PNG or Word, up to 5 MB."
                >
                    <div className="space-y-2">
                        {currentAttachment && !value.attachment && (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <Paperclip className="h-4 w-4 text-white-dark" />
                                {value.remove_attachment ? (
                                    <>
                                        <span className="text-white-dark line-through">{currentAttachment.name}</span>
                                        <span className="text-xs text-danger">will be removed on save</span>
                                        <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => set({ remove_attachment: false })}>
                                            <Undo2 className="h-3.5 w-3.5" /> Keep
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <a href={currentAttachment.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                                            {currentAttachment.name}
                                        </a>
                                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => set({ remove_attachment: true })}>
                                            <X className="h-3.5 w-3.5" /> Remove
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                        {value.attachment ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <Paperclip className="h-4 w-4 text-success" />
                                <span className="font-semibold">{value.attachment.name}</span>
                                <span className="text-xs text-white-dark">{fileSize(value.attachment.size)}</span>
                                {currentAttachment && <span className="text-xs text-warning">replaces {currentAttachment.name}</span>}
                                <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => set({ attachment: null })}>
                                    <X className="h-3.5 w-3.5" /> Clear
                                </button>
                            </div>
                        ) : (
                            <input
                                type="file"
                                className="form-input file:me-3 file:rounded file:border-0 file:bg-primary-light file:px-3 file:py-1 file:text-primary"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                onChange={(e) => set({ attachment: e.target.files?.[0] ?? null, remove_attachment: false })}
                            />
                        )}
                    </div>
                </Field>
                <Field label="What the sponsor pays for" error={err('covers')}>
                    <div className="flex flex-wrap gap-1.5">
                        {COVER_CHIPS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => toggleCover(c)}
                                className={cn('badge cursor-pointer', covers.includes(c) ? 'badge-primary' : 'badge-outline-primary')}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </Field>
            </div>
        </div>
    );
}
