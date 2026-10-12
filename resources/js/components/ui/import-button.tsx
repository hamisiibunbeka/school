import { router } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Copy, Download, FileSpreadsheet, LoaderCircle, RotateCcw, Upload, XCircle } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import Modal from '@/components/ui/modal';
import { toast } from '@/lib/swal';
import { cn, exportCsv, num } from '@/lib/utils';

type Row = { line: number; values: Record<string, string>; errors: string[]; duplicate: string | null; status: 'valid' | 'invalid' | 'duplicate' };
type Preview = {
    token: string;
    title: string;
    notes: string | null;
    file: string;
    columns: { key: string; label: string; required: boolean }[];
    rows: Row[];
    counts: { total: number; valid: number; invalid: number; duplicate: number };
    unknown_headers: string[];
    missing_required: string[];
    can_update_duplicates: boolean;
};

function xsrf(): string {
    const match = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
}

async function send(url: string, body: FormData | object): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const isForm = body instanceof FormData;
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf(), 'X-Requested-With': 'XMLHttpRequest', ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
        body: isForm ? body : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
}

/**
 * "Import from Excel" button + 3-step dialog (template → upload & preview → import).
 *   <ImportButton type="students" label="Import students" />
 */
export default function ImportButton({ type, label = 'Import Excel', className }: { type: string; label?: string; className?: string }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button type="button" className={cn('btn btn-outline-success', className)} onClick={() => setOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" /> {label}
            </button>
            {open && <ImportDialog type={type} onClose={() => setOpen(false)} />}
        </>
    );
}

