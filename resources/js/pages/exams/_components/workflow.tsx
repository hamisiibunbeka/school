import { router } from '@inertiajs/react';
import { Check, CircleDot, Lock, LockOpen, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { confirm } from '@/lib/swal';
import { cn } from '@/lib/utils';

export const STEPS = [
    { key: 'draft', label: 'Draft' },
    { key: 'marks_entry', label: 'Mark entry' },
    { key: 'moderation', label: 'Moderation' },
    { key: 'published', label: 'Published' },
];

/** Horizontal stepper for the results workflow. */
export function WorkflowSteps({ status }: { status: string }) {
    const current = STEPS.findIndex((s) => s.key === status);
    return (
        <div className="flex items-center">
            {STEPS.map((s, i) => (
                <div key={s.key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                        <span
                            className={cn(
                                'grid h-9 w-9 place-content-center rounded-full border-2 text-sm font-bold',
                                i < current && 'border-success bg-success text-white',
                                i === current && 'border-primary bg-primary text-white',
                                i > current && 'border-white-light text-white-dark dark:border-[#1b2e4b]',
                            )}
                        >
                            {i < current ? <Check className="h-4 w-4" /> : i === current ? <CircleDot className="h-4 w-4" /> : i + 1}
                        </span>
                        <span className={cn('text-xs font-semibold whitespace-nowrap', i === current ? 'text-primary' : 'text-white-dark')}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={cn('mx-2 mb-5 h-0.5 flex-1', i < current ? 'bg-success' : 'bg-white-light dark:bg-[#1b2e4b]')} />}
                </div>
            ))}
        </div>
    );
}

type Action = { action: string; label: string; icon: typeof Send; cls: string; title: string; text: string; reason?: boolean; danger?: boolean };

const ACTIONS: Record<string, Action[]> = {
    draft: [{ action: 'open', label: 'Open mark entry', icon: LockOpen, cls: 'btn-primary', title: 'Open mark entry?', text: 'Teachers will be able to enter marks for their allocated subjects.' }],
    marks_entry: [
        { action: 'submit', label: 'Close & send to moderation', icon: Send, cls: 'btn-secondary', title: 'Send to moderation?', text: 'Teachers will no longer be able to change marks. Moderators can review and adjust.' },
        { action: 'draft', label: 'Back to draft', icon: RotateCcw, cls: 'btn-outline-dark', title: 'Return to draft?', text: 'Only possible while no marks have been entered.' },
    ],
    moderation: [
        { action: 'publish', label: 'Approve & publish', icon: ShieldCheck, cls: 'btn-success', title: 'Approve and publish results?', text: 'Results become visible to parents and students and are locked against changes.' },
        { action: 'return', label: 'Return for corrections', icon: RotateCcw, cls: 'btn-outline-warning', title: 'Return to mark entry?', text: 'Explain what must be corrected.', reason: true },
    ],
    published: [{ action: 'unpublish', label: 'Unpublish for correction', icon: Lock, cls: 'btn-outline-danger', title: 'Unpublish results?', text: 'Results will be hidden and moved back to moderation. A reason is required and will be audited.', reason: true, danger: true }],
};

/** Status transition buttons (only rendered for approvers). */
export function WorkflowActions({ examId, status, small }: { examId: number; status: string; small?: boolean }) {
    const run = async (a: Action) => {
        const { confirmed, value } = await confirm({ title: a.title, text: a.text, confirmText: a.label, danger: a.danger, input: a.reason ? 'textarea' : undefined, inputPlaceholder: 'Reason…' });
        if (confirmed) router.post(`/exams/${examId}/status`, { action: a.action, reason: value ?? null }, { preserveScroll: true });
    };
    return (
        <>
            {(ACTIONS[status] ?? []).map((a) => (
                <button key={a.action} type="button" className={cn('btn', a.cls, small && 'btn-sm')} onClick={() => run(a)}>
                    <a.icon className="h-4 w-4" /> {a.label}
                </button>
            ))}
        </>
    );
}
