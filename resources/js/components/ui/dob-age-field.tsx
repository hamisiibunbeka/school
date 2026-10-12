import { useEffect, useState } from 'react';
import { DatePicker, ymd } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/form';

/** Completed years between a "Y-m-d" date of birth and today. */
export function ageFromDob(dob: string | null | undefined, today = new Date()): number | null {
    const m = dob?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    let age = today.getFullYear() - y;
    if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
    return age >= 0 ? age : null;
}

/**
 * Date of birth for someone who is exactly `age` years old today. Keeps the day and month
 * of an existing DOB when there is one, otherwise uses today's day and month.
 */
export function dobFromAge(age: number, currentDob?: string | null, today = new Date()): string {
    const m = currentDob?.match(/^\d{4}-(\d{2})-(\d{2})/);
    const month = m ? Number(m[1]) - 1 : today.getMonth();
    const day = m ? Number(m[2]) : today.getDate();

    let candidate = new Date(today.getFullYear() - age, month, day);
    // Birthday still to come this year → born a year earlier.
    if (ageFromDob(ymd(candidate), today) !== age) candidate = new Date(today.getFullYear() - age - 1, month, day);
    // Guard against invalid days (e.g. 29 Feb in a non-leap year rolling into March).
    if (candidate.getDate() !== day) candidate = new Date(candidate.getFullYear(), candidate.getMonth(), 0);

    return ymd(candidate);
}

/**
 * Date of birth + age (years) that update each other:
 * entering an age calculates the date of birth, picking a date shows the age.
 */
export default function DobAgeField({
    value,
    onChange,
    error,
    label = 'Date of birth',
    required,
    minAge = 0,
    maxAge = 100,
    name = 'date_of_birth',
    typicalAge,
}: {
    value: string | null | undefined;
    onChange: (dob: string) => void;
    error?: string;
    label?: string;
    required?: boolean;
    minAge?: number;
    maxAge?: number;
    name?: string;
    /** Age the empty calendar opens at (defaults to midway between min and max). */
    typicalAge?: number;
}) {
    const [age, setAge] = useState<string>(() => ageFromDob(value)?.toString() ?? '');
    const [ageError, setAgeError] = useState<string | null>(null);

    // DOB → age (whenever the date changes from the picker or the server).
    useEffect(() => {
        const computed = ageFromDob(value);
        setAge((current) => (computed === null ? (value ? current : '') : String(computed)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const onAgeChange = (raw: string) => {
        const digits = raw.replace(/\D/g, '').slice(0, 3);
        setAge(digits);
        setAgeError(null);
        if (digits === '') return;

        const years = Number(digits);
        if (years < minAge || years > maxAge) {
            setAgeError(`Age must be between ${minAge} and ${maxAge} years.`);
            return;
        }
        onChange(dobFromAge(years, value));
    };

    const max = ymd(new Date());

    return (
        <Field label={label} required={required} error={error ?? ageError ?? undefined} help="Pick the date, or type the age and the date is filled in for you." htmlFor={name}>
            <div className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                    <DatePicker id={name} name={name} value={value ?? ''} max={max} required={required} onValueChange={onChange} openTo={dobFromAge(typicalAge ?? Math.round((minAge + maxAge) / 2))} />
                </div>
                <div className="relative w-28 shrink-0">
                    <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Age in years"
                        className="form-input pe-12"
                        placeholder="Age"
                        value={age}
                        onChange={(e) => onAgeChange(e.target.value)}
                    />
                    <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white-dark">yrs</span>
                </div>
            </div>
        </Field>
    );
}