function ImportDialog({ type, onClose }: { type: string; onClose: () => void }) {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [filter, setFilter] = useState<'all' | Row['status']>('all');
    const [includeDuplicates, setIncludeDuplicates] = useState(false);
    const [done, setDone] = useState<{ imported: number; skipped: number; message: string } | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        if (!/\.(xlsx|csv)$/i.test(file.name)) {
            setError('Please choose an Excel (.xlsx) or CSV file. For old .xls files, open in Excel and “Save As” .xlsx.');
            return;
        }
        setBusy(true);
        setError(null);
        const form = new FormData();
        form.append('file', file);
        const { ok, data } = await send(`/imports/${type}/preview`, form);
        setBusy(false);
        if (!ok) {
            const errors = data.errors as Record<string, string[]> | undefined;
            setError(errors ? Object.values(errors).flat()[0] : ((data.message as string) ?? 'The file could not be read.'));
            return;
        }
        setPreview(data as unknown as Preview);
        setFilter((data as unknown as Preview).counts.invalid > 0 ? 'invalid' : 'all');
    };

    const commit = async () => {
        if (!preview) return;
        setBusy(true);
        const { ok, data } = await send(`/imports/${type}/commit`, { token: preview.token, include_duplicates: includeDuplicates });
        setBusy(false);
        if (!ok) {
            setError((data.message as string) ?? 'Import failed. Nothing was saved.');
            return;
        }
        setDone(data as { imported: number; skipped: number; message: string });
        toast(data.message as string, 'success');
        router.reload();
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files?.[0]);
    };

    const errorReport = () => {
        if (!preview) return;
        const cols = preview.columns;
        exportCsv(`${type}-import-issues`, [
            ['Excel Row', 'Status', 'Issues', ...cols.map((c) => c.label)],
            ...preview.rows.filter((r) => r.status !== 'valid').map((r) => [r.line, r.status, [...r.errors, r.duplicate].filter(Boolean).join(' | '), ...cols.map((c) => r.values[c.key] ?? '')]),
        ]);
    };

    const rows = preview ? preview.rows.filter((r) => filter === 'all' || r.status === filter) : [];
    const shownCols = preview ? preview.columns.filter((c) => preview.rows.some((r) => r.values[c.key])).slice(0, 5) : [];
    const importable = preview ? preview.counts.valid + (includeDuplicates ? preview.counts.duplicate : 0) : 0;
    const blocked = !!preview && preview.missing_required.length > 0;

    return (
        <Modal open onClose={onClose} title={preview ? `Import ${preview.title}` : 'Import from Excel'} size="full">
            {done ? (
                <div className="py-8 text-center">
                    <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-success" />
                    <h3 className="text-xl font-extrabold">{done.message}</h3>
                    <p className="mt-1 text-white-dark">The list has been refreshed. The import is recorded in the audit trail.</p>
                    <div className="mt-6 flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-primary" onClick={() => (setDone(null), setPreview(null))}>
                            <RotateCcw className="h-4 w-4" /> Import another file
                        </button>
                        <button type="button" className="btn btn-primary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            ) : !preview ? (
                <div className="space-y-5">
                    <ol className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                        {['Download the Excel template', 'Fill one record per row (keep the header row)', 'Upload it — we check every row before saving'].map((t, i) => (
                            <li key={t} className="flex items-center gap-3 rounded-md bg-[#f6f8fa] p-3 dark:bg-[#1a2941]">
                                <span className="grid h-7 w-7 shrink-0 place-content-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
                                {t}
                            </li>
                        ))}
                    </ol>
                    <div className="flex justify-center">
                        <a href={`/imports/${type}/template`} className="btn btn-outline-primary">
                            <Download className="h-4 w-4" /> Download template (.xlsx)
                        </a>
                    </div>
                    <div
                        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                        onClick={() => fileInput.current?.click()}
                        className={cn(
                            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition',
                            dragging ? 'border-primary bg-primary-light dark:bg-primary-dark-light' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]',
                        )}
                    >
                        {busy ? <LoaderCircle className="mb-3 h-10 w-10 animate-spin text-primary" /> : <Upload className="mb-3 h-10 w-10 text-primary" />}
                        <div className="text-base font-bold">{busy ? 'Reading and checking your file…' : 'Drop your Excel or CSV file here, or click to browse'}</div>
                        <div className="mt-1 text-xs text-white-dark">.xlsx or .csv · up to 10 MB · max 5,000 rows</div>
                        <input ref={fileInput} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
                    </div>
                    {error && (
                        <div className="flex items-center gap-2 rounded-md bg-danger-light px-4 py-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">
                            <XCircle className="h-5 w-5 shrink-0" /> {error}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="text-sm text-white-dark">
                        File: <strong className="text-black dark:text-white-light">{preview.file}</strong> · nothing has been saved yet.
                        {preview.notes && <div className="mt-1">{preview.notes}</div>}
                    </div>

                    {preview.missing_required.length > 0 && (
                        <div className="flex items-start gap-2 rounded-md bg-danger-light px-4 py-3 text-sm font-semibold text-danger dark:bg-danger-dark-light">
                            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            Missing required column(s): {preview.missing_required.join(', ')}. Use the template header row.
                        </div>
                    )}
                    {preview.unknown_headers.length > 0 && (
                        <div className="flex items-start gap-2 rounded-md bg-warning-light px-4 py-3 text-sm text-warning dark:bg-warning-dark-light">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                            Ignored column(s) not in the template: {preview.unknown_headers.join(', ')}.
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {(
                            [
                                ['all', 'Rows in file', preview.counts.total, 'text-black dark:text-white-light'],
                                ['valid', 'Ready to import', preview.counts.valid, 'text-success'],
                                ['invalid', 'With errors', preview.counts.invalid, 'text-danger'],
                                ['duplicate', 'Duplicates', preview.counts.duplicate, 'text-warning'],
                            ] as const
                        ).map(([key, label, value, tone]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setFilter(key)}
                                className={cn('rounded-md border p-3 text-start transition', filter === key ? 'border-primary ring-2 ring-primary/20' : 'border-white-light dark:border-[#1b2e4b]')}
                            >
                                <div className="text-xs font-bold text-white-dark uppercase">{label}</div>
                                <div className={cn('text-2xl font-extrabold', tone)}>{num(value)}</div>
                            </button>
                        ))}
                    </div>

                    <div className="max-h-[45vh] overflow-auto rounded-md border border-white-light dark:border-[#1b2e4b]">
                        <table className="table table-compact">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th>Row</th>
                                    <th>Status</th>
                                    {shownCols.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                    ))}
                                    <th>Issues</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 500).map((r) => (
                                    <tr key={r.line} className={cn(r.status === 'invalid' && 'bg-danger-light/40 dark:bg-danger-dark-light', r.status === 'duplicate' && 'bg-warning-light/40 dark:bg-warning-dark-light')}>
                                        <td className="font-mono text-xs">{r.line}</td>
                                        <td>
                                            <span className={cn('badge', r.status === 'valid' ? 'badge-soft-success' : r.status === 'invalid' ? 'badge-soft-danger' : 'badge-soft-warning')}>
                                                {r.status === 'valid' ? 'Ready' : r.status === 'invalid' ? 'Error' : 'Duplicate'}
                                            </span>
                                        </td>
                                        {shownCols.map((c) => (
                                            <td key={c.key} className="max-w-[180px] truncate">
                                                {r.values[c.key] || <span className="text-white-dark">—</span>}
                                            </td>
                                        ))}
                                        <td className="min-w-[260px] text-xs">
                                            {r.errors.map((e) => (
                                                <div key={e} className="text-danger">• {e}</div>
                                            ))}
                                            {r.duplicate && <div className="text-warning">• {r.duplicate}</div>}
                                            {r.status === 'valid' && <span className="text-success">OK</span>}
                                        </td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={shownCols.length + 3} className="py-6 text-center text-white-dark">
                                            No rows in this view.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > 500 && <p className="text-center text-xs text-white-dark">Showing the first 500 rows of this view.</p>}

                    {preview.can_update_duplicates && preview.counts.duplicate > 0 && (
                        <label className="mb-0 flex items-center justify-center gap-2 text-sm">
                            <input type="checkbox" className="form-checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />
                            Also process the {preview.counts.duplicate} duplicate row(s) (link to the existing records)
                        </label>
                    )}
                    {error && <p className="form-error text-center">{error}</p>}

                    <div className="flex flex-wrap justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => (setPreview(null), setError(null))}>
                            <RotateCcw className="h-4 w-4" /> Choose another file
                        </button>
                        {preview.counts.invalid + preview.counts.duplicate > 0 && (
                            <button type="button" className="btn btn-outline-warning" onClick={errorReport}>
                                <Copy className="h-4 w-4" /> Download issues (CSV)
                            </button>
                        )}
                        <button type="button" className="btn btn-success" disabled={busy || blocked || importable === 0} onClick={() => void commit()}>
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Import {num(importable)} row{importable === 1 ? '' : 's'}
                        </button>
                    </div>
                    {preview.counts.invalid > 0 && (
                        <p className="text-center text-xs text-white-dark">Rows with errors are skipped. Fix them in Excel and import that file again — rows already imported will show as duplicates.</p>
                    )}
                </div>
            )}
        </Modal>
    );
}
