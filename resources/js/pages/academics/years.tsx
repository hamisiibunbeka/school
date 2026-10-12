import { router, useForm } from '@inertiajs/react';
import { CalendarRange, CheckCircle2, Pencil, Plus, Star, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { Checkbox, FormGrid, Input } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import { useCan } from '@/hooks/use-can';
import { confirm } from '@/lib/swal';
import { cn, date, num, today } from '@/lib/utils';

type Term = { id: number; name: string; start_date: string; end_date: string; is_current: boolean };
type Year = { id: number; name: string; start_date: string; end_date: string; is_current: boolean; enrolments: number; terms: Term[] };

const blank = { name: '', start_date: '', end_date: '', is_current: false };

function progress(start: string, end: string): number {
    const s = new Date(`${start}T00:00:00`).getTime();
    const e = new Date(`${end}T23:59:59`).getTime();
    const n = new Date(`${today()}T12:00:00`).getTime();
    if (n <= s) return 0;
    if (n >= e) return 100;
    return Math.round(((n - s) / (e - s)) * 100);
}

function weeks(start: string, end: string): number {
    return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (7 * 86400000)));
}

export default function Years({ years }: { years: Year[] }) {
    const can = useCan();
    const manage = can('academics.manage');
    const [yearModal, setYearModal] = useState<{ open: boolean; year: Year | null }>({ open: false, year: null });
    const [termModal, setTermModal] = useState<{ open: boolean; year: Year | null; term: Term | null }>({ open: false, year: null, term: null });
    const yearForm = useForm(blank);
    const termForm = useForm(blank);

    const current = years.find((y) => y.is_current);
    const currentTerm = years.flatMap((y) => y.terms).find((t) => t.is_current);

    const openYear = (year: Year | null) => {
        yearForm.clearErrors();
        yearForm.setData(year ? { name: year.name, start_date: year.start_date, end_date: year.end_date, is_current: year.is_current } : blank);
        setYearModal({ open: true, year });
    };

    const openTerm = (year: Year, term: Term | null) => {
        termForm.clearErrors();
        termForm.setData(term ? { name: term.name, start_date: term.start_date, end_date: term.end_date, is_current: term.is_current } : { ...blank, name: `Term ${['I', 'II', 'III', 'IV'][year.terms.length] ?? year.terms.length + 1}` });
        setTermModal({ open: true, year, term });
    };

    const submitYear = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setYearModal({ open: false, year: null }) };
        if (yearModal.year) yearForm.put(`/academics/years/${yearModal.year.id}`, opts);
        else yearForm.post('/academics/years', opts);
    };

    const submitTerm = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setTermModal({ open: false, year: null, term: null }) };
        if (termModal.term) termForm.put(`/academics/terms/${termModal.term.id}`, opts);
        else if (termModal.year) termForm.post(`/academics/years/${termModal.year.id}/terms`, opts);
    };

    const setCurrent = async (url: string, label: string) => {
        const { confirmed } = await confirm({ title: `Make ${label} current?`, text: 'Only one can be current per school. Attendance, fees and exams default to it.', confirmText: 'Set as current' });
        if (confirmed) router.post(url, {}, { preserveScroll: true });
    };

    const remove = async (url: string, label: string) => {
        const { confirmed } = await confirm({ title: `Delete ${label}?`, text: 'This is blocked automatically if records already use it.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(url, { preserveScroll: true });
    };

    return (
        <>
            <PageHeader
                title="Academic Years & Terms"
                subtitle="Define the school calendar structure used by enrolment, attendance, exams and fees."
                breadcrumbs={[{ title: 'Academics' }, { title: 'Years & Terms' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openYear(null)}>
                            <Plus className="h-4 w-4" /> New academic year
                        </button>
                    )
                }
            />

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard title="Current year" value={current?.name ?? '—'} icon={CalendarRange} tone="primary" hint={current ? `${date(current.start_date)} – ${date(current.end_date)}` : 'Not set'} />
                <StatCard title="Current term" value={currentTerm?.name ?? '—'} icon={Star} tone="warning" hint={currentTerm ? `${date(currentTerm.start_date)} – ${date(currentTerm.end_date)}` : 'Not set'} />
                <StatCard title="Enrolments this year" value={num(current?.enrolments ?? 0)} icon={Users} tone="success" />
            </div>

            {years.length === 0 ? (
                <div className="panel">
                    <EmptyState title="No academic years yet" description="Create the first academic year and its terms." />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {years.map((y) => {
                        const pct = progress(y.start_date, y.end_date);
                        return (
                            <div key={y.id} className={cn('panel relative overflow-hidden', y.is_current && 'ring-2 ring-primary/40')}>
                                {y.is_current && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4361ee] to-[#805dca]" />}
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h5 className="text-xl font-extrabold text-black dark:text-white-light">{y.name}</h5>
                                            {y.is_current && (
                                                <span className="badge badge-soft-primary">
                                                    <CheckCircle2 className="me-1 inline h-3 w-3" />
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-sm text-white-dark">
                                            {date(y.start_date)} – {date(y.end_date)} · {weeks(y.start_date, y.end_date)} weeks · {num(y.enrolments)} enrolments
                                        </div>
                                    </div>
                                    {manage && (
                                        <div className="flex items-center gap-1">
                                            {!y.is_current && (
                                                <button className="btn btn-outline-primary btn-sm" onClick={() => setCurrent(`/academics/years/${y.id}/current`, y.name)}>
                                                    Set current
                                                </button>
                                            )}
                                            <button className="grid h-8 w-8 place-content-center rounded-md text-primary hover:bg-primary-light" title="Edit" onClick={() => openYear(y)}>
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button className="grid h-8 w-8 place-content-center rounded-md text-danger hover:bg-danger-light" title="Delete" onClick={() => remove(`/academics/years/${y.id}`, y.name)}>
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4">
                                    <div className="mb-1 flex justify-between text-xs font-semibold text-white-dark">
                                        <span>Year progress</span>
                                        <span>{pct}%</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                        <div className="h-2 rounded-full bg-gradient-to-r from-[#4361ee] to-[#805dca]" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>

                                <div className="mt-5 space-y-3">
                                    {y.terms.map((t) => {
                                        const tp = progress(t.start_date, t.end_date);
                                        return (
                                            <div key={t.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg border p-3', t.is_current ? 'border-warning/50 bg-warning-light/40 dark:bg-warning-dark-light' : 'border-white-light dark:border-[#1b2e4b]')}>
                                                <span className={cn('grid h-10 w-10 shrink-0 place-content-center rounded-lg font-extrabold', t.is_current ? 'bg-warning text-white' : 'bg-primary-light text-primary dark:bg-primary-dark-light')}>
                                                    {t.name.replace(/^Term\s*/i, '') || 'T'}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 font-bold">
                                                        {t.name} {t.is_current && <span className="badge badge-soft-warning">Current term</span>}
                                                    </div>
                                                    <div className="text-xs text-white-dark">
                                                        {date(t.start_date)} – {date(t.end_date)} · {weeks(t.start_date, t.end_date)} weeks · {tp}% elapsed
                                                    </div>
                                                </div>
                                                {manage && (
                                                    <div className="flex items-center gap-1">
                                                        {!t.is_current && (
                                                            <button className="btn btn-outline-warning btn-sm" onClick={() => setCurrent(`/academics/terms/${t.id}/current`, t.name)}>
                                                                Set current
                                                            </button>
                                                        )}
                                                        <button className="grid h-8 w-8 place-content-center rounded-md text-primary hover:bg-primary-light" title="Edit term" onClick={() => openTerm(y, t)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button className="grid h-8 w-8 place-content-center rounded-md text-danger hover:bg-danger-light" title="Delete term" onClick={() => remove(`/academics/terms/${t.id}`, t.name)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {y.terms.length === 0 && <p className="text-sm text-white-dark">No terms defined yet.</p>}
                                    {manage && (
                                        <button className="btn btn-outline-dark btn-sm w-full border-dashed" onClick={() => openTerm(y, null)}>
                                            <Plus className="h-4 w-4" /> Add term
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal open={yearModal.open} onClose={() => setYearModal({ open: false, year: null })} title={yearModal.year ? 'Edit academic year' : 'New academic year'}>
                <form onSubmit={submitYear} className="space-y-5">
                    <Input label="Name" required placeholder="e.g. 2027" value={yearForm.data.name} onChange={(e) => yearForm.setData('name', e.target.value)} error={yearForm.errors.name} />
                    <FormGrid>
                        <Input label="Starts" type="date" required value={yearForm.data.start_date} onChange={(e) => yearForm.setData('start_date', e.target.value)} error={yearForm.errors.start_date} />
                        <Input label="Ends" type="date" required value={yearForm.data.end_date} onChange={(e) => yearForm.setData('end_date', e.target.value)} error={yearForm.errors.end_date} />
                    </FormGrid>
                    <Checkbox label="Set as the current academic year" checked={yearForm.data.is_current} onChange={(e) => yearForm.setData('is_current', e.target.checked)} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setYearModal({ open: false, year: null })}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={yearForm.processing}>
                            Save year
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={termModal.open} onClose={() => setTermModal({ open: false, year: null, term: null })} title={termModal.term ? `Edit ${termModal.term.name}` : `Add term to ${termModal.year?.name ?? ''}`}>
                <form onSubmit={submitTerm} className="space-y-5">
                    <Input label="Name" required value={termForm.data.name} onChange={(e) => termForm.setData('name', e.target.value)} error={termForm.errors.name} />
                    <FormGrid>
                        <Input label="Opens" type="date" required value={termForm.data.start_date} onChange={(e) => termForm.setData('start_date', e.target.value)} error={termForm.errors.start_date} />
                        <Input label="Closes" type="date" required value={termForm.data.end_date} onChange={(e) => termForm.setData('end_date', e.target.value)} error={termForm.errors.end_date} />
                    </FormGrid>
                    {termModal.year && (
                        <p className="text-xs text-white-dark">
                            Must fall within {date(termModal.year.start_date)} – {date(termModal.year.end_date)}.
                        </p>
                    )}
                    <Checkbox label="Set as the current term" checked={termForm.data.is_current} onChange={(e) => termForm.setData('is_current', e.target.checked)} />
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setTermModal({ open: false, year: null, term: null })}>
                            Cancel
                        </button>
                        <button className="btn btn-warning" disabled={termForm.processing}>
                            Save term
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
