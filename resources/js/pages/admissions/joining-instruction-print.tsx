import { Link } from '@inertiajs/react';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
import { PrintButton } from '@/components/ui/actions';
import EmptyState from '@/components/ui/empty-state';
import { date, num } from '@/lib/utils';
import type { JoiningTemplate } from './joining-instructions';

type Letter = {
    id: number;
    application_no: string;
    student_name: string;
    gender: string;
    combination: string | null;
    combination_name: string | null;
    combination_items: string;
    year: string | null;
    csee_index_no: string | null;
    previous_school: string | null;
};
type School = { name: string | null; address: string | null; phone: string | null; email: string | null; logo_url: string | null; website: string | null };

const lines = (text: string | null | undefined) =>
    (text ?? '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

function fill(text: string, letter: Letter, school: School, t: JoiningTemplate) {
    const vars: Record<string, string> = {
        '{student_name}': letter.student_name,
        '{combination}': letter.combination ?? '',
        '{combination_name}': letter.combination_name ?? '',
        '{school_name}': (school.name ?? '').toUpperCase(),
        '{year}': letter.year ?? '',
        '{reporting_date}': t.reporting_date ? date(t.reporting_date) : '…………………',
    };
    return text.replace(/\{[a-z_]+\}/g, (m) => vars[m] ?? m);
}

function Heading({ children }: { children: ReactNode }) {
    return <h3 className="mt-5 mb-2 text-sm font-extrabold tracking-wide text-black uppercase underline dark:text-white-light">{children}</h3>;
}

function Blank({ w = 'w-48' }: { w?: string }) {
    return <span className={`inline-block border-b border-dotted border-black align-bottom dark:border-white-light ${w}`}>&nbsp;</span>;
}

function Head({ school, t }: { school: School; t: JoiningTemplate }) {
    return (
        <div className="mb-4 border-b-2 border-black pb-3 text-center dark:border-white-light">
            {lines(t.authority).map((l) => (
                <div key={l} className="text-sm font-extrabold uppercase">
                    {l}
                </div>
            ))}
            {t.council && <div className="text-sm font-extrabold uppercase">{t.council}</div>}
            <div className="mt-2 flex items-center justify-between gap-4 text-start text-xs">
                <div className="space-y-0.5">
                    {school.email && <div>Barua pepe: {school.email}</div>}
                    {school.website && <div>Tovuti: {school.website}</div>}
                    {school.phone && <div>Simu: {school.phone}</div>}
                </div>
                {school.logo_url ? (
                    <img src={school.logo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                    <span className="grid h-16 w-16 place-content-center rounded-full border-2 border-black dark:border-white-light">
                        <GraduationCap className="h-8 w-8" />
                    </span>
                )}
                <div className="space-y-0.5 text-end">
                    <div>Mkuu wa Shule,</div>
                    <div className="font-bold">{school.name}</div>
                    {school.address && <div className="whitespace-pre-line">{school.address}</div>}
                </div>
            </div>
        </div>
    );
}

function Signature({ t }: { t: JoiningTemplate }) {
    return (
        <div className="mt-8 text-center">
            <div className="mx-auto mb-1 h-10 w-48 border-b border-dotted border-black dark:border-white-light" />
            {t.head_name && <div className="font-extrabold uppercase">{t.head_name}</div>}
            <div className="font-bold uppercase">{t.head_title || 'MKUU WA SHULE'}</div>
        </div>
    );
}

function LetterPages({ letter, school, t }: { letter: Letter; school: School; t: JoiningTemplate }) {
    const total = t.contributions.reduce((a, c) => a + Number(c.amount || 0), 0);
    return (
        <>
            <section className="joining-page panel mx-auto max-w-4xl text-[13px] leading-relaxed text-black dark:text-white-light">
                <Head school={school} t={t} />
                <div className="mb-3 flex justify-between text-sm">
                    <span className="font-bold">
                        Kumb: Na. {t.reference}
                        {letter.application_no}
                    </span>
                    <span>Tarehe: {date(new Date().toISOString().slice(0, 10))}</span>
                </div>
                <p>
                    JINA LA MWANAFUNZI: <b>{letter.student_name}</b>
                    {letter.csee_index_no && <span className="ms-3 text-xs">(Namba ya mtihani: {letter.csee_index_no})</span>}
                </p>
                <p className="my-3 text-center font-extrabold uppercase underline">{fill(t.subject, letter, school, t)}</p>
                <p>Kichwa cha habari hapo juu chahusika:</p>
                <div className="space-y-2 whitespace-pre-line">{fill(t.intro, letter, school, t)}</div>
                {!t.intro.includes('{combination}') && (
                    <p className="mt-2">
                        Tahasusi: <b>{letter.combination}</b> — {letter.combination_name}
                    </p>
                )}
                {t.directions && <div className="mt-3 whitespace-pre-line">{fill(t.directions, letter, school, t)}</div>}
                {lines(t.documents).length > 0 && (
                    <>
                        <Heading>Hakikisha unakuja na vitu vifuatavyo:</Heading>
                        <ol className="list-decimal space-y-1 ps-6">
                            {lines(t.documents).map((l, i) => (
                                <li key={i}>{l}</li>
                            ))}
                        </ol>
                    </>
                )}
                <p className="mt-3">
                    <b>ANGALIZO:</b> Hakikisha unafika shuleni ndani ya wiki ya kwanza ya kufungua shule.
                </p>
                <Signature t={t} />
            </section>

            {(lines(t.requirements).length > 0 || letter.combination_items || t.contributions.length > 0 || t.contacts || t.books || t.rules) && (
                <section className="joining-page panel mx-auto max-w-4xl text-[13px] leading-relaxed text-black dark:text-white-light">
                    {lines(t.requirements).length > 0 && (
                        <>
                            <Heading>Sare ya shule na mahitaji mengine</Heading>
                            <ol className="list-[lower-roman] space-y-1 ps-6">
                                {lines(t.requirements).map((l, i) => (
                                    <li key={i}>{l}</li>
                                ))}
                            </ol>
                        </>
                    )}
                    {letter.combination_items && (
                        <>
                            <Heading>Vifaa vya kuleta kwa tahasusi yako ({letter.combination})</Heading>
                            <p className="rounded border border-black px-3 py-2 dark:border-white-light">{letter.combination_items}</p>
                        </>
                    )}
                    {t.contributions.length > 0 && (
                        <>
                            <Heading>Michango mbalimbali ya shule</Heading>
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr>
                                        <th className="border border-black px-2 py-1 text-start dark:border-white-light">Na</th>
                                        <th className="border border-black px-2 py-1 text-start dark:border-white-light">Aina ya mchango</th>
                                        <th className="border border-black px-2 py-1 text-end dark:border-white-light">Kiasi (TZS)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {t.contributions.map((c, i) => (
                                        <tr key={i}>
                                            <td className="border border-black px-2 py-1 dark:border-white-light">{i + 1}</td>
                                            <td className="border border-black px-2 py-1 dark:border-white-light">{c.item}</td>
                                            <td className="border border-black px-2 py-1 text-end dark:border-white-light">{num(c.amount)}/=</td>
                                        </tr>
                                    ))}
                                    <tr className="font-bold">
                                        <td className="border border-black px-2 py-1 dark:border-white-light" colSpan={2}>
                                            Jumla
                                        </td>
                                        <td className="border border-black px-2 py-1 text-end dark:border-white-light">{num(total)}/=</td>
                                    </tr>
                                </tbody>
                            </table>
                            {(t.bank_name || t.account_no) && (
                                <div className="mt-2 text-sm">
                                    Michango yote ilipwe benki ya <b>{t.bank_name}</b>. Jina la akaunti: <b>{t.account_name}</b>. Akaunti Na: <b>{t.account_no}</b>
                                    {t.branch && (
                                        <>
                                            . Tawi: <b>{t.branch}</b>
                                        </>
                                    )}
                                    . Malipo yote yafanyike kupitia akaunti ya shule na si vinginevyo.
                                </div>
                            )}
                        </>
                    )}
                    {lines(t.contacts).length > 0 && (
                        <>
                            <Heading>Mawasiliano</Heading>
                            <ul className="list-disc space-y-0.5 ps-6">
                                {lines(t.contacts).map((l, i) => (
                                    <li key={i}>{l}</li>
                                ))}
                            </ul>
                        </>
                    )}
                    {t.books && (
                        <>
                            <Heading>Vitabu vinavyoshauriwa</Heading>
                            <div className="whitespace-pre-line">{t.books}</div>
                        </>
                    )}
                    {lines(t.rules).length > 0 && (
                        <>
                            <Heading>Sheria za shule</Heading>
                            <ol className="list-decimal space-y-1 ps-6">
                                {lines(t.rules).map((l, i) => (
                                    <li key={i}>{l}</li>
                                ))}
                            </ol>
                        </>
                    )}
                    {t.motto && <p className="mt-5 text-center font-extrabold italic">“{t.motto}”</p>}
                    <Signature t={t} />
                </section>
            )}

            {t.include_acceptance_form && (
                <section className="joining-page panel mx-auto max-w-4xl text-[13px] leading-loose text-black dark:text-white-light">
                    <div className="mb-3 font-bold">FOMU NA. 01</div>
                    <div className="mb-4 text-end">
                        Anwani ya mzazi/mlezi: <Blank /> <br />
                        Simu: <Blank w="w-32" /> Tarehe: <Blank w="w-28" />
                    </div>
                    <div>
                        MKUU WA SHULE,
                        <br />
                        {school.name}
                    </div>
                    <p className="my-3 text-center font-extrabold uppercase underline">
                        YAH: UTHIBITISHO WA KUKUBALI NAFASI YA KUJIUNGA NA KIDATO CHA TANO {letter.year} — {school.name}
                    </p>
                    <Heading>Sehemu A: (ijazwe na mwanafunzi)</Heading>
                    <p>
                        Mimi <b>{letter.student_name}</b> (Tahasusi <b>{letter.combination}</b>) niliyezaliwa tarehe <Blank w="w-24" /> mwezi <Blank w="w-24" /> mwaka{' '}
                        <Blank w="w-20" /> dini <Blank w="w-28" /> katika kijiji cha <Blank w="w-32" /> wilaya ya <Blank w="w-32" /> mkoa wa <Blank w="w-32" />.
                    </p>
                    <p>Nakubali nafasi niliyopewa ya kujiunga na kidato cha tano {school.name}. Pia nitatii sheria na miongozo yote ya shule.</p>
                    <p className="mt-3">
                        Sahihi ya mwanafunzi <Blank /> Tarehe <Blank w="w-32" />
                    </p>
                    <Heading>Sehemu B: (ijazwe na mzazi/mlezi)</Heading>
                    <p>
                        Mimi <Blank w="w-64" /> (jina kamili) wa kijiji/mtaa <Blank w="w-40" /> kata ya <Blank w="w-32" /> wilaya ya <Blank w="w-32" /> mkoa wa <Blank w="w-32" />{' '}
                        kazi yangu ni <Blank w="w-40" />.
                    </p>
                    <p>Nafurahi kupokea nafasi aliyopewa mwanangu. Nitatekeleza maagizo yote ya shule na kushirikiana na shule katika kumlea kitaaluma, kinidhamu na kimaadili.</p>
                    <p className="mt-3">
                        Sahihi ya mzazi/mlezi <Blank /> Tarehe <Blank w="w-32" />
                    </p>
                    <Heading>Sehemu C: (ijazwe na afisa mtendaji wa kijiji/mtaa/kata)</Heading>
                    <p>
                        Jina <Blank w="w-64" /> Sahihi <Blank w="w-32" />
                        <br />
                        Tarehe <Blank w="w-32" /> Muhuri <Blank w="w-40" />
                    </p>
                </section>
            )}

            {t.include_medical_form && (
                <section className="joining-page panel mx-auto max-w-4xl text-[13px] leading-loose text-black dark:text-white-light">
                    <div className="mb-3 font-bold">FOMU NA. 02</div>
                    <div className="mb-4">
                        Mganga <Blank w="w-56" />
                        <br />
                        Hospitali/Kituo cha afya <Blank w="w-56" />
                    </div>
                    <p className="my-3 text-center font-extrabold uppercase underline">YAH: KUPIMA AFYA (MEDICAL EXAMINATION)</p>
                    <p>
                        Tafadhali mpime mwanafunzi <b>{letter.student_name}</b> kama afya yake inamruhusu kuendelea na masomo ya kidato cha tano mwaka {letter.year}. Andika NDIYO
                        au HAPANA mbele ya ugonjwa kama aliugua.
                    </p>
                    <ol className="mt-2 grid list-decimal grid-cols-2 gap-x-8 ps-6">
                        {[
                            'Kifua kikuu',
                            'Ugonjwa wa moyo',
                            'Ugonjwa wa figo',
                            'Ugonjwa wa akili',
                            'Ajali kubwa',
                            'Pumu',
                            'Vidonda vya tumbo',
                            'Kifafa',
                            'Kupasuliwa',
                            'Seli mundu',
                        ].map((d) => (
                            <li key={d}>
                                {d} <Blank w="w-28" />
                            </li>
                        ))}
                    </ol>
                    <p className="mt-2">
                        Mengineyo <Blank w="w-[80%]" />
                    </p>
                    <Heading>Maelezo ya mganga</Heading>
                    <div className="h-16 border-b border-dotted border-black dark:border-white-light" />
                    <p className="mt-3">
                        Jina la hospitali/kituo cha afya <Blank w="w-64" />
                        <br />
                        Jina la mganga <Blank w="w-48" /> Sahihi <Blank w="w-32" />
                        <br />
                        Tarehe <Blank w="w-32" /> Muhuri <Blank w="w-40" />
                    </p>
                </section>
            )}
        </>
    );
}

export default function JoiningInstructionPrint({ template, school, letters }: { template: JoiningTemplate; school: School; letters: Letter[] }) {
    return (
        <>
            <style>{`@media print { .joining-page { break-after: page; box-shadow: none !important; } .joining-page:last-child { break-after: auto; } }`}</style>
            <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-black dark:text-white-light">Form Five joining instructions</h1>
                    <p className="text-sm text-white-dark">{letters.length} letter(s). Each student&apos;s pages print on separate sheets.</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/admissions/joining-instructions" className="btn btn-outline-dark">
                        <ArrowLeft className="h-4 w-4" /> Template
                    </Link>
                    <PrintButton label="Print all" />
                </div>
            </div>
            {letters.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No selected students" description="No accepted Form Five applicants match. Import the TAMISEMI selection list or add applications first." />
                </div>
            ) : (
                <div className="space-y-6">
                    {letters.map((l) => (
                        <LetterPages key={l.id} letter={l} school={school} t={template} />
                    ))}
                </div>
            )}
        </>
    );
}
