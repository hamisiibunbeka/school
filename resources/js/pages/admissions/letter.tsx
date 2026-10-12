import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import Letterhead from '@/components/ui/letterhead';
import PageHeader from '@/components/ui/page-header';
import { date, titleCase, today, weekdayDate } from '@/lib/utils';

type Props = {
    application: {
        id: number;
        application_no: string;
        full_name: string;
        first_name: string;
        gender: string;
        class: string | null;
        year: string | null;
        reporting_date: string | null;
        residence_type: string;
        guardian_name: string;
        guardian_phone: string;
        address: string | null;
        decided_at: string | null;
        decider: string | null;
        admission_no: string | null;
        status: string;
    };
};

export default function AdmissionLetter({ application: a }: Props) {
    const { school } = usePage().props;
    const pronoun = a.gender === 'female' ? 'her' : 'his';
    const schoolName = school?.name ?? 'the school';

    return (
        <>
            <PageHeader
                title="Admission Letter"
                breadcrumbs={[{ title: 'Admissions', href: '/admissions' }, { title: a.application_no, href: `/admissions/${a.id}` }, { title: 'Letter' }]}
                actions={
                    <>
                        <Link href={`/admissions/${a.id}`} className="btn btn-outline-dark no-print">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        <PrintButton label="Print letter" />
                    </>
                }
            />

            <div className="panel mx-auto max-w-3xl p-8 print:max-w-none print:p-0 print:shadow-none">
                <Letterhead
                    title="Letter of Admission"
                    meta={
                        <>
                            <div>
                                Ref: <strong>{a.application_no}</strong>
                            </div>
                            {a.admission_no && (
                                <div>
                                    Adm. No: <strong>{a.admission_no}</strong>
                                </div>
                            )}
                            <div>Date: {date(a.decided_at ?? today())}</div>
                        </>
                    }
                />

                <div className="space-y-4 text-[15px] leading-relaxed text-black dark:text-white-light">
                    <div>
                        <div className="font-bold">{a.guardian_name}</div>
                        {a.address && <div>{a.address}</div>}
                        <div>Tel: {a.guardian_phone}</div>
                    </div>

                    <p>Dear Parent/Guardian,</p>

                    <p className="font-extrabold uppercase underline">
                        RE: Offer of admission — {a.full_name} to {a.class ?? 'the school'} {a.year ? `(${a.year})` : ''}
                    </p>

                    <p>
                        We are pleased to inform you that <strong>{a.full_name}</strong> has been offered a place at <strong>{schoolName}</strong> in <strong>{a.class}</strong> for the {a.year ?? 'coming'} academic year as a{' '}
                        <strong>{a.residence_type === 'boarding' ? 'boarding' : 'day'}</strong> student. This offer follows a review of {pronoun} application and assessment.
                    </p>

                    <p>
                        The learner is expected to report to school on <strong>{a.reporting_date ? weekdayDate(a.reporting_date) : 'the first day of term'}</strong> between 08:00 and 14:00, accompanied by a
                        parent or guardian.
                    </p>

                    <div>
                        <p className="font-bold">Please bring the following on the reporting day:</p>
                        <ol className="ms-6 list-decimal space-y-1">
                            <li>This admission letter and a copy of the birth certificate.</li>
                            <li>Primary school leaving certificate / results slip and transfer letter (where applicable).</li>
                            <li>Two recent passport-size photographs.</li>
                            <li>Medical examination form completed by a registered practitioner.</li>
                            <li>Proof of payment of the first instalment of school fees as per the attached fee structure.</li>
                            {a.residence_type === 'boarding' && <li>Boarding requirements: mattress, bedding, mosquito net, bucket, and personal toiletries.</li>}
                            <li>Full school uniform as specified by the school.</li>
                        </ol>
                    </div>

                    <p>
                        Kindly confirm acceptance of this offer within fourteen (14) days of the date of this letter. Failure to confirm may result in the place being offered to a waitlisted applicant.
                    </p>

                    <p>
                        We congratulate {a.first_name} and look forward to welcoming {pronoun === 'her' ? 'her' : 'him'} to the {schoolName} family.
                    </p>

                    <div className="pt-10">
                        <p>Yours faithfully,</p>
                        <div className="mt-12 w-64 border-t border-dashed border-black pt-1 dark:border-white-light">
                            <div className="font-bold">{a.decider ?? 'Head of School'}</div>
                            <div className="text-sm text-white-dark">For: Head of School</div>
                        </div>
                    </div>

                    <div className="mt-10 border-t-2 border-dashed border-white-light pt-6 dark:border-[#1b2e4b]">
                        <p className="mb-4 text-center text-sm font-bold uppercase">Acceptance slip (detach and return)</p>
                        <p className="text-sm">
                            I, ____________________________________, parent/guardian of <strong>{a.full_name}</strong> ({titleCase(a.gender)}), accept the offer of admission to {a.class} for {a.year}.
                        </p>
                        <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
                            <div className="border-t border-black pt-1 dark:border-white-light">Signature</div>
                            <div className="border-t border-black pt-1 dark:border-white-light">Date</div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
