import { router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Coins, Download, Eye, LoaderCircle, Mail, MessageSquareText, RotateCcw, Send, Smartphone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/ui/actions';
import Chart from '@/components/ui/chart';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import StatCard from '@/components/ui/stat-card';
import StatusBadge from '@/components/ui/status-badge';
import { useCan } from '@/hooks/use-can';
import { confirm, toast } from '@/lib/swal';
import { cleanQuery, cn, dateTime, num, titleCase } from '@/lib/utils';
import type { Option, Paginated } from '@/types';
import { postJson, smsCredits, VARIABLE_HINTS } from './_components/helpers';
import { DateRangePicker } from '@/components/ui/date-picker';

type Log = {
    id: number;
    channel: string;
    recipient: string;
    recipient_name: string | null;
    subject: string | null;
    message: string;
    status: string;
    provider_reference: string | null;
    error: string | null;
    credits: number;
    sender: string | null;
    created_at: string | null;
};
type Template = { id: number; name: string; channel: string; subject: string | null; body: string };
type Preview = { count: number; credits: number; invalid: number; samples: { recipient: string; name: string | null; message: string }[] };

type Props = {
    logs: Paginated<Log>;
    filters: { search: string; status: string; channel: string; from: string; to: string };
    templates: Template[];
    classes: Option[];
    variables: string[];
    gateway: string;
    credits: { limit: number; used: number; remaining: number };
    stats: { sent_month: number; credits_month: number; failed_month: number; total: number; by_status: Record<string, number> };
    chart: { label: string; credits: number; total: number; failed: number }[];
};

const audiences = [
    { value: 'guardians', label: 'All parents / guardians' },
    { value: 'class', label: "A class's parents" },
    { value: 'defaulters', label: 'Fee defaulters (parents)' },
    { value: 'staff', label: 'All staff' },
    { value: 'custom', label: 'Custom numbers / emails' },
];

export default function Messages({ logs, filters: initial, templates, classes, variables, gateway, credits, stats, chart }: Props) {
    const can = useCan();
    const manage = can('communication.manage');
    const { school } = usePage().props;
    const { filters, setFilter, reset } = useFilters(initial);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [viewing, setViewing] = useState<Log | null>(null);
    

    const form = useForm({ channel: 'sms', type: 'guardians', school_class_id: '', min_balance: '100000', numbers: '', subject: '', body: '', template_id: '' });

    const chars = form.data.body.length;
    const perMessage = form.data.channel === 'sms' ? smsCredits(form.data.body || ' ') : 0;
    const usedPct = credits.limit ? Math.min(100, Math.round((credits.used / credits.limit) * 100)) : 0;

    const applyTemplate = (id: string) => {
        const t = templates.find((x) => String(x.id) === id);
        form.setData((d) => ({ ...d, template_id: id, ...(t ? { body: t.body, subject: t.subject ?? '', channel: t.channel } : {}) }));
    };

    const insertVariable = (v: string) => {
        const el = document.getElementById('compose-body') as HTMLTextAreaElement | null;
        const body = form.data.body;
        if (!el) return form.setData('body', body + v);
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? body.length;
        form.setData('body', body.slice(0, start) + v + body.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + v.length, start + v.length);
        });
    };

    const payload = () => {
        const { template_id: _ignored, ...rest } = form.data;
        void _ignored;
        return rest;
    };

    const runPreview = async () => {
        form.clearErrors();
        setPreviewing(true);
        try {
            setPreview(await postJson<Preview>('/communication/messages/preview', payload()));
        } catch (e) {
            const err = e as { status?: number; errors?: Record<string, string[]>; message?: string };
            if (err.errors && Object.keys(err.errors).length) {
                form.setError(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])) as never);
            } else toast(err.message ?? 'Could not build the preview.', 'error');
        } finally {
            setPreviewing(false);
        }
    };

    const send = () => {
        form.transform(() => payload());
        form.post('/communication/messages', {
            preserveScroll: true,
            onSuccess: () => {
                setPreview(null);
                form.setData((d) => ({ ...d, body: '', subject: '', numbers: '', template_id: '' }));
            },
            onError: () => setPreview(null),
        });
    };

    const columns: Column<Log>[] = [
        { key: 'date', header: 'Date', render: (m) => <span className="whitespace-nowrap">{dateTime(m.created_at)}</span> },
        {
            key: 'recipient',
            header: 'Recipient',
            render: (m) => (
                <div>
                    <div className="flex items-center gap-1.5 font-semibold">
                        {m.channel === 'email' ? <Mail className="h-3.5 w-3.5 text-info" /> : <Smartphone className="h-3.5 w-3.5 text-primary" />}
                        {m.recipient}
                    </div>
                    {m.recipient_name && <div className="text-xs text-white-dark">{m.recipient_name}</div>}
                </div>
            ),
        },
        {
            key: 'message',
            header: 'Message',
            render: (m) => (
                <button type="button" className="max-w-xs truncate text-start hover:text-primary sm:max-w-md" onClick={() => setViewing(m)}>
                    {m.subject ? <strong>{m.subject}: </strong> : null}
                    {m.message}
                </button>
            ),
        },
        { key: 'credits', header: 'Credits', align: 'center', render: (m) => (m.channel === 'sms' ? m.credits : '—') },
        { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (m) => (
                <div className="flex justify-end gap-1">
                    <IconButton icon={Eye} title="View" className="text-info" onClick={() => setViewing(m)} />
                    {manage && m.status === 'failed' && (
                        <IconButton
                            icon={RotateCcw}
                            title="Retry"
                            className="text-warning"
                            onClick={async () => {
                                const { confirmed } = await confirm({ title: 'Retry this message?', confirmText: 'Retry' });
                                if (confirmed) router.post(`/communication/messages/${m.id}/retry`, {}, { preserveScroll: true });
                            }}
                        />
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader
                title="SMS & Email"
                subtitle={`Compose bulk messages, track delivery and credit usage. Provider: ${gateway === 'log' ? 'Log driver (test mode)' : gateway}`}
                breadcrumbs={[{ title: 'Communication' }, { title: 'SMS & Email' }]}
                actions={
                    <a href={`/communication/messages/export?${new URLSearchParams(cleanQuery(filters) as Record<string, string>)}`} className="btn btn-outline-primary">
                        <Download className="h-4 w-4" /> Export log
                    </a>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Sent this month" value={num(stats.sent_month)} icon={CheckCircle2} tone="success" />
                <StatCard title="Credits used (month)" value={num(stats.credits_month)} icon={Coins} tone="primary" hint={credits.limit ? `${num(credits.remaining)} of ${num(credits.limit)} remaining` : 'No plan limit'} />
                <StatCard title="Failed this month" value={num(stats.failed_month)} icon={XCircle} tone="danger" />
                <StatCard title="All-time messages" value={num(stats.total)} icon={MessageSquareText} tone="info" />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="panel xl:col-span-2">
                    <h5 className="mb-4 text-lg font-bold">Compose message</h5>
                    {manage ? (
                        <div className="space-y-5">
                            <FormGrid cols={3}>
                                <Field label="Channel">
                                    <div className="flex gap-2">
                                        {(['sms', 'email'] as const).map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => form.setData('channel', c)}
                                                className={cn('btn flex-1', form.data.channel === c ? 'btn-primary' : 'btn-outline-primary')}
                                            >
                                                {c === 'sms' ? <Smartphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {c.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </Field>
                                <Select label="Audience" value={form.data.type} onChange={(e) => form.setData('type', e.target.value)} options={audiences} error={form.errors.type} />
                                <Select
                                    label="Template"
                                    placeholder="— Write from scratch —"
                                    value={form.data.template_id}
                                    onChange={(e) => applyTemplate(e.target.value)}
                                    options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.channel.toUpperCase()})` }))}
                                />
                            </FormGrid>

                            {form.data.type === 'class' && (
                                <Select label="Class" required placeholder="Select class" value={form.data.school_class_id} onChange={(e) => form.setData('school_class_id', e.target.value)} options={classes} error={form.errors.school_class_id} />
                            )}
                            {form.data.type === 'defaulters' && (
                                <Input
                                    label={`Minimum outstanding balance (${school?.currency ?? 'TZS'})`}
                                    type="number"
                                    min={0}
                                    value={form.data.min_balance}
                                    onChange={(e) => form.setData('min_balance', e.target.value)}
                                    error={form.errors.min_balance}
                                    help="Parents of active students whose balance is greater than this amount."
                                />
                            )}
                            {form.data.type === 'custom' && (
                                <Textarea
                                    label={form.data.channel === 'sms' ? 'Phone numbers' : 'Email addresses'}
                                    rows={3}
                                    value={form.data.numbers}
                                    onChange={(e) => form.setData('numbers', e.target.value)}
                                    error={form.errors.numbers}
                                    placeholder={form.data.channel === 'sms' ? '0754 123 456, +255 713 000 111 …' : 'name@example.com, …'}
                                    help="Separate with commas, spaces or new lines. Duplicates are removed automatically."
                                />
                            )}
                            {form.data.channel === 'email' && <Input label="Subject" required value={form.data.subject} onChange={(e) => form.setData('subject', e.target.value)} error={form.errors.subject} />}

                            <div>
                                <Textarea
                                    id="compose-body"
                                    label="Message"
                                    required
                                    rows={5}
                                    value={form.data.body}
                                    onChange={(e) => form.setData('body', e.target.value)}
                                    error={form.errors.body}
                                    placeholder="Ndugu {guardian_name}, …"
                                />
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {variables.map((v) => (
                                            <button key={v} type="button" title={VARIABLE_HINTS[v]} onClick={() => insertVariable(v)} className="badge badge-outline-primary cursor-pointer hover:bg-primary hover:text-white">
                                                {v}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={cn('text-xs font-bold', chars > 160 ? 'text-warning' : 'text-white-dark')}>
                                        {chars} chars{form.data.channel === 'sms' && ` · ${perMessage} credit${perMessage > 1 ? 's' : ''} per recipient`}
                                    </div>
                                </div>
                                {form.data.channel === 'sms' && <p className="mt-1 text-xs text-white-dark">Variables expand per recipient, so the final length may differ. Avoid sensitive details in SMS.</p>}
                            </div>

                            <div className="flex justify-end">
                                <button type="button" className="btn btn-primary" disabled={previewing || !form.data.body} onClick={runPreview}>
                                    {previewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview & send
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-white-dark">You have read-only access to communication. Ask an administrator for permission to send messages.</p>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="panel">
                        <h5 className="mb-1 text-lg font-bold">SMS credits this month</h5>
                        <p className="mb-4 text-xs text-white-dark">Plan allowance across all schools in your account.</p>
                        {credits.limit ? (
                            <>
                                <div className="mb-1 flex justify-between text-sm font-bold">
                                    <span>{num(credits.used)} used</span>
                                    <span className="text-white-dark">{num(credits.limit)}</span>
                                </div>
                                <div className="h-3 overflow-hidden rounded-full bg-[#ebedf2] dark:bg-dark/40">
                                    <div className={cn('h-full rounded-full', usedPct >= 90 ? 'bg-danger' : usedPct >= 75 ? 'bg-warning' : 'bg-success')} style={{ width: `${usedPct}%` }} />
                                </div>
                                {usedPct >= 75 && (
                                    <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-warning">
                                        <AlertTriangle className="h-4 w-4" /> {usedPct >= 100 ? 'Credits exhausted — SMS sending is blocked.' : 'Credits running low.'}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-white-dark">Your plan has no SMS allowance configured.</p>
                        )}
                    </div>
                    <div className="panel">
                        <h5 className="mb-2 text-lg font-bold">Credits used — last 6 months</h5>
                        <Chart
                            type="bar"
                            height={220}
                            series={[
                                { name: 'Credits', data: chart.map((c) => c.credits) },
                                { name: 'Failed msgs', data: chart.map((c) => c.failed) },
                            ]}
                            options={{ xaxis: { categories: chart.map((c) => c.label) }, plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } }, colors: ['#4361ee', '#e7515a'] }}
                        />
                    </div>
                </div>
            </div>

            <div className="panel">
                <h5 className="mb-4 text-lg font-bold">Delivery log</h5>
                <FilterBar
                    actions={
                        Object.values(filters).some(Boolean) && (
                            <button type="button" className="btn btn-sm btn-outline-dark" onClick={reset}>
                                Clear filters
                            </button>
                        )
                    }
                >
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search recipient or text…" />
                    <FilterSelect
                        value={filters.status}
                        onChange={(v) => setFilter('status', v)}
                        options={['queued', 'sent', 'delivered', 'failed'].map((s) => ({ value: s, label: `${titleCase(s)} (${num(stats.by_status[s] ?? 0)})` }))}
                        placeholder="Any status"
                    />
                    <FilterSelect
                        value={filters.channel}
                        onChange={(v) => setFilter('channel', v)}
                        options={[
                            { value: 'sms', label: 'SMS' },
                            { value: 'email', label: 'Email' },
                        ]}
                        placeholder="All channels"
                    />
                    <DateRangePicker from={filters.from} to={filters.to} onChange={(f, t) => { setFilter('from', f); setFilter('to', t); }} />
                </FilterBar>
                <DataTable columns={columns} paginated={logs} empty="No messages found" emptyDescription="Sent messages and their delivery status appear here." />
            </div>

            <Modal
                open={!!preview}
                onClose={() => setPreview(null)}
                title="Review before sending"
                size="lg"
                footer={
                    <>
                        <button className="btn btn-outline-dark" onClick={() => setPreview(null)}>
                            Back to edit
                        </button>
                        <button className="btn btn-success" disabled={form.processing || !preview?.count} onClick={send}>
                            {form.processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to {num(preview?.count ?? 0)} recipients
                        </button>
                    </>
                }
            >
                {preview && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="rounded-lg bg-primary-light p-3 dark:bg-primary-dark-light">
                                <div className="text-xl font-extrabold text-primary">{num(preview.count)}</div>
                                <div className="text-[11px] font-bold text-white-dark uppercase">Recipients</div>
                            </div>
                            <div className="rounded-lg bg-warning-light p-3 dark:bg-warning-dark-light">
                                <div className="text-xl font-extrabold text-warning">{form.data.channel === 'sms' ? num(preview.credits) : '—'}</div>
                                <div className="text-[11px] font-bold text-white-dark uppercase">SMS credits</div>
                            </div>
                            <div className="rounded-lg bg-danger-light p-3 dark:bg-danger-dark-light">
                                <div className="text-xl font-extrabold text-danger">{num(preview.invalid)}</div>
                                <div className="text-[11px] font-bold text-white-dark uppercase">Invalid / skipped</div>
                            </div>
                        </div>
                        {form.data.channel === 'sms' && credits.limit > 0 && preview.credits > credits.remaining && (
                            <p className="flex items-center gap-2 rounded-md bg-danger-light p-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">
                                <AlertTriangle className="h-4 w-4" /> Not enough credits: {num(credits.remaining)} remaining this month.
                            </p>
                        )}
                        {preview.count === 0 ? (
                            <p className="text-sm text-white-dark">No valid recipients match this audience.</p>
                        ) : (
                            <div>
                                <h6 className="mb-2 text-sm font-bold">Sample messages</h6>
                                <div className="space-y-3">
                                    {preview.samples.map((s, i) => (
                                        <div key={i} className="rounded-lg border border-white-light p-3 dark:border-[#1b2e4b]">
                                            <div className="mb-1 text-xs font-bold text-white-dark">
                                                To {s.name ? `${s.name} · ` : ''}
                                                {s.recipient}
                                            </div>
                                            <div className="text-sm whitespace-pre-line">{s.message}</div>
                                            {form.data.channel === 'sms' && (
                                                <div className="mt-1 text-end text-[11px] text-white-dark">
                                                    {s.message.length} chars · {smsCredits(s.message)} credit(s)
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <Modal open={!!viewing} onClose={() => setViewing(null)} title="Message details">
                {viewing && (
                    <dl className="space-y-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge status={viewing.status} />
                            <span className="badge badge-outline-dark">{viewing.channel.toUpperCase()}</span>
                        </div>
                        <div>
                            <dt className="text-xs font-bold text-white-dark uppercase">Recipient</dt>
                            <dd>
                                {viewing.recipient_name ? `${viewing.recipient_name} · ` : ''}
                                {viewing.recipient}
                            </dd>
                        </div>
                        {viewing.subject && (
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Subject</dt>
                                <dd>{viewing.subject}</dd>
                            </div>
                        )}
                        <div>
                            <dt className="text-xs font-bold text-white-dark uppercase">Message</dt>
                            <dd className="rounded-md bg-[#f6f8fa] p-3 whitespace-pre-line dark:bg-[#1a2941]">{viewing.message}</dd>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Provider ref.</dt>
                                <dd className="font-mono text-xs">{viewing.provider_reference ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Credits</dt>
                                <dd>{viewing.credits}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Sent</dt>
                                <dd>{dateTime(viewing.created_at)}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Sent by</dt>
                                <dd>{viewing.sender ?? 'System'}</dd>
                            </div>
                        </div>
                        {viewing.error && (
                            <div>
                                <dt className="text-xs font-bold text-white-dark uppercase">Error</dt>
                                <dd className="text-danger">{viewing.error}</dd>
                            </div>
                        )}
                    </dl>
                )}
            </Modal>
        </>
    );
}
