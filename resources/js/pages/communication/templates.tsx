import { useForm } from '@inertiajs/react';
import { FileText, Mail, Plus, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RowActions } from '@/components/ui/actions';
import DataTable, { type Column } from '@/components/ui/data-table';
import { FilterBar, FilterSelect, SearchInput, useFilters } from '@/components/ui/filters';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { useCan } from '@/hooks/use-can';
import { cn, dateTime } from '@/lib/utils';
import type { Paginated } from '@/types';
import { smsCredits, VARIABLE_HINTS } from './_components/helpers';

type Template = { id: number; name: string; channel: string; subject: string | null; body: string; updated_at: string | null };

const blank = { name: '', channel: 'sms', subject: '', body: '' };

export default function Templates({ templates, filters: initial, variables }: { templates: Paginated<Template>; filters: { search: string; channel: string }; variables: string[] }) {
    const can = useCan();
    const manage = can('communication.manage');
    const { filters, setFilter } = useFilters(initial);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Template | null>(null);
    const form = useForm(blank);
    

    const openForm = (t: Template | null) => {
        setEditing(t);
        form.clearErrors();
        form.setData(t ? { name: t.name, channel: t.channel, subject: t.subject ?? '', body: t.body } : blank);
        setOpen(true);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.put(`/communication/templates/${editing.id}`, opts);
        else form.post('/communication/templates', opts);
    };

    const insert = (v: string) => {
        const el = document.getElementById('template-body') as HTMLTextAreaElement | null;
        const pos = el?.selectionStart ?? form.data.body.length;
        form.setData('body', form.data.body.slice(0, pos) + v + form.data.body.slice(el?.selectionEnd ?? pos));
    };

    const columns: Column<Template>[] = [
        {
            key: 'name',
            header: 'Template',
            render: (t) => (
                <div className="flex items-center gap-3">
                    <span className={cn('grid h-9 w-9 shrink-0 place-content-center rounded-lg', t.channel === 'email' ? 'bg-info-light text-info dark:bg-info-dark-light' : 'bg-primary-light text-primary dark:bg-primary-dark-light')}>
                        {t.channel === 'email' ? <Mail className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    </span>
                    <div>
                        <div className="font-bold">{t.name}</div>
                        {t.subject && <div className="text-xs text-white-dark">{t.subject}</div>}
                    </div>
                </div>
            ),
        },
        { key: 'body', header: 'Message', render: (t) => <div className="line-clamp-2 max-w-md text-sm text-white-dark">{t.body}</div> },
        { key: 'length', header: 'Length', align: 'center', render: (t) => (t.channel === 'sms' ? <span className="badge badge-soft-secondary">{t.body.length} · {smsCredits(t.body)} cr</span> : '—') },
        { key: 'updated', header: 'Updated', render: (t) => dateTime(t.updated_at) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (t) => (manage ? <RowActions onEdit={() => openForm(t)} destroy={`/communication/templates/${t.id}`} label="template" /> : null),
        },
    ];

    return (
        <>
            <PageHeader
                title="Message Templates"
                subtitle="Reusable SMS and email wording with personalised variables."
                breadcrumbs={[{ title: 'Communication', href: '/communication/messages' }, { title: 'Templates' }]}
                actions={
                    manage && (
                        <button className="btn btn-primary" onClick={() => openForm(null)}>
                            <Plus className="h-4 w-4" /> New template
                        </button>
                    )
                }
            />
            <div className="panel">
                <FilterBar>
                    <SearchInput value={filters.search} onChange={(v) => setFilter('search', v)} placeholder="Search templates…" />
                    <FilterSelect
                        value={filters.channel}
                        onChange={(v) => setFilter('channel', v)}
                        options={[
                            { value: 'sms', label: 'SMS' },
                            { value: 'email', label: 'Email' },
                        ]}
                        placeholder="All channels"
                    />
                </FilterBar>
                <DataTable columns={columns} paginated={templates} empty="No templates yet" emptyDescription="Create templates for fee reminders, absence alerts and results notices." />
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit template' : 'New template'} size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <FormGrid>
                        <Input label="Name" required value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} error={form.errors.name} placeholder="e.g. Fee reminder" />
                        <Select
                            label="Channel"
                            value={form.data.channel}
                            onChange={(e) => form.setData('channel', e.target.value)}
                            options={[
                                { value: 'sms', label: 'SMS' },
                                { value: 'email', label: 'Email' },
                            ]}
                        />
                    </FormGrid>
                    {form.data.channel === 'email' && <Input label="Subject" required value={form.data.subject} onChange={(e) => form.setData('subject', e.target.value)} error={form.errors.subject} />}
                    <Textarea id="template-body" label="Message" required rows={6} value={form.data.body} onChange={(e) => form.setData('body', e.target.value)} error={form.errors.body} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-1.5">
                            {variables.map((v) => (
                                <button key={v} type="button" title={VARIABLE_HINTS[v]} onClick={() => insert(v)} className="badge badge-outline-primary cursor-pointer hover:bg-primary hover:text-white">
                                    {v}
                                </button>
                            ))}
                        </div>
                        {form.data.channel === 'sms' && (
                            <span className="flex items-center gap-1 text-xs font-bold text-white-dark">
                                <FileText className="h-3.5 w-3.5" /> {form.data.body.length} chars · {smsCredits(form.data.body || ' ')} credit(s)
                            </span>
                        )}
                    </div>
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={form.processing}>
                            Save template
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
