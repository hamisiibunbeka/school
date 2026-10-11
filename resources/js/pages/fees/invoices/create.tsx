import { Link, useForm, usePage } from '@inertiajs/react';
import { FilePlus2, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Avatar from '@/components/ui/avatar';
import { FormGrid, FormSection, Input, Select } from '@/components/ui/form';
import PageHeader from '@/components/ui/page-header';
import { money, titleCase, today } from '@/lib/utils';
import type { Option } from '@/types';
import StudentPicker from '../_components/student-picker';

type StudentCard = { id: number; full_name: string; admission_no: string; photo_url: string | null; class: string; residence_type?: string; status?: string };
type Line = { fee_category_id: string | number; description: string; amount: string; discount: string };

type Props = {
    student: StudentCard | null;
    categories: Option[];
    terms: (Option & { is_current: boolean })[];
    currentTermId: number | null;
};

const blankLine: Line = { fee_category_id: '', description: '', amount: '', discount: '' };

export default function InvoiceCreate({ student: initialStudent, categories, terms, currentTermId }: Props) {
    const cur = usePage().props.school?.currency ?? 'TZS';
    const [student, setStudent] = useState<StudentCard | null>(initialStudent);
    const form = useForm({
        student_id: initialStudent?.id ?? ('' as string | number),
        term_id: String(currentTermId ?? ''),
        issue_date: today(),
        due_date: '',
        notes: '',
        lines: [{ ...blankLine }] as Line[],
    });
    const errors = form.errors as Record<string, string>;

    const setLine = (i: number, patch: Partial<Line>) => form.setData('lines', form.data.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

    const subtotal = form.data.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const discount = form.data.lines.reduce((s, l) => s + (Number(l.discount) || 0), 0);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/fees/invoices');
    };

    return (
        <>
            <PageHeader
                title="New Manual Invoice"
                subtitle="Bill a single student for custom items (e.g. uniform, trip, admission or a debit note)."
                breadcrumbs={[{ title: 'Fees', href: '/fees/invoices' }, { title: 'Invoices', href: '/fees/invoices' }, { title: 'New' }]}
            />

            <form onSubmit={submit} className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel space-y-6 xl:col-span-2">
                    <FormSection title="Student" description="Who is being billed.">
                        {student ? (
                            <div className="flex items-center gap-3 rounded-md border border-white-light p-3 dark:border-[#1b2e4b]">
                                <Avatar name={student.full_name} src={student.photo_url} className="h-11 w-11" />
                                <div className="flex-1">
                                    <div className="font-bold text-black dark:text-white-light">{student.full_name}</div>
                                    <div className="text-xs text-white-dark">
                                        {student.admission_no} · {student.class || 'No class'}
                                        {student.residence_type && ` · ${titleCase(student.residence_type)}`}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="text-white-dark hover:text-danger"
                                    onClick={() => {
                                        setStudent(null);
                                        form.setData('student_id', '');
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <StudentPicker
                                currency={cur}
                                autoFocus
                                error={errors.student_id}
                                onSelect={(s) => {
                                    setStudent(s);
                                    form.setData('student_id', s.id);
                                }}
                            />
                        )}
                    </FormSection>

                    <FormSection title="Line items" description="Choose a fee category so the income posts to the right account.">
                        <div className="space-y-3">
                            {form.data.lines.map((line, i) => (
                                <div key={i} className="grid grid-cols-1 gap-3 rounded-md border border-white-light p-3 sm:grid-cols-12 dark:border-[#1b2e4b]">
                                    <Select
                                        wrapperClassName="sm:col-span-3"
                                        label={i === 0 ? 'Category' : undefined}
                                        value={line.fee_category_id}
                                        onChange={(e) => {
                                            const label = categories.find((c) => String(c.value) === e.target.value)?.label ?? '';
                                            setLine(i, { fee_category_id: e.target.value, description: line.description || label });
                                        }}
                                        options={categories}
                                        placeholder="Other (4100)"
                                        error={errors[`lines.${i}.fee_category_id`]}
                                    />
                                    <Input
                                        wrapperClassName="sm:col-span-4"
                                        label={i === 0 ? 'Description' : undefined}
                                        required
                                        value={line.description}
                                        onChange={(e) => setLine(i, { description: e.target.value })}
                                        error={errors[`lines.${i}.description`]}
                                    />
                                    <Input
                                        wrapperClassName="sm:col-span-2"
                                        label={i === 0 ? 'Amount' : undefined}
                                        type="number"
                                        min={0}
                                        required
                                        value={line.amount}
                                        onChange={(e) => setLine(i, { amount: e.target.value })}
                                        error={errors[`lines.${i}.amount`]}
                                    />
                                    <Input
                                        wrapperClassName="sm:col-span-2"
                                        label={i === 0 ? 'Discount' : undefined}
                                        type="number"
                                        min={0}
                                        value={line.discount}
                                        onChange={(e) => setLine(i, { discount: e.target.value })}
                                        error={errors[`lines.${i}.discount`]}
                                    />
                                    <div className="flex items-end justify-end sm:col-span-1">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger"
                                            disabled={form.data.lines.length === 1}
                                            onClick={() => form.setData('lines', form.data.lines.filter((_, idx) => idx !== i))}
                                            title="Remove line"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {errors.lines && <p className="form-error">{errors.lines}</p>}
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => form.setData('lines', [...form.data.lines, { ...blankLine }])}>
                                <Plus className="h-4 w-4" /> Add line
                            </button>
                        </div>
                    </FormSection>
                </div>

                <div className="space-y-6">
                    <div className="panel space-y-4">
                        <h5 className="text-lg font-bold dark:text-white-light">Invoice details</h5>
                        <Select label="Term" value={form.data.term_id} onChange={(e) => form.setData('term_id', e.target.value)} options={terms} placeholder="Not term-specific" error={errors.term_id} />
                        <FormGrid>
                            <Input label="Issue date" type="date" required value={form.data.issue_date} onChange={(e) => form.setData('issue_date', e.target.value)} error={errors.issue_date} />
                            <Input label="Due date" type="date" value={form.data.due_date} onChange={(e) => form.setData('due_date', e.target.value)} error={errors.due_date} />
                        </FormGrid>
                        <Input label="Note" value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} error={errors.notes} />
                    </div>
                    <div className="panel">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-white-dark">Subtotal</span>
                                <span className="font-semibold">{money(subtotal, cur)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-white-dark">Discount</span>
                                <span className="font-semibold text-success">− {money(discount, cur)}</span>
                            </div>
                            <div className="flex justify-between border-t border-white-light pt-2 text-base dark:border-[#1b2e4b]">
                                <span className="font-bold">Total</span>
                                <span className="font-extrabold text-primary">{money(subtotal - discount, cur)}</span>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-white-dark">On saving, the invoice is posted: Dr 1300 Student Fees Receivable / Cr the category income accounts. Any credit on the student's account is applied automatically.</p>
                        <div className="mt-4 flex gap-3">
                            <Link href="/fees/invoices" className="btn btn-outline-dark flex-1">
                                Cancel
                            </Link>
                            <button className="btn btn-primary flex-1" disabled={form.processing || !form.data.student_id}>
                                <FilePlus2 className="h-4 w-4" /> Issue invoice
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </>
    );
}
