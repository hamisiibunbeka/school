import { Camera, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';

/** Cover-image picker with live preview (pages & posts). */
export default function CoverField({ current, file, onFile, error }: { current: string | null; file: File | null; onFile: (f: File | null) => void; error?: string }) {
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : current), [file, current]);
    useEffect(() => () => void (file && preview && URL.revokeObjectURL(preview)), [file, preview]);

    return (
        <div>
            <label>Cover image</label>
            <label className="group relative flex aspect-[16/7] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-white-light bg-[#fafafa] transition hover:border-primary dark:border-[#17263c] dark:bg-[#121e32]">
                {preview ? (
                    <>
                        <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        <span className="relative rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">Change image</span>
                    </>
                ) : (
                    <span className="flex flex-col items-center gap-1 text-white-dark">
                        <Camera className="h-6 w-6" />
                        <span className="text-xs font-semibold">Click to upload (JPG/PNG, max 4 MB)</span>
                    </span>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
                <button type="button" onClick={() => onFile(null)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline">
                    <X className="h-3 w-3" /> Discard new image
                </button>
            )}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}
