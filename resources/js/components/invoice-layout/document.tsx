import { GraduationCap } from 'lucide-react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';
import { cn, date, money, titleCase } from '@/lib/utils';
import { useLayoutFonts } from './fonts';
import { PAPER_HEIGHT_MM, PAPER_WIDTH_MM, fontStack, tint, type Block, type InvoiceData, type Layout, type PageSettings } from './schema';

type Ctx = { page: PageSettings; data: InvoiceData; editing: boolean };

const STAMPS: Record<string, string> = { paid: 'PAID', partial: 'PART PAID', cancelled: 'CANCELLED' };

/**
 * Renders an invoice from a layout. Used for printing, the gallery thumbnails and the designer canvas
 * (`editing` shows hidden/empty blocks faintly and makes blocks selectable and draggable).
 */
export default function InvoiceDocumentView({
    layout,
    data,
    editing = false,
    selectedId,
    onSelect,
    onMove,
    className,
}: {
    layout: Layout;
    data: InvoiceData;
    editing?: boolean;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    onMove?: (fromId: string, toId: string) => void;
    className?: string;
}) {
    const { page } = layout;
    useLayoutFonts([page.font]);
    const ctx: Ctx = { page, data, editing };
    const stamp = page.stamp ? (data.invoice.overdue ? 'OVERDUE' : STAMPS[data.invoice.status]) : undefined;

    const border = { none: 'none', thin: `1px solid ${page.accent}`, thick: `3px solid ${page.accent}`, double: `4px double ${page.accent}` }[page.border];
    const style: CSSProperties = {
        width: `${PAPER_WIDTH_MM[page.paper]}mm`,
        minHeight: `${PAPER_HEIGHT_MM[page.paper]}mm`,
        padding: `${page.margin}mm`,
        fontFamily: fontStack(page.font),
        fontSize: page.fontSize,
        color: page.text,
        background: '#ffffff',
        borderTop: page.accentBar === 'top' ? `8px solid ${page.accent}` : undefined,
        borderLeft: page.accentBar === 'left' ? `10px solid ${page.accent}` : undefined,
    };

    const drag = (id: string) => ({
        draggable: true,
        onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData('text/block', id);
            e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: (e: DragEvent) => e.preventDefault(),
        onDrop: (e: DragEvent) => {
            e.preventDefault();
            const from = e.dataTransfer.getData('text/block');
            if (from && from !== id && onMove) onMove(from, id);
        },
    });

    return (
        <div className={cn('invoice-document relative mx-auto overflow-hidden text-start leading-snug shadow-sm print:shadow-none', className)} style={style}>
            <div style={{ border, padding: page.border === 'none' ? 0 : 14, minHeight: '100%' }}>
                <div className="grid grid-cols-12 gap-x-5 gap-y-3">
                    {layout.blocks.map((b) => {
                        if (!b.visible && !editing) return null;
                        const content = renderBlock(b, ctx);
                        if (content === null && !editing) return null;
                        return (
                            <div
                                key={b.id}
                                {...(editing && onMove ? drag(b.id) : {})}
                                onClick={editing && onSelect ? () => onSelect(b.id) : undefined}
                                className={cn(
                                    'relative min-w-0',
                                    editing && 'cursor-pointer rounded-sm outline-offset-2 hover:outline hover:outline-1 hover:outline-dashed hover:outline-sky-400',
                                    editing && selectedId === b.id && 'outline outline-2 outline-sky-500 hover:outline-2 hover:outline-solid',
                                    editing && !b.visible && 'opacity-30',
                                )}
                                style={{
                                    gridColumn: `span ${b.width} / span ${b.width}`,
                                    textAlign: b.align,
                                    fontSize: b.fontSize,
                                    fontWeight: b.bold ? 700 : undefined,
                                    color: b.color || undefined,
                                    background: b.background || undefined,
                                    border: b.border ? `1px solid ${tint(page.text, 0.25)}` : undefined,
                                    borderRadius: b.border || b.background ? 6 : undefined,
                                    padding: b.padding || undefined,
                                }}
                            >
                                {content ?? <span className="text-[11px] text-slate-400 italic">({b.label || b.type} — nothing to show on this invoice)</span>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {stamp && (
                <div
                    className="pointer-events-none absolute top-[38%] left-1/2 -translate-x-1/2 -rotate-[18deg] rounded-lg border-[6px] px-6 py-2 text-6xl font-black tracking-widest whitespace-nowrap select-none"
                    style={{ color: tint(stamp === 'PAID' ? '#16a34a' : '#dc2626', 0.18), borderColor: tint(stamp === 'PAID' ? '#16a34a' : '#dc2626', 0.18) }}
                >
                    {stamp}
                </div>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */

function Heading({ b, ctx, children }: { b: Block; ctx: Ctx; children?: ReactNode }) {
    const text = children ?? b.label;
    if (!text) return null;
    return (
        <div
            className={cn('mb-1.5 font-bold tracking-wide', ctx.page.headingCase === 'upper' && 'uppercase')}
            style={{ fontSize: Math.max(9, Math.round(b.fontSize * 0.78)), color: b.color || ctx.page.accent }}
        >
            {text}
        </div>
    );
}

function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: string }) {
    return (
        <div className="flex justify-between gap-3 py-0.5" style={{ fontWeight: strong ? 700 : undefined, color: tone }}>
            <span style={{ opacity: strong ? 1 : 0.75 }}>{label}</span>
            <span className="text-end">{value}</span>
        </div>
    );
}

function renderBlock(b: Block, ctx: Ctx): ReactNode | null {
    const { page, data } = ctx;
    const { invoice: inv, student: st, school } = data;
    const cur = data.currency;
    const f = b.fields;
    const L = b.labels;
    const accent = b.color || page.accent;
    const upper = page.headingCase === 'upper';

    switch (b.type) {
        case 'letterhead': {
            const style = b.options.style ?? 'left';
            const logo =
                f.logo &&
                (school.logo_url ? (
                    <img src={school.logo_url} alt="" className="shrink-0 rounded object-contain" style={{ height: b.fontSize * 4.6, width: b.fontSize * 4.6 }} />
                ) : (
                    <span className="grid shrink-0 place-content-center rounded-lg text-white" style={{ height: b.fontSize * 4.6, width: b.fontSize * 4.6, background: page.accent }}>
                        <GraduationCap style={{ height: b.fontSize * 2.4, width: b.fontSize * 2.4 }} />
                    </span>
                ));
            const contacts = [school.phone && `Tel: ${school.phone}`, school.email].filter(Boolean).join(' · ');
            return (
                <div className={cn('flex items-center gap-3', style === 'center' && 'flex-col text-center', style === 'right' && 'flex-row-reverse text-end')}>
                    {logo}
                    <div className="min-w-0">
                        {f.name && (
                            <div className={cn('leading-tight font-extrabold', upper && 'uppercase')} style={{ fontSize: b.fontSize * 1.65, color: b.color || page.accent }}>
                                {school.name}
                            </div>
                        )}
                        {f.motto && school.motto && <div className="italic opacity-80">“{school.motto}”</div>}
                        {f.address && school.address && <div className="opacity-80">{school.address}</div>}
                        {f.contacts && contacts && <div className="opacity-80">{contacts}</div>}
                        {f.registration && school.registration_no && <div className="opacity-80">Reg. No: {school.registration_no}</div>}
                    </div>
                </div>
            );
        }

        case 'title':
            return (
                <div>
                    <div className={cn('tracking-wide', upper && 'uppercase')} style={{ color: b.color || page.accent, fontWeight: b.bold ? 800 : 600 }}>
                        {b.options.text || 'Invoice'}
                    </div>
                    {b.options.subtitle && <div style={{ fontSize: Math.max(9, b.fontSize * 0.55), opacity: 0.75, fontWeight: 400 }}>{b.options.subtitle}</div>}
                </div>
            );

        case 'meta': {
            const rows: [string, ReactNode, string?][] = [];
            if (f.invoice_no) rows.push([L.invoice_no, <strong key="n">{inv.invoice_no}</strong>]);
            if (f.issue_date) rows.push([L.issue_date, date(inv.issue_date)]);
            if (f.due_date) rows.push([L.due_date, date(inv.due_date), inv.overdue ? '#dc2626' : undefined]);
            if (f.period) rows.push([L.period, inv.period]);
            if (f.status) rows.push([L.status, inv.overdue ? 'Overdue' : titleCase(inv.status)]);
            if (!rows.length) return null;
            const layout = b.options.layout ?? 'list';
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    {layout === 'inline' ? (
                        <div>
                            {rows.map(([l, v, tone], i) => (
                                <span key={l} style={{ color: tone }}>
                                    {i > 0 && <span className="mx-2 opacity-40">·</span>}
                                    <span className="opacity-75">{l}:</span> {v}
                                </span>
                            ))}
                        </div>
                    ) : layout === 'grid' ? (
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 sm:grid-cols-5">
                            {rows.map(([l, v, tone]) => (
                                <div key={l} style={{ color: tone }}>
                                    <div className="opacity-65" style={{ fontSize: Math.max(9, b.fontSize * 0.8) }}>
                                        {l}
                                    </div>
                                    <div className="font-semibold">{v}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {rows.map(([l, v, tone]) => (
                                <div key={l} style={{ color: tone }}>
                                    <span className="opacity-75">{l}:</span> {v}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        case 'bill_to':
            if (!st) return null;
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    {f.name && (
                        <div className="font-bold" style={{ fontSize: b.fontSize * 1.2 }}>
                            {st.full_name}
                        </div>
                    )}
                    {f.admission_no && (
                        <div>
                            <span className="opacity-75">{L.admission_no}:</span> {st.admission_no}
                        </div>
                    )}
                    {f.class && (
                        <div>
                            <span className="opacity-75">{L.class}:</span> {st.class || '—'}
                        </div>
                    )}
                    {f.residence && (
                        <div>
                            <span className="opacity-75">{L.residence}:</span> {st.residence_type === 'boarding' ? 'Boarder' : 'Day scholar'}
                        </div>
                    )}
                    {f.guardian && st.guardian && (
                        <div>
                            <span className="opacity-75">{L.guardian}:</span> {st.guardian.name}
                        </div>
                    )}
                    {f.guardian_phone && st.guardian?.phone && (
                        <div>
                            <span className="opacity-75">{L.guardian_phone}:</span> {st.guardian.phone}
                        </div>
                    )}
                </div>
            );

        case 'amount_due': {
            const style = b.options.style ?? 'box';
            const box: CSSProperties =
                style === 'box' && !b.background
                    ? { background: tint(page.accent, 0.1), padding: '10px 16px', borderRadius: 8, display: 'inline-block', textAlign: 'left' }
                    : style === 'outline'
                      ? { border: `2px solid ${accent}`, padding: '10px 16px', borderRadius: 8, display: 'inline-block', textAlign: 'left' }
                      : {};
            return (
                <div style={box}>
                    <div className={cn('font-bold', upper && 'uppercase')} style={{ fontSize: Math.max(9, b.fontSize * 0.8), color: accent }}>
                        {b.label || 'Amount due'}
                    </div>
                    <div className="font-extrabold" style={{ fontSize: b.fontSize * 1.9, color: accent, lineHeight: 1.15 }}>
                        {money(inv.balance, cur)}
                    </div>
                </div>
            );
        }

        case 'items': {
            const cols = (['index', 'description', 'category', 'amount', 'discount', 'net'] as const).filter((c) => f[c]);
            const numeric = (c: string) => ['amount', 'discount', 'net'].includes(c);
            const tableStyle = b.options.style ?? 'lined';
            const header = b.options.header ?? 'accent';
            const cellBorder = tint(page.text, 0.18);
            const th: CSSProperties = {
                padding: '6px 8px',
                fontWeight: 700,
                ...(header === 'accent' ? { background: page.accent, color: '#fff' } : header === 'light' ? { background: tint(page.accent, 0.1), color: page.accent } : { borderBottom: `2px solid ${page.accent}` }),
                ...(tableStyle === 'boxed' ? { border: `1px solid ${cellBorder}` } : {}),
            };
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className={cn(upper && 'uppercase')} style={{ fontSize: Math.max(9, b.fontSize * 0.82), letterSpacing: upper ? '0.03em' : undefined }}>
                                {cols.map((c) => (
                                    <th key={c} style={{ ...th, textAlign: numeric(c) ? 'right' : 'left', width: c === 'index' ? 32 : undefined }}>
                                        {L[c]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {inv.items.map((it, i) => {
                                const td: CSSProperties = {
                                    padding: tableStyle === 'minimal' ? '5px 8px' : '6px 8px',
                                    borderBottom: tableStyle === 'lined' || tableStyle === 'striped' ? `1px solid ${cellBorder}` : undefined,
                                    border: tableStyle === 'boxed' ? `1px solid ${cellBorder}` : undefined,
                                    background: tableStyle === 'striped' && i % 2 === 1 ? tint(page.accent, 0.05) : undefined,
                                };
                                const value = (c: string) =>
                                    c === 'index'
                                        ? i + 1
                                        : c === 'description'
                                          ? it.description
                                          : c === 'category'
                                            ? (it.category ?? '—')
                                            : c === 'discount'
                                              ? Number(it.discount) > 0
                                                  ? `− ${money(it.discount, cur)}`
                                                  : '—'
                                              : money(it[c as 'amount' | 'net'], cur);
                                return (
                                    <tr key={i}>
                                        {cols.map((c) => (
                                            <td key={c} style={{ ...td, textAlign: numeric(c) ? 'right' : 'left', fontWeight: c === 'net' ? 600 : undefined }}>
                                                {value(c)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        }

        case 'totals': {
            const rows: ReactNode[] = [];
            if (f.subtotal) rows.push(<Row key="s" label={L.subtotal} value={money(inv.subtotal, cur)} />);
            if (f.discount) rows.push(<Row key="d" label={L.discount} value={`− ${money(inv.discount, cur)}`} />);
            if (f.total) rows.push(<Row key="t" label={L.total} value={money(inv.total, cur)} strong />);
            if (f.paid) rows.push(<Row key="p" label={L.paid} value={`− ${money(inv.paid, cur)}`} />);
            if (f.balance)
                rows.push(
                    <div key="b" className="mt-1 pt-1.5" style={{ borderTop: `2px solid ${page.accent}` }}>
                        <Row label={L.balance} value={money(inv.balance, cur)} strong tone={Number(inv.balance) > 0 ? '#dc2626' : '#16a34a'} />
                    </div>,
                );
            if (f.account_balance && st && Number(st.account_balance) !== Number(inv.balance))
                rows.push(
                    <div key="a" style={{ fontSize: Math.max(9, b.fontSize * 0.85) }}>
                        <Row label={L.account_balance} value={money(st.account_balance, cur)} />
                    </div>,
                );
            if (!rows.length) return null;
            return (
                <div className="text-start">
                    <Heading b={b} ctx={ctx} />
                    {rows}
                </div>
            );
        }

        case 'amount_words':
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    <div className="italic">{b.options.basis === 'total' ? inv.total_words : inv.balance_words}</div>
                </div>
            );

        case 'payments':
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    {inv.payments.length === 0 ? (
                        <div className="opacity-60">No payments received yet.</div>
                    ) : (
                        inv.payments.map((p, i) => (
                            <Row
                                key={i}
                                label={
                                    <>
                                        {p.receipt_no} · {date(p.payment_date)}
                                        {p.method && ` · ${titleCase(p.method)}`}
                                    </>
                                }
                                value={money(p.amount, cur)}
                            />
                        ))
                    )}
                </div>
            );

        case 'instructions': {
            const ins = data.instructions;
            if (Number(inv.balance) <= 0 && !ctx.editing) return null;
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    <div className="grid grid-cols-2 gap-4 text-start">
                        {f.banks && ins.banks.length > 0 && (
                            <div>
                                <div className="font-semibold">Bank deposit / transfer</div>
                                {ins.banks.map((bk) => (
                                    <div key={bk.bank + (bk.account_no ?? '')}>
                                        <strong>{bk.bank}</strong> — {bk.account_name}
                                        {bk.account_no && <> · A/C {bk.account_no}</>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {f.mobile && ins.mobile.length > 0 && (
                            <div>
                                <div className="font-semibold">Mobile money</div>
                                {ins.mobile.map((m) => (
                                    <div key={m.provider}>
                                        <strong>{m.provider}</strong>
                                        {m.number && <> — {m.number}</>} ({m.name})
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {f.reference && st && (
                        <div className="mt-1.5 opacity-80">
                            Payment reference: <strong>{st.admission_no}</strong>. {ins.note}
                        </div>
                    )}
                </div>
            );
        }

        case 'notes':
            if (!inv.notes) return null;
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    <div className="opacity-85">{inv.notes}</div>
                </div>
            );

        case 'signatures': {
            const slots: string[] = b.options.slots ?? [];
            const cells = slots.length + (b.options.stamp ? 1 : 0);
            if (!cells) return null;
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    <div className="grid gap-6 pt-6" style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
                        {slots.map((s, i) => (
                            <div key={i} className="text-center">
                                <div className="mb-1" style={{ borderBottom: `1px solid ${page.text}`, height: 28 }} />
                                <div className="font-semibold">{s}</div>
                                <div className="opacity-60" style={{ fontSize: Math.max(9, b.fontSize * 0.8) }}>
                                    Signature &amp; date
                                </div>
                            </div>
                        ))}
                        {b.options.stamp && (
                            <div className="grid place-content-center rounded-md text-center opacity-60" style={{ border: `1.5px dashed ${tint(page.text, 0.5)}`, minHeight: 70 }}>
                                Official stamp
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        case 'text':
            if (!b.options.text && !b.label) return null;
            return (
                <div>
                    <Heading b={b} ctx={ctx} />
                    <div className="whitespace-pre-line">{b.options.text}</div>
                </div>
            );

        case 'footer': {
            const parts: string[] = [];
            if (f.issued_by) parts.push(`Issued by: ${inv.created_by ?? 'System'}`);
            if (f.printed_at) parts.push(`Printed: ${date(new Date().toISOString().slice(0, 10))}`);
            if (f.generated) parts.push('This is a computer-generated invoice.');
            if (!parts.length && !b.options.text) return null;
            return (
                <div className="pt-2 opacity-75" style={{ borderTop: `1px solid ${tint(page.text, 0.2)}` }}>
                    {b.options.text && <div className="mb-0.5">{b.options.text}</div>}
                    <div className={cn('flex flex-wrap gap-x-4', b.align === 'center' ? 'justify-center' : b.align === 'right' ? 'justify-end' : 'justify-between')}>
                        {parts.map((p) => (
                            <span key={p}>{p}</span>
                        ))}
                    </div>
                </div>
            );
        }

        case 'divider':
            return <div style={{ borderTop: `${b.options.style === 'double' ? Math.max(3, b.options.thickness ?? 3) : (b.options.thickness ?? 1)}px ${b.options.style ?? 'solid'} ${b.color || page.accent}` }} />;

        case 'spacer':
            return <div style={{ height: b.options.height ?? 16 }} />;
    }
    return null;
}
