import { BookOpen, CalendarRange, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { cn, date, today as todayYmd } from '@/lib/utils';
import { EmptyState, FeesTable } from './_components/blocks';
import type { AcademicsData, SiteChrome } from './_components/types';
import { Reveal } from './_components/ui';
import { CtaBand, Section, SectionHeading, SiteLayout, useTheme } from './_templates';

function termState(start: string, end: string): 'past' | 'current' | 'upcoming' {
    const today = todayYmd();
    if (today > end) return 'past';
    if (today >= start) return 'current';
    return 'upcoming';
}

function AcademicsContent({ academics }: { academics: AcademicsData }) {
    const t = useTheme();
    const departments = Object.entries(academics.subjects);
    const [expanded, setExpanded] = useState<string | null>(null);
    const nothing = !academics.classes.length && !departments.length && !academics.calendar.length && !academics.fees.length;

    if (nothing) {
        return (
            <Section>
                <EmptyState icon={GraduationCap} title="Academic information coming soon" text="Please contact the school office for details about our classes and curriculum." />
            </Section>
        );
    }

    return (
        <>
            {academics.classes.length > 0 && (
                <Section label="Classes">
                    <SectionHeading eyebrow="Classes" title="Classes & learning levels" intro="Every class follows the national curriculum, enriched with co-curricular activities." />
                    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {academics.classes.map((c, i) => {
                            const open = expanded === c.name;
                            const shown = open ? c.subjects : c.subjects.slice(0, 6);
                            return (
                                <Reveal as="li" key={c.name} enabled={t.reveal} delay={(i % 3) * 70}>
                                    <div className={cn('flex h-full flex-col p-6', t.card)}>
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className={cn(t.heading, 'text-xl')}>{c.name}</h3>
                                            <span className={t.chip}>
                                                {c.streams > 0 ? `${c.streams} stream${c.streams === 1 ? '' : 's'}` : 'Single stream'}
                                            </span>
                                        </div>
                                        {c.subjects.length > 0 ? (
                                            <>
                                                <p className="mt-4 text-xs font-bold tracking-wider text-slate-500 uppercase">{c.subjects.length} subjects</p>
                                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                                    {shown.map((s) => (
                                                        <li key={s} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                                            {s}
                                                        </li>
                                                    ))}
                                                </ul>
                                                {c.subjects.length > 6 && (
                                                    <button type="button" onClick={() => setExpanded(open ? null : c.name)} className={cn('mt-3 self-start text-sm', t.link)} aria-expanded={open}>
                                                        {open ? 'Show fewer' : `+${c.subjects.length - 6} more`}
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <p className="mt-4 text-sm text-slate-500">Subject list available from the school office.</p>
                                        )}
                                    </div>
                                </Reveal>
                            );
                        })}
                    </ul>
                </Section>
            )}

            {departments.length > 0 && (
                <Section alt label="Subjects">
                    <SectionHeading eyebrow="Curriculum" title="Subjects by department" />
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {departments.map(([dept, subjects]) => (
                            <div key={dept} className={cn('p-6', t.card)}>
                                <h3 className={cn(t.heading, 'flex items-center gap-2 text-lg')}>
                                    <BookOpen className="h-5 w-5 text-[var(--site-primary)]" aria-hidden="true" /> {dept}
                                </h3>
                                <ul className="mt-4 divide-y divide-slate-100">
                                    {subjects.map((s) => (
                                        <li key={s.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                                            <span className="font-semibold text-slate-800">{s.name}</span>
                                            {s.type && s.type !== 'core' && <span className="text-xs font-bold text-slate-500 capitalize">{s.type}</span>}
                                            {s.type === 'core' && <span className="text-xs font-bold text-[var(--site-primary)]">Core</span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {academics.calendar.length > 0 && (
                <Section label="Academic calendar" narrow>
                    <SectionHeading eyebrow="Calendar" title="This year's terms" />
                    <ol className="relative space-y-5 border-l-2 border-[color-mix(in_srgb,var(--site-primary)_25%,white)] pl-8">
                        {academics.calendar.map((term) => {
                            const state = termState(term.start_date, term.end_date);
                            return (
                                <li key={term.name} className="relative">
                                    <span
                                        className={cn(
                                            'absolute top-5 -left-[41px] h-4 w-4 rounded-full border-[3px] border-white ring-2',
                                            state === 'current' ? 'bg-[var(--site-primary)] ring-[var(--site-primary)]' : state === 'past' ? 'bg-slate-300 ring-slate-300' : 'bg-white ring-[var(--site-secondary)]',
                                        )}
                                        aria-hidden="true"
                                    />
                                    <div className={cn('flex flex-wrap items-center justify-between gap-3 p-5', t.card, state === 'past' && 'opacity-70')}>
                                        <div>
                                            <h3 className={cn(t.heading, 'flex items-center gap-2 text-lg')}>
                                                <CalendarRange className="h-5 w-5 text-[var(--site-primary)]" aria-hidden="true" /> {term.name}
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-600">
                                                {date(term.start_date)} – {date(term.end_date)}
                                            </p>
                                        </div>
                                        {state === 'current' && <span className={t.chip}>In session</span>}
                                        {state === 'past' && <span className="text-xs font-bold text-slate-400 uppercase">Completed</span>}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </Section>
            )}

            {academics.fees.length > 0 && (
                <Section alt label="Fees" narrow>
                    <SectionHeading eyebrow="Fees" title="Fee structure" intro="Current academic year. Amounts are in Tanzanian shillings and may change; please confirm with the bursar." />
                    <FeesTable fees={academics.fees} />
                </Section>
            )}
        </>
    );
}

export default function SiteAcademics({ site, academics }: { site: SiteChrome; academics: AcademicsData }) {
    return (
        <SiteLayout site={site} hero={{ title: 'Academics', subtitle: 'Our classes, curriculum, calendar and fees.', eyebrow: 'Learning' }}>
            <AcademicsContent academics={academics} />
            <CtaBand site={site} />
        </SiteLayout>
    );
}

