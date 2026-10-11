import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { PrintButton } from '@/components/ui/actions';
import Avatar from '@/components/ui/avatar';
import PageHeader from '@/components/ui/page-header';
import { date, titleCase } from '@/lib/utils';

type Props = {
    student: { id: number; full_name: string; admission_no: string; photo_url: string | null; class: string; gender: string; date_of_birth: string | null; blood_group: string | null; guardian_phone: string | null; residence_type: string };
    validUntil: string | null;
};

export default function IdCard({ student, validUntil }: Props) {
    const { school } = usePage().props;
    return (
        <>
            <PageHeader
                title="Student ID Card"
                breadcrumbs={[{ title: 'Students', href: '/students' }, { title: student.full_name, href: `/students/${student.id}` }, { title: 'ID card' }]}
                actions={
                    <>
                        <Link href={`/students/${student.id}`} className="btn btn-outline-dark">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        <PrintButton label="Print card" />
                    </>
                }
            />
            <div className="flex justify-center py-6">
                <div className="w-[340px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(67,97,238,0.5)] print:shadow-none dark:bg-black">
                    <div className="relative bg-gradient-to-r from-[#4361ee] to-[#805dca] px-5 pt-5 pb-14 text-white">
                        <div className="flex items-center gap-2">
                            {school?.logo_url ? <img src={school.logo_url} className="h-9 w-9 rounded-md bg-white object-cover" /> : <GraduationCap className="h-9 w-9" />}
                            <div>
                                <div className="text-sm leading-tight font-extrabold uppercase">{school?.name}</div>
                                <div className="text-[10px] opacity-80">STUDENT IDENTITY CARD</div>
                            </div>
                        </div>
                    </div>
                    <div className="-mt-10 flex flex-col items-center px-5 pb-5">
                        <Avatar name={student.full_name} src={student.photo_url} className="h-24 w-24 rounded-xl border-4 border-white text-xl shadow dark:border-black" />
                        <div className="mt-3 text-center text-lg font-extrabold text-black dark:text-white-light">{student.full_name}</div>
                        <div className="badge badge-soft-primary mt-1">{student.admission_no}</div>
                        <dl className="mt-4 grid w-full grid-cols-2 gap-y-2 text-xs">
                            <dt className="text-white-dark">Class</dt>
                            <dd className="text-end font-bold">{student.class}</dd>
                            <dt className="text-white-dark">Gender</dt>
                            <dd className="text-end font-bold">{titleCase(student.gender)}</dd>
                            <dt className="text-white-dark">Date of birth</dt>
                            <dd className="text-end font-bold">{date(student.date_of_birth)}</dd>
                            <dt className="text-white-dark">Residence</dt>
                            <dd className="text-end font-bold">{titleCase(student.residence_type)}</dd>
                            <dt className="text-white-dark">Blood group</dt>
                            <dd className="text-end font-bold">{student.blood_group ?? '—'}</dd>
                            <dt className="text-white-dark">Emergency</dt>
                            <dd className="text-end font-bold">{student.guardian_phone ?? '—'}</dd>
                        </dl>
                        <div className="mt-4 w-full border-t border-dashed border-white-light pt-3 text-center text-[10px] text-white-dark dark:border-[#1b2e4b]">
                            Valid until {date(validUntil)} · If found, please return to the school office.
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
