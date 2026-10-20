import { Link, router, usePage } from '@inertiajs/react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Plus, RotateCcw, Save, Trash2, Undo2, X } from 'lucide-react';
import { useState, type DragEvent, type ReactNode } from 'react';
import InvoiceDocumentView from '@/components/invoice-layout/document';
import { useLayoutFonts } from '@/components/invoice-layout/fonts';
import { BLOCK_CATALOG, FIELD_NAMES, fontStack, newBlock, type Block, type BlockType, type InvoiceData, type Layout, type PageSettings } from '@/components/invoice-layout/schema';
import PageHeader from '@/components/ui/page-header';
import Tabs from '@/components/ui/tabs';
import { confirm } from '@/lib/swal';
import { cn } from '@/lib/utils';

type Props = { layout: Layout; template: string | null; sample: InvoiceData; fonts: string[] };

const WIDTHS: { value: Block['width']; label: string }[] = [
    { value: 12, label: 'Full' },
    { value: 8, label: '⅔' },
    { value: 6, label: '½' },
    { value: 4, label: '⅓' },
];

/* Small form controls for the property panel. */
function Prop({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[11px] font-bold tracking-wide text-white-dark uppercase">{label}</span>
            {children}
        </label>
    );
}

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
        <div className="flex overflow-hidden rounded-md border border-white-light dark:border-[#1b2e4b]">
            {options.map((o) => (
                <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn('flex-1 px-2 py-1.5 text-xs font-semibold transition', value === o.value ? 'bg-primary text-white' : 'hover:bg-primary-light dark:hover:bg-primary-dark-light')}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function ColorProp({ label, value, onChange, allowEmpty = true }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
    return (
        <Prop label={label}>
            <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-12 cursor-pointer rounded border border-white-light bg-transparent dark:border-[#1b2e4b]" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />
                <span className="font-mono text-xs text-white-dark">{value || 'default'}</span>
                {allowEmpty && value && (
                    <button type="button" className="ms-auto text-white-dark hover:text-danger" onClick={() => onChange('')} title="Use default">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
        </Prop>
    );
}

function Range({ label, value, min, max, onChange, unit = 'px' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) {
    return (
        <Prop label={`${label} · ${value}${unit}`}>
            <input type="range" className="w-full accent-primary" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        </Prop>
    );
}

export default function InvoiceLayoutDesigner({ layout: initial, template, sample, fonts }: Props) {
    const errors = usePage().props.errors as Record<string, string>;
    const [layout, setLayout] = useState<Layout>(initial);
    const [history, setHistory] = useState<Layout[]>([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(initial.blocks[0]?.id ?? null);
    const [tab, setTab] = useState('block');
    const [adding, setAdding] = useState(false);
    const [zoom, setZoom] = useState(0.85);
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    useLayoutFonts(fonts);

    const selected = layout.blocks.find((b) => b.id === selectedId) ?? null;

    const commit = (next: Layout) => {
        setHistory((h) => [...h.slice(-49), layout]);
        setLayout(next);
        setDirty(true);
    };
    const undo = () => {
        const prev = history[history.length - 1];
        if (!prev) return;
        setHistory((h) => h.slice(0, -1));
        setLayout(prev);
        setDirty(true);
    };

    const setPage = (patch: Partial<PageSettings>) => commit({ ...layout, page: { ...layout.page, ...patch } });
    const setBlock = (id: string, patch: Partial<Block>) => commit({ ...layout, blocks: layout.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
    const setOption = (b: Block, key: string, value: unknown) => setBlock(b.id, { options: { ...b.options, [key]: value } });

    const move = (fromId: string, toId: string) => {
        const blocks = [...layout.blocks];
        const from = blocks.findIndex((b) => b.id === fromId);
        const to = blocks.findIndex((b) => b.id === toId);
        if (from < 0 || to < 0 || from === to) return;
        const [item] = blocks.splice(from, 1);
        blocks.splice(to, 0, item);
        commit({ ...layout, blocks });
    };
    const moveBy = (id: string, delta: number) => {
        const i = layout.blocks.findIndex((b) => b.id === id);
        const target = layout.blocks[i + delta];
        if (target) move(id, target.id);
    };
    const add = (type: BlockType) => {
        const block = newBlock(type);
        const at = selected ? layout.blocks.findIndex((b) => b.id === selected.id) + 1 : layout.blocks.length;
        const blocks = [...layout.blocks];
        blocks.splice(at, 0, block);
        commit({ ...layout, blocks });
        setSelectedId(block.id);
        setTab('block');
        setAdding(false);
    };
    const duplicate = (b: Block) => {
        const copy = { ...structuredClone(b), id: `${b.type}-${Math.random().toString(36).slice(2, 8)}` };
        const blocks = [...layout.blocks];
        blocks.splice(blocks.findIndex((x) => x.id === b.id) + 1, 0, copy);
        commit({ ...layout, blocks });
        setSelectedId(copy.id);
    };
    const remove = (b: Block) => {
        commit({ ...layout, blocks: layout.blocks.filter((x) => x.id !== b.id) });
        setSelectedId(null);
    };

    const save = () => {
        setSaving(true);
        router.put('/admin/settings/invoice-layout', { layout }, { preserveScroll: true, preserveState: true, onSuccess: () => setDirty(false), onFinish: () => setSaving(false) });
    };
    const reset = async () => {
        const { confirmed } = await confirm({ title: 'Reset to the original design?', text: `All your changes to “${template ?? 'this layout'}” will be lost.`, confirmText: 'Reset', danger: true });
        if (confirmed)
            router.post('/admin/settings/invoice-layout/reset', {}, {
                preserveScroll: true,
                onSuccess: (page) => {
                    const fresh = (page.props as unknown as Props).layout;
                    setLayout(fresh);
                    setHistory([]);
                    setDirty(false);
                    setSelectedId(fresh.blocks[0]?.id ?? null);
                },
            });
    };

    const listDrag = (id: string) => ({
        draggable: true,
        onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData('text/block', id);
            e.dataTransfer.effectAllowed = 'move';
            setDragId(id);
        },
        onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setOverId(id);
        },
        onDragEnd: () => {
            setDragId(null);
            setOverId(null);
        },
        onDrop: (e: DragEvent) => {
            e.preventDefault();
            const from = e.dataTransfer.getData('text/block');
            if (from) move(from, id);
            setDragId(null);
            setOverId(null);
        },
    });

    const p = layout.page;

    return (
        <>
            <PageHeader
                title="Invoice Layout Designer"
                subtitle={template ? `Based on “${template}” · drag blocks to rearrange, click one to style it` : undefined}
                breadcrumbs={[{ title: 'Administration' }, { title: 'Settings', href: '/admin/settings' }, { title: 'Invoice layout', href: '/admin/settings?tab=invoice-layout' }, { title: 'Designer' }]}
                actions={
                    <>
                        {dirty && <span className="badge badge-soft-warning self-center">Unsaved changes</span>}
                        <button className="btn btn-outline-dark" onClick={undo} disabled={!history.length} title="Undo">
                            <Undo2 className="h-4 w-4" /> Undo
                        </button>
                        <button className="btn btn-outline-danger" onClick={reset}>
                            <RotateCcw className="h-4 w-4" /> Reset
                        </button>
                        <Link href="/admin/settings?tab=invoice-layout" className="btn btn-outline-primary">
                            Back
                        </Link>
                        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
                            <Save className="h-4 w-4" /> Save layout
                        </button>
                    </>
                }
            />

            {(errors.layout || errors['layout.blocks']) && <div className="mb-4 rounded-md bg-danger-light p-3 text-sm text-danger dark:bg-danger-dark-light">{errors.layout || errors['layout.blocks']}</div>}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
                {/* Block list */}
                <div className="panel p-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                    <div className="mb-2 flex items-center justify-between">
                        <h5 className="font-bold">Blocks</h5>
                        <button className="btn btn-sm btn-primary" onClick={() => setAdding((v) => !v)}>
                            <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                    </div>
                    {adding && (
                        <div className="mb-3 grid grid-cols-1 gap-1 rounded-md border border-primary/30 bg-primary-light/40 p-2 dark:bg-primary-dark-light">
                            {(Object.keys(BLOCK_CATALOG) as BlockType[]).map((t) => (
                                <button key={t} type="button" className="rounded px-2 py-1 text-start text-xs hover:bg-white dark:hover:bg-[#1b2e4b]" onClick={() => add(t)}>
                                    <div className="font-semibold">{BLOCK_CATALOG[t].name}</div>
                                    <div className="text-[11px] text-white-dark">{BLOCK_CATALOG[t].hint}</div>
                                </button>
                            ))}
                        </div>
                    )}
                    <p className="mb-2 text-[11px] text-white-dark">Drag to reorder. Blocks narrower than “Full” sit side by side.</p>
                    <ul className="space-y-1">
                        {layout.blocks.map((b, i) => (
                            <li
                                key={b.id}
                                {...listDrag(b.id)}
                                onClick={() => {
                                    setSelectedId(b.id);
                                    setTab('block');
                                }}
                                className={cn(
                                    'group flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm transition',
                                    selectedId === b.id ? 'border-primary bg-primary-light dark:bg-primary-dark-light' : 'border-white-light hover:border-primary/50 dark:border-[#1b2e4b]',
                                    dragId === b.id && 'opacity-40',
                                    overId === b.id && dragId !== b.id && 'border-t-2 border-t-primary',
                                    !b.visible && 'text-white-dark',
                                )}
                            >
                                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-white-dark" />
                                <div className="min-w-0 flex-1">
                                    <div className={cn('truncate font-semibold', !b.visible && 'line-through')}>{b.type === 'text' && b.label ? b.label : BLOCK_CATALOG[b.type].name}</div>
                                    <div className="text-[10px] text-white-dark">{WIDTHS.find((w) => w.value === b.width)?.label} width</div>
                                </div>
                                <button type="button" className="hidden text-white-dark group-hover:block hover:text-primary" onClick={(e) => (e.stopPropagation(), moveBy(b.id, -1))} disabled={i === 0} title="Move up">
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    className="hidden text-white-dark group-hover:block hover:text-primary"
                                    onClick={(e) => (e.stopPropagation(), moveBy(b.id, 1))}
                                    disabled={i === layout.blocks.length - 1}
                                    title="Move down"
                                >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" className="text-white-dark hover:text-primary" onClick={(e) => (e.stopPropagation(), setBlock(b.id, { visible: !b.visible }))} title={b.visible ? 'Hide' : 'Show'}>
                                    {b.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Canvas */}
                <div className="panel min-w-0 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="text-xs text-white-dark">Live preview with sample data · click a block to edit it, drag it to move it</span>
                        <div className="w-44">
                            <Choice
                                value={zoom}
                                onChange={setZoom}
                                options={[
                                    { value: 0.6, label: '60%' },
                                    { value: 0.85, label: '85%' },
                                    { value: 1, label: '100%' },
                                ]}
                            />
                        </div>
                    </div>
                    <div className="overflow-auto rounded-md bg-[#e9ecef] p-4 dark:bg-[#0e1726]">
                        <div style={{ zoom }}>
                            <InvoiceDocumentView
                                layout={layout}
                                data={sample}
                                editing
                                selectedId={selectedId}
                                onSelect={(id) => {
                                    setSelectedId(id);
                                    setTab('block');
                                }}
                                onMove={move}
                            />
                        </div>
                    </div>
                </div>

                {/* Properties */}
                <div className="panel p-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                    <Tabs
                        tabs={[
                            { key: 'block', label: 'Block' },
                            { key: 'page', label: 'Page & fonts' },
                        ]}
                        active={tab}
                        onChange={setTab}
                    />

                    {tab === 'page' ? (
                        <div className="space-y-4">
                            <Prop label="Font family">
                                <select className="form-select" value={p.font} onChange={(e) => setPage({ font: e.target.value })} style={{ fontFamily: fontStack(p.font) }}>
                                    {fonts.map((f) => (
                                        <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>
                                            {f}
                                        </option>
                                    ))}
                                </select>
                            </Prop>
                            <Range label="Base font size" value={p.fontSize} min={9} max={18} onChange={(v) => setPage({ fontSize: v })} />
                            <ColorProp label="Accent colour" value={p.accent} onChange={(v) => setPage({ accent: v })} allowEmpty={false} />
                            <ColorProp label="Text colour" value={p.text} onChange={(v) => setPage({ text: v })} allowEmpty={false} />
                            <Prop label="Paper">
                                <Choice value={p.paper} onChange={(v) => setPage({ paper: v })} options={(['A4', 'A5', 'Letter'] as const).map((x) => ({ value: x, label: x }))} />
                            </Prop>
                            <Range label="Page margin" value={p.margin} min={5} max={30} unit="mm" onChange={(v) => setPage({ margin: v })} />
                            <Prop label="Page border">
                                <Choice
                                    value={p.border}
                                    onChange={(v) => setPage({ border: v })}
                                    options={[
                                        { value: 'none', label: 'None' },
                                        { value: 'thin', label: 'Thin' },
                                        { value: 'thick', label: 'Thick' },
                                        { value: 'double', label: 'Double' },
                                    ]}
                                />
                            </Prop>
                            <Prop label="Accent bar">
                                <Choice
                                    value={p.accentBar}
                                    onChange={(v) => setPage({ accentBar: v })}
                                    options={[
                                        { value: 'none', label: 'None' },
                                        { value: 'top', label: 'Top' },
                                        { value: 'left', label: 'Left' },
                                    ]}
                                />
                            </Prop>
                            <Prop label="Headings">
                                <Choice
                                    value={p.headingCase}
                                    onChange={(v) => setPage({ headingCase: v })}
                                    options={[
                                        { value: 'upper', label: 'UPPERCASE' },
                                        { value: 'normal', label: 'Normal' },
                                    ]}
                                />
                            </Prop>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" className="form-checkbox" checked={p.stamp} onChange={(e) => setPage({ stamp: e.target.checked })} />
                                Status stamp (PAID / OVERDUE / CANCELLED)
                            </label>
                        </div>
                    ) : !selected ? (
                        <p className="py-8 text-center text-sm text-white-dark">Click a block on the page or in the list to edit it.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="font-bold">{BLOCK_CATALOG[selected.type].name}</div>
                                    <div className="text-[11px] text-white-dark">{BLOCK_CATALOG[selected.type].hint}</div>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" className="btn btn-sm btn-outline-primary px-2" onClick={() => duplicate(selected)} title="Duplicate">
                                        <Copy className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" className="btn btn-sm btn-outline-danger px-2" onClick={() => remove(selected)} title="Remove block">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {!['letterhead', 'title', 'divider', 'spacer'].includes(selected.type) && (
                                <Prop label={selected.type === 'text' ? 'Section heading' : 'Heading / label'}>
                                    <input className="form-input" value={selected.label} onChange={(e) => setBlock(selected.id, { label: e.target.value })} placeholder="(no heading)" />
                                </Prop>
                            )}

                            <BlockOptions b={selected} setOption={setOption} />

                            {Object.keys(selected.fields).length > 0 && (
                                <Prop label="Lines (untick to remove, type to rename)">
                                    <div className="space-y-1.5">
                                        {Object.keys(selected.fields).map((k) => (
                                            <div key={k} className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    className="form-checkbox"
                                                    checked={selected.fields[k]}
                                                    onChange={(e) => setBlock(selected.id, { fields: { ...selected.fields, [k]: e.target.checked } })}
                                                    aria-label={FIELD_NAMES[k] ?? k}
                                                />
                                                {k in selected.labels ? (
                                                    <input
                                                        className="form-input py-1 text-xs"
                                                        value={selected.labels[k]}
                                                        onChange={(e) => setBlock(selected.id, { labels: { ...selected.labels, [k]: e.target.value } })}
                                                        title={FIELD_NAMES[k]}
                                                        disabled={!selected.fields[k]}
                                                    />
                                                ) : (
                                                    <span className={cn('text-sm', !selected.fields[k] && 'text-white-dark line-through')}>{FIELD_NAMES[k] ?? k}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Prop>
                            )}

                            <div className="border-t border-white-light pt-4 dark:border-[#1b2e4b]">
                                <div className="mb-3 text-xs font-bold text-primary uppercase">Style</div>
                                <div className="space-y-4">
                                    <Prop label="Width">
                                        <Choice value={selected.width} onChange={(v) => setBlock(selected.id, { width: v })} options={WIDTHS} />
                                    </Prop>
                                    <Prop label="Alignment">
                                        <Choice
                                            value={selected.align}
                                            onChange={(v) => setBlock(selected.id, { align: v })}
                                            options={[
                                                { value: 'left', label: 'Left' },
                                                { value: 'center', label: 'Centre' },
                                                { value: 'right', label: 'Right' },
                                            ]}
                                        />
                                    </Prop>
                                    <Range label="Font size" value={selected.fontSize} min={8} max={40} onChange={(v) => setBlock(selected.id, { fontSize: v })} />
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" className="form-checkbox" checked={selected.bold} onChange={(e) => setBlock(selected.id, { bold: e.target.checked })} /> Bold text
                                    </label>
                                    <ColorProp label="Text colour" value={selected.color} onChange={(v) => setBlock(selected.id, { color: v })} />
                                    <ColorProp label="Background" value={selected.background} onChange={(v) => setBlock(selected.id, { background: v })} />
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" className="form-checkbox" checked={selected.border} onChange={(e) => setBlock(selected.id, { border: e.target.checked })} /> Border around block
                                    </label>
                                    <Range label="Inner spacing" value={selected.padding} min={0} max={40} onChange={(v) => setBlock(selected.id, { padding: v })} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

/** Type-specific settings. */
function BlockOptions({ b, setOption }: { b: Block; setOption: (b: Block, key: string, value: unknown) => void }) {
    const o = b.options;
    switch (b.type) {
        case 'letterhead':
            return (
                <Prop label="Arrangement">
                    <Choice
                        value={o.style}
                        onChange={(v) => setOption(b, 'style', v)}
                        options={[
                            { value: 'left', label: 'Logo left' },
                            { value: 'center', label: 'Centred' },
                            { value: 'right', label: 'Logo right' },
                        ]}
                    />
                </Prop>
            );
        case 'title':
            return (
                <>
                    <Prop label="Title text">
                        <input className="form-input" value={o.text} onChange={(e) => setOption(b, 'text', e.target.value)} />
                    </Prop>
                    <Prop label="Subtitle">
                        <input className="form-input" value={o.subtitle} onChange={(e) => setOption(b, 'subtitle', e.target.value)} placeholder="(optional)" />
                    </Prop>
                </>
            );
        case 'meta':
            return (
                <Prop label="Arrangement">
                    <Choice
                        value={o.layout}
                        onChange={(v) => setOption(b, 'layout', v)}
                        options={[
                            { value: 'list', label: 'List' },
                            { value: 'grid', label: 'Grid' },
                            { value: 'inline', label: 'One line' },
                        ]}
                    />
                </Prop>
            );
        case 'amount_due':
            return (
                <Prop label="Style">
                    <Choice
                        value={o.style}
                        onChange={(v) => setOption(b, 'style', v)}
                        options={[
                            { value: 'box', label: 'Filled' },
                            { value: 'outline', label: 'Outline' },
                            { value: 'plain', label: 'Plain' },
                        ]}
                    />
                </Prop>
            );
        case 'items':
            return (
                <>
                    <Prop label="Table style">
                        <Choice
                            value={o.style}
                            onChange={(v) => setOption(b, 'style', v)}
                            options={[
                                { value: 'lined', label: 'Lined' },
                                { value: 'striped', label: 'Striped' },
                                { value: 'boxed', label: 'Grid' },
                                { value: 'minimal', label: 'Minimal' },
                            ]}
                        />
                    </Prop>
                    <Prop label="Header row">
                        <Choice
                            value={o.header}
                            onChange={(v) => setOption(b, 'header', v)}
                            options={[
                                { value: 'accent', label: 'Coloured' },
                                { value: 'light', label: 'Tinted' },
                                { value: 'plain', label: 'Plain' },
                            ]}
                        />
                    </Prop>
                </>
            );
        case 'amount_words':
            return (
                <Prop label="Amount">
                    <Choice
                        value={o.basis}
                        onChange={(v) => setOption(b, 'basis', v)}
                        options={[
                            { value: 'balance', label: 'Balance due' },
                            { value: 'total', label: 'Invoice total' },
                        ]}
                    />
                </Prop>
            );
        case 'signatures': {
            const slots: string[] = o.slots ?? [];
            return (
                <Prop label="Signature lines">
                    <div className="space-y-1.5">
                        {slots.map((s, i) => (
                            <div key={i} className="flex gap-1.5">
                                <input
                                    className="form-input py-1 text-xs"
                                    value={s}
                                    onChange={(e) =>
                                        setOption(
                                            b,
                                            'slots',
                                            slots.map((x, j) => (j === i ? e.target.value : x)),
                                        )
                                    }
                                />
                                <button
                                    type="button"
                                    className="text-white-dark hover:text-danger"
                                    onClick={() =>
                                        setOption(
                                            b,
                                            'slots',
                                            slots.filter((_, j) => j !== i),
                                        )
                                    }
                                    aria-label="Remove signature line"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        {slots.length < 4 && (
                            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOption(b, 'slots', [...slots, 'Signature'])}>
                                <Plus className="h-3.5 w-3.5" /> Add line
                            </button>
                        )}
                        <label className="flex items-center gap-2 pt-1 text-sm">
                            <input type="checkbox" className="form-checkbox" checked={!!o.stamp} onChange={(e) => setOption(b, 'stamp', e.target.checked)} /> Official stamp box
                        </label>
                    </div>
                </Prop>
            );
        }
        case 'text':
            return (
                <Prop label="Text">
                    <textarea className="form-textarea" rows={5} value={o.text} onChange={(e) => setOption(b, 'text', e.target.value)} placeholder="e.g. Fees once paid are not refundable…" />
                </Prop>
            );
        case 'footer':
            return (
                <Prop label="Extra footer line">
                    <input className="form-input" value={o.text} onChange={(e) => setOption(b, 'text', e.target.value)} placeholder="e.g. Thank you for paying on time." />
                </Prop>
            );
        case 'divider':
            return (
                <>
                    <Prop label="Line style">
                        <Choice
                            value={o.style}
                            onChange={(v) => setOption(b, 'style', v)}
                            options={[
                                { value: 'solid', label: 'Solid' },
                                { value: 'dashed', label: 'Dashed' },
                                { value: 'dotted', label: 'Dotted' },
                                { value: 'double', label: 'Double' },
                            ]}
                        />
                    </Prop>
                    <Range label="Thickness" value={o.thickness ?? 1} min={1} max={6} onChange={(v) => setOption(b, 'thickness', v)} />
                </>
            );
        case 'spacer':
            return <Range label="Height" value={o.height ?? 16} min={4} max={120} onChange={(v) => setOption(b, 'height', v)} />;
        default:
            return null;
    }
}
