import { useForm } from '@inertiajs/react';
import { useEffect, type FormEvent } from 'react';
import { Field, FormGrid, Input, Select } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import type { Option } from '@/types';

export type ExamRow = {
    id: number;
    name: string;
    type: string;
    academic_year_id: number;
    term_id: number | null;
    year: string | null;
    term: string | null;
    start_date: string | null;
    end_date: string | null;
    max_score: number;
    weight: number;
    status: string;
    published_at: string | null;
    classes: string[];
    class_ids: number[];
    marks_count: number | null;
};

export type TermOption = Option & { academic_year_id: number; is_current: boolean };

type Props = {
    open: boolean;
    onClose: () => void;
    exam: ExamRow | null;
    years: Option[];
    terms: TermOption[];
    classes: Option[];
    types: Option[];
    defaults?: { academic_year_id: number | null; term_id: number | null };
};

/** Create / edit exam modal shared by the exam list and exam overview pages. */
export default function ExamFormModal({ open, onClose, exam, years, terms, classes, types, defaults }: Props) {
    const form = useForm({
        name: '',
        type: 'midterm',
        academic_year_id: '' as number | string,
        term_id: '' as number | string,
        start_date: '',
        end_date: '',
        max_score: 100 as number | string,
        weight: 100 as number | string,
        class_ids: [] as number[],
    });

    useEffect(() => {
        if (!open) return;
        form.clearErrors();
        form.setData(
            exam
                ? {
                      name: exam.name,
                      type: exam.type,
                      academic_year_id: exam.academic_year_id,
                      term_id: exam.term_id ?? '',
                      start_date: exam.start_date ?? '',
                      end_date: exam.end_date ?? '',
                      max_score: exam.max_score,
                      weight: exam.weight,
                      class_ids: exam.class_ids,
                  }
                : {
                      name: '',
                      type: 'midterm',
                      academic_year_id: defaults?.academic_year_id ?? '',
                      term_id: defaults?.term_id ?? '',
                      start_date: '',
                      end_date: '',
                      max_score: 100,
                      weight: 100,
                      class_ids: classes.map((c) => Number(c.value)),
                  },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, exam]);

    const yearTerms = terms.filter((t) => String(t.academic_year_id) === String(form.data.academic_year_id));
    const toggleClass = (id: number) => form.setData('class_ids', form.data.class_ids.includes(id) ? form.data.class_ids.filter((c) => c !== id) : [...form.data.class_ids, id]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => onClose() };
        if (exam) form.put(`/exams/${exam.id}`, opts);
        else form.post('/exams', opts);
    };

    return (
        <Modal open={open} onClose={onClose} title={exam ? 'Edit examination' : 'New examination'} size="lg">
            <form onSubmit={submit} className="space-y-5">
                <FormGrid>
                    <Input label="Exam name" required placeholder="e.g. Term II Midterm" value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} wrapperClassName="sm:col-span-2" />
                    <Select label="Type" required options={types} value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} error={form.errors.type} />
                    <Select
                        label="Academic year"
                        required
                        placeholder="Select year"
                        options={years}
                        value={form.data.academic_year_id}
                        onChange={(e) => {
                            form.setData((d) => ({ ...d, academic_year_id: e.target.value, term_id: '' }));
                        }}
                        error={form.errors.academic_year_id}
                    />
                    <Select label="Term" placeholder="Whole year" options={yearTerms.map((t) => ({ value: t.value, label: t.label.split(' — ')[0] }))} value={form.data.term_id} onChange={(e) => form.setData('term_id', e.target.value)} error={form.errors.term_id} />
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Max score" type="number" min={1} max={1000} step="0.5" required value={form.data.max_score} onChange={(e) => form.setData('max_score', e.target.value)} error={form.errors.max_score} />
                        <Input label="Weight %" type="number" min={0} max={100} step="0.5" required value={form.data.weight} onChange={(e) => form.setData('weight', e.target.value)} error={form.errors.weight} help="Share of term result" />
                    </div>
                    <Input label="Start date" type="date" value={form.data.start_date} onChange={(e) => form.setData('start_date', e.target.value)} error={form.errors.start_date} />
                    <Input label="End date" type="date" min={form.data.start_date || undefined} value={form.data.end_date} onChange={(e) => form.setData('end_date', e.target.value)} error={form.errors.end_date} />
                </FormGrid>
                <Field label="Classes sitting the exam" required error={form.errors.class_ids}>
                    <div className="flex flex-wrap gap-2">
                        {classes.map((c) => {
                            const id = Number(c.value);
                            const on = form.data.class_ids.includes(id);
                            return (
                                <button key={id} type="button" onClick={() => toggleClass(id)} className={cn('btn btn-sm', on ? 'btn-primary' : 'btn-outline-primary')}>
                                    {c.label}
                                </button>
                            );
                        })}
                    </div>
                </Field>
                <div className="flex justify-end gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing}>
                        {exam ? 'Save changes' : 'Create exam'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
