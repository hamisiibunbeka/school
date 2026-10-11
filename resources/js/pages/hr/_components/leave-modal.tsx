import { useForm } from '@inertiajs/react';
import { CalendarDays, LoaderCircle } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import type { Option } from '@/types';

export type LeaveBalance = { type_id: number; type: string; entitled: number; used: number; pending: number; remaining: number; is_paid: boolean };

/** Working days (Mon–Fri) between two ISO dates inclusive — mirrors LeaveRequest::workingDays(). */
export function workingDays(from: string, to: string): number {
    if (!from || !to) return 0;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    let days = 0;
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) days++;
    }
    return days;
}

export function LeaveModal({
    open,
    onClose,
    employees,
    leaveTypes,
    defaultEmployeeId,
    balances,
}: {
    open: boolean;
    onClose: () => void;
    employees: Option[];
    leaveTypes: Option[];
    defaultEmployeeId?: number | null;
    balances?: (employeeId: number) => LeaveBalance[] | undefined;
}) {
    const today = new Date().toISOString().slice(0, 10);
    const form = useForm({
        employee_id: defaultEmployeeId ? String(defaultEmployeeId) : '',
        leave_type_id: '',
        start_date: today,
        end_date: today,
        reason: '',
    });

    const days = workingDays(form.data.start_date, form.data.end_date);
    const balance = form.data.employee_id && form.data.leave_type_id ? balances?.(Number(form.data.employee_id))?.find((b) => String(b.type_id) === form.data.leave_type_id) : undefined;
    const available = balance ? Math.max(0, balance.remaining - balance.pending) : null;
    const exceeds = balance && balance.entitled > 0 && available !== null && days > available;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/hr/leave', {
            preserveScroll: true,
            onSuccess: () => {
                form.reset('reason', 'leave_type_id');
                onClose();
            },
        });
    };

    return (
        <Modal open={open} onClose={onClose} title="Apply for leave" size="lg">
            <form onSubmit={submit} className="space-y-4">
                <FormGrid>
                    <Select
                        label="Employee"
                        required
                        placeholder="Select employee…"
                        value={form.data.employee_id}
                        onChange={(e) => form.setData('employee_id', e.target.value)}
                        options={employees}
                        error={form.errors.employee_id}
                        disabled={employees.length === 1}
                    />
                    <Select label="Leave type" required placeholder="Select type…" value={form.data.leave_type_id} onChange={(e) => form.setData('leave_type_id', e.target.value)} options={leaveTypes} error={form.errors.leave_type_id} />
                    <Input label="From" type="date" required value={form.data.start_date} onChange={(e) => form.setData((d) => ({ ...d, start_date: e.target.value, end_date: d.end_date < e.target.value ? e.target.value : d.end_date }))} error={form.errors.start_date} />
                    <Input label="To" type="date" required min={form.data.start_date} value={form.data.end_date} onChange={(e) => form.setData('end_date', e.target.value)} error={form.errors.end_date} />
                </FormGrid>

                <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md p-3 text-sm ${exceeds ? 'bg-danger-light text-danger dark:bg-danger-dark-light' : 'bg-primary-light dark:bg-primary-dark-light'}`}>
                    <span className="flex items-center gap-2 font-bold">
                        <CalendarDays className="h-4 w-4" /> {days} working day{days === 1 ? '' : 's'}
                    </span>
                    <span className="text-xs text-white-dark">Weekends excluded</span>
                    {balance && (
                        <span className="ms-auto text-xs font-semibold">
                            {balance.type}: {available} of {balance.entitled} days available{balance.pending ? ` (${balance.pending} pending)` : ''}
                            {!balance.is_paid && ' · unpaid'}
                        </span>
                    )}
                </div>

                <Textarea label="Reason" required value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} error={form.errors.reason} placeholder="e.g. Family matters in Moshi" />
                <div className="flex justify-end gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" disabled={form.processing || days < 1}>
                        {form.processing && <LoaderCircle className="h-4 w-4 animate-spin" />} Submit request
                    </button>
                </div>
            </form>
        </Modal>
    );
}
