import { router, useForm } from '@inertiajs/react';
import { ArrowRightLeft, GraduationCap, LoaderCircle } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { Select } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { confirm } from '@/lib/swal';
import { cn } from '@/lib/utils';
import type { Option } from '@/types';

type Student = { id: number; admission_no: string; full_name: string; stream: string | null };
type Action = 'promote' | 'repeat' | 'graduate';

type Props = {
    classes: Option[];
    years: (Option & { is_current: boolean })[];
    selectedClass: number | null;
    suggestedNextClass: number | null;
    students: Student[];
};

export default function Promotions({ classes, years, selectedClass, suggestedNextClass, students }: Props) {
    const form = useForm({
        from_class_id: selectedClass ? String(selectedClass) : '',
        to_class_id: suggestedNextClass ? String(suggestedNextClass) : '',
        academic_year_id: String(years.find((y) => y.is_current)?.value ?? years[0]?.value ?? ''),
        decisions: students.map((s) => ({ student_id: s.id, action: (suggestedNextClass ? 'promote' : 'graduate') as Action })),
    });

    useEffect(() => {
        form.setData((d) => ({
            ...d,
            from_class_id: selectedClass ? String(selectedClass) : '',
            to_class_id: suggestedNextClass ? String(suggestedNextClass) : '',
            decisions: students.map((s) => ({ student_id: s.id, action: (suggestedNextClass ? 'promote' : 'graduate') as Action })),
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClass, students.length]);

    const setAll = (action: Action) => form.setData('decisions', form.data.decisions.map((d) => ({ ...d, action })));
    const setOne = (id: number, action: Action) => form.setData('decisions', form.data.decisions.map((d) => (d.student_id === id ? { ...d, action } : d)));

    const counts = form.data.decisions.reduce((acc, d) => ({ ...acc, [d.action]: (acc[d.action] ?? 0) + 1 }), {} as Record<Action, number>);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const { confirmed } = await confirm({
            title: 'Run promotion?',
            text: `${counts.promote ?? 0} promoted, ${counts.repeat ?? 0} repeating, ${counts.graduate ?? 0} graduating. Enrolment history is kept.`,
            confirmText: 'Run promotion',
        });
        if (confirmed) form.post('/students/promotions');
    };

    return (
        <>
            <PageHeader title="Class Promotion" subtitle="Move a class to the next level at year end, with repeat and graduation options." breadcrumbs={[{ title: 'Students', href: '/students' }, { title: 'Promotions' }]} />
            <form onSubmit={submit} className="space-y-6">
                <div className="panel grid grid-cols-1 gap-5 md:grid-cols-3">
                    <Select
                        label="From class"
                        placeholder="Select class…"
                        value={form.data.from_class_id}
                        onChange={(e) => router.get('/students/promotions', { class: e.target.value }, { preserveState: false })}
                        options={classes}
                    />
                    <Select label="Promote to" placeholder="(none — graduating class)" value={form.data.to_class_id} onChange={(e) => form.setData('to_class_id', e.target.value)} options={classes} error={form.errors.to_class_id} />
                    <Select label="New academic year" value={form.data.academic_year_id} onChange={(e) => form.setData('academic_year_id', e.target.value)} options={years} error={form.errors.academic_year_id} />
                </div>

                <div className="panel">
                    {students.length === 0 ? (
                        <EmptyState title={selectedClass ? 'No active students in this class' : 'Select a class to begin'} />
                    ) : (
                        <>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <h5 className="text-lg font-bold">{students.length} students</h5>
                                <div className="flex gap-2">
                                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setAll('promote')}>
                                        Promote all
                                    </button>
                                    <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => setAll('repeat')}>
                                        Repeat all
                                    </button>
                                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setAll('graduate')}>
                                        Graduate all
                                    </button>
                                </div>
                            </div>
                            <div className="table-responsive">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Stream</th>
                                            <th className="text-center!">Decision</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map((s) => {
                                            const action = form.data.decisions.find((d) => d.student_id === s.id)?.action;
                                            return (
                                                <tr key={s.id}>
                                                    <td>
                                                        <div className="font-bold">{s.full_name}</div>
                                                        <div className="text-xs text-white-dark">{s.admission_no}</div>
                                                    </td>
                                                    <td>{s.stream ?? '—'}</td>
                                                    <td>
                                                        <div className="flex justify-center gap-1">
                                                            {(['promote', 'repeat', 'graduate'] as Action[]).map((a) => (
                                                                <button
                                                                    key={a}
                                                                    type="button"
                                                                    onClick={() => setOne(s.id, a)}
                                                                    className={cn(
                                                                        'rounded-full px-3 py-1 text-xs font-bold capitalize transition',
                                                                        action === a
                                                                            ? a === 'promote'
                                                                                ? 'bg-primary text-white'
                                                                                : a === 'repeat'
                                                                                  ? 'bg-warning text-white'
                                                                                  : 'bg-success text-white'
                                                                            : 'bg-white-light/60 text-dark hover:bg-white-light dark:bg-[#1b2e4b] dark:text-white-dark',
                                                                    )}
                                                                >
                                                                    {a}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex gap-4 text-sm font-semibold">
                                    <span className="flex items-center gap-1 text-primary">
                                        <ArrowRightLeft className="h-4 w-4" /> {counts.promote ?? 0} promote
                                    </span>
                                    <span className="text-warning">{counts.repeat ?? 0} repeat</span>
                                    <span className="flex items-center gap-1 text-success">
                                        <GraduationCap className="h-4 w-4" /> {counts.graduate ?? 0} graduate
                                    </span>
                                </div>
                                <button className="btn btn-primary" disabled={form.processing}>
                                    {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Run promotion
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </form>
        </>
    );
}
