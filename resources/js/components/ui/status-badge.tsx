import { cn, titleCase } from '@/lib/utils';

type Tone = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'dark';

/** Maps the status vocabulary used across modules to a consistent colour. */
const map: Record<string, Tone> = {
    // generic
    active: 'success',
    inactive: 'dark',
    draft: 'dark',
    pending: 'warning',
    submitted: 'info',
    approved: 'success',
    rejected: 'danger',
    cancelled: 'dark',
    void: 'danger',
    closed: 'dark',
    open: 'info',
    completed: 'success',
    // students / admissions
    under_review: 'info',
    interview: 'secondary',
    accepted: 'success',
    waitlisted: 'warning',
    enrolled: 'primary',
    withdrawn: 'dark',
    on_leave: 'warning',
    suspended: 'danger',
    transferred: 'secondary',
    graduated: 'primary',
    archived: 'dark',
    // attendance
    present: 'success',
    absent: 'danger',
    late: 'warning',
    excused: 'info',
    // finance
    unpaid: 'danger',
    partial: 'warning',
    paid: 'success',
    posted: 'success',
    reversed: 'dark',
    overdue: 'danger',
    // exams
    marks_entry: 'info',
    moderation: 'secondary',
    published: 'success',
    // saas
    trial: 'info',
    grace: 'warning',
    expired: 'danger',
    // operations
    issued: 'info',
    returned: 'success',
    lost: 'danger',
    out: 'warning',
    received: 'success',
    maintenance: 'warning',
    retired: 'dark',
    terminated: 'danger',
    queued: 'info',
    sent: 'success',
    delivered: 'success',
    failed: 'danger',
    resolved: 'success',
    in_progress: 'info',
    ended: 'dark',
};

export default function StatusBadge({ status, tone, className, label }: { status: string | null | undefined; tone?: Tone; className?: string; label?: string }) {
    if (!status) return <span className="text-white-dark">—</span>;
    const t = tone ?? map[status] ?? 'primary';
    return <span className={cn('badge', `badge-soft-${t}`, className)}>{label ?? titleCase(status)}</span>;
}
