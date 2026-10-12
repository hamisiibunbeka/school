import { BadgeCheck, Building2, Home as HomeIcon, Layers } from 'lucide-react';
import { cn, titleCase } from '@/lib/utils';
import { LeaderMessage, MissionVision, statItems, StatNumber } from './_components/blocks';
import type { AboutData, SiteChrome } from './_components/types';
import { Prose, Reveal, SiteImage } from './_components/ui';
import { CtaBand, Section, SectionHeading, SiteLayout, useTheme } from './_templates';

const residenceLabel: Record<string, string> = { day: 'Day school', boarding: 'Boarding school', mixed: 'Day & boarding' };

function AboutContent({ site, about }: { site: SiteChrome; about: AboutData }) {
    const t = useTheme();
    const stats = statItems(about.stats);
    const facts = [
        about.level && { icon: Layers, label: 'Level', value: titleCase(about.level) },
        about.residence_type && { icon: HomeIcon, label: 'Type', value: residenceLabel[about.residence_type] ?? titleCase(about.residence_type) },
        about.registration_no && { icon: BadgeCheck, label: 'Registration no.', value: about.registration_no },
    ].filter(Boolean) as { icon: typeof Layers; label: string; value: string }[];

    return (
        <>
            <Section label="Our story">
                <div className={cn('grid gap-12', (about.image_url || facts.length > 0) && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
                    <Reveal enabled={t.reveal}>
                        {about.body ? <Prose html={about.body} /> : <p className="text-lg text-slate-600">More about our school is coming soon.</p>}
                    </Reveal>
                    {(about.image_url || facts.length > 0) && (
                        <aside className="space-y-6">
                            <SiteImage src={about.image_url} alt={`${site.name} campus`} label={site.name} icon={<Building2 className="h-10 w-10" />} className={cn('aspect-[4/3] w-full', t.imgRadius, t.key === 'playful' && 'border-[3px] border-slate-900')} />
                            {facts.length > 0 && (
                                <dl className={cn('divide-y divide-slate-100 p-2', t.card)}>
                                    {facts.map((f) => (
                                        <div key={f.label} className="flex items-center gap-3 px-3 py-3">
                                            <f.icon className="h-5 w-5 shrink-0 text-[var(--site-primary)]" aria-hidden="true" />
                                            <dt className="text-sm text-slate-500">{f.label}</dt>
                                            <dd className="ml-auto text-right text-sm font-bold text-slate-900">{f.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </aside>
                    )}
                </div>
            </Section>

            {stats.length > 0 && (
                <Section alt label="School in numbers">
                    <SectionHeading eyebrow="At a glance" title="Our school in numbers" />
                    <dl className={cn('grid grid-cols-2 gap-4', stats.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
                        {stats.map((s) => (
                            <div key={s.label} className={cn('p-6 text-center', t.card)}>
                                <dd className={cn(t.heading, 'text-4xl text-[var(--site-primary)]', t.key === 'minimal' && 'text-neutral-950')}>
                                    <StatNumber value={s.value} />
                                </dd>
                                <dt className="mt-2 text-xs font-bold tracking-wider text-slate-500 uppercase">{s.label}</dt>
                            </div>
                        ))}
                    </dl>
                </Section>
            )}

            {(about.mission || about.vision || about.values.length > 0) && (
                <Section label="Mission and values">
                    <SectionHeading eyebrow="What guides us" title="Mission, vision & values" />
                    <MissionVision mission={about.mission} vision={about.vision} values={about.values} />
                </Section>
            )}

            {about.leader && (
                <Section alt label="Leadership">
                    <SectionHeading eyebrow="Leadership" title="Message from our head" />
                    <LeaderMessage leader={about.leader} />
                </Section>
            )}
        </>
    );
}

export default function SiteAbout({ site, about }: { site: SiteChrome; about: AboutData }) {
    return (
        <SiteLayout site={site} hero={{ title: about.title, subtitle: site.tagline, eyebrow: 'About us' }}>
            <AboutContent site={site} about={about} />
            <CtaBand site={site} />
        </SiteLayout>
    );
}
