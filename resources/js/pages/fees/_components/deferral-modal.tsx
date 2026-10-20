import { useForm, usePage } from '@inertiajs/react';
import { Handshake } from 'lucide-react';
import { useEffect, type FormEvent } from 'react';
import { FormGrid, Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import { money, today } from '@/lib/utils';

export type DeferralTarget = { id: number; full_name: string; guardian_name: string; outstanding: string; basis?: string };

/** A head records the parent's excuse and authorizes the student to proceed on a payment agreement. */
export default function DeferralModal({ target, onClose }: { target: DeferralTarget | null; onClose: () => void }) {
    const cur = usePage().props.school?.currency ?? 'TZS';
    const form = useForm({ amount: '', due_date: '', reason: '', terms: '', requested_by: '' });

    useEffect(() => {
        if (target) {
            form.clearErrors();
            form.setData({ amount: String(Math.max(0, Number(target.outstanding))), due_date: '', reason: '', terms: '', requested_by: target.guardian_name });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.id]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!target) return;
        form.post(`/fees/clearance/${target.id}/defer`, { preserveScroll: true, onSuccess: onClose });
    };

    const errors = form.errors as Record<string, string>;

    return (
        <Modal open={!!target} onClose={onClose} title={`Authorize payment agreement · ${target?.full_name ?? ''}`} size="lg">
            <form onSubmit={submit} className="space-y-5">
                <p className="text-sm text-white-dark">
                    The student is enrolled now and joins the student directory. The agreed amount is followed up: finance and you are notified as the agreed date nears and if it
                    passes unpaid. {target && Number(target.outstanding) > 0 && <>Currently outstanding for clearance: <strong className="text-black dark:text-white-light">{money(target.outstanding, cur)}</strong>.</>}
                </p>
                <FormGrid>
                    <Input label="Parent / guardian" value={form.data.requested_by} onChange={(e) => form.setData('requested_by', e.target.value)} error={form.errors.requested_by} />
                    <Input
                        label={`Amount to be paid (${cur})`}
                        type="number"
                        min={1}
                        step="1"
                        required
                        value={form.data.amount}
                        onChange={(e) => form.setData('amount', e.target.value)}
                        error={form.errors.amount}
                    />
                    <Input label="Agreed payment date" type="date" min={today()} required value={form.data.due_date} onChange={(e) => form.setData('due_date', e.target.value)} error={form.errors.due_date} />
                </FormGrid>
                <Textarea
                    label="Parent's reason / excuse"
                    required
                    rows={3}
                    value={form.data.reason}
                    onChange={(e) => form.setData('reason', e.target.value)}
                    error={form.errors.reason}
                    placeholder="e.g. Awaiting harvest sales; salary delayed until month end…"
                />
                <Textarea
                    label="Special terms (optional)"
                    rows={2}
                    value={form.data.terms}
                    onChange={(e) => form.setData('terms', e.target.value)}
                    error={form.errors.terms}
                    placeholder="e.g. Pays 100,000 by the 15th and the rest by the agreed date"
                />
                {errors.clearance && <p className="form-error">{errors.clearance}</p>}
                <p className="text-xs text-white-dark">Your name, the time and these terms are recorded in the audit trail.</p>
                <div className="flex justify-center gap-3">
                    <button type="button" className="btn btn-outline-dark" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-secondary" disabled={form.processing}>
                        <Handshake className="h-4 w-4" /> Authorize &amp; enrol
                    </button>
                </div>
            </form>
        </Modal>
    );
}
