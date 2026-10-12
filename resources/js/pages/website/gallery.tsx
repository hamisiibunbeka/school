import { router, useForm } from '@inertiajs/react';
import { Eye, EyeOff, ImagePlus, Images, Lock, Pencil, Save, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import EmptyState from '@/components/ui/empty-state';
import { Checkbox, FormGrid, Input, Textarea } from '@/components/ui/form';
import Modal from '@/components/ui/modal';
import PageHeader from '@/components/ui/page-header';
import { confirm } from '@/lib/swal';
import { cn } from '@/lib/utils';

type Media = { id: number; album: string; title: string | null; caption: string | null; sort: number; is_published: boolean; url: string };
type Props = { images: Media[]; albums: string[]; limit: number | null; enabled: boolean; canManage: boolean };

export default function WebsiteGallery({ images, albums, limit, enabled, canManage }: Props) {
    const [album, setAlbum] = useState<string>('');
    const [uploadOpen, setUploadOpen] = useState(false);
    const [editing, setEditing] = useState<Media | null>(null);
    const [dragging, setDragging] = useState(false);

    const upload = useForm({ album: albums[0] ?? 'School Life', images: [] as File[] });
    const edit = useForm({ album: '', title: '', caption: '', sort: '0', is_published: true });

    const previews = useMemo(() => upload.data.images.map((f) => URL.createObjectURL(f)), [upload.data.images]);
    useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

    const shown = album ? images.filter((m) => m.album === album) : images;
    const remaining = limit === null ? null : Math.max(0, limit - images.length);

    const addFiles = (files: FileList | null) => {
        if (!files) return;
        const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
        upload.setData('images', [...upload.data.images, ...list].slice(0, 20));
    };

    const submitUpload = (e: FormEvent) => {
        e.preventDefault();
        upload.post('/website/gallery', {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                upload.setData('images', []);
                setUploadOpen(false);
            },
        });
    };

    const openEdit = (m: Media) => {
        setEditing(m);
        edit.clearErrors();
        edit.setData({ album: m.album, title: m.title ?? '', caption: m.caption ?? '', sort: String(m.sort), is_published: m.is_published });
    };

    const submitEdit = (e: FormEvent) => {
        e.preventDefault();
        if (editing) edit.put(`/website/gallery/${editing.id}`, { preserveScroll: true, onSuccess: () => setEditing(null) });
    };

    const toggle = (m: Media) => router.put(`/website/gallery/${m.id}`, { album: m.album, title: m.title, caption: m.caption, sort: m.sort, is_published: !m.is_published }, { preserveScroll: true });

    const remove = async (m: Media) => {
        const { confirmed } = await confirm({ title: 'Delete this photo?', text: 'It will be removed from the website gallery.', confirmText: 'Delete', danger: true });
        if (confirmed) router.delete(`/website/gallery/${m.id}`, { preserveScroll: true });
    };

    const uploadErrors = Object.entries(upload.errors as Record<string, string>);

    return (
        <>
            <PageHeader
                title="Photo Gallery"
                subtitle="Show school life — sports, trips, graduations and facilities."
                breadcrumbs={[{ title: 'School Website', href: '/website' }, { title: 'Gallery' }]}
                actions={
                    canManage &&
                    enabled && (
                        <button className="btn btn-primary" onClick={() => setUploadOpen(true)} disabled={remaining === 0}>
                            <ImagePlus className="h-4 w-4" /> Upload photos
                        </button>
                    )
                }
            />

            {!enabled ? (
                <div className="panel">
                    <EmptyState title="Gallery not included in your plan" description="Upgrade your subscription to publish a photo gallery." />
                </div>
            ) : (
                <div className="panel">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {['', ...albums].map((a) => (
                                <button
                                    key={a || 'all'}
                                    type="button"
                                    onClick={() => setAlbum(a)}
                                    className={cn('rounded-full border px-4 py-1.5 text-sm font-semibold transition', album === a ? 'border-primary bg-primary text-white' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]')}
                                >
                                    {a || 'All photos'}
                                    <span className="ms-1.5 opacity-70">{a ? images.filter((m) => m.album === a).length : images.length}</span>
                                </button>
                            ))}
                        </div>
                        <span className="badge badge-soft-primary">
                            {images.length} / {limit ?? '∞'} photos
                        </span>
                    </div>

                    {shown.length === 0 ? (
                        <EmptyState title="No photos yet" description="Upload photos in albums — they appear on the website gallery page." />
                    ) : (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                            {shown.map((m) => (
                                <figure key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-white-light dark:bg-[#1b2e4b]">
                                    <img src={m.url} alt={m.title ?? ''} loading="lazy" className={cn('h-full w-full object-cover transition duration-300 group-hover:scale-105', !m.is_published && 'opacity-40 grayscale')} />
                                    {!m.is_published && <span className="badge badge-soft-dark absolute start-2 top-2 bg-white!">Hidden</span>}
                                    <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-white">
                                        <div className="truncate text-xs font-semibold">{m.title || 'Untitled'}</div>
                                        <div className="truncate text-[10px] opacity-75">{m.album}</div>
                                    </figcaption>
                                    {canManage && (
                                        <div className="absolute end-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                                            {[
                                                { icon: m.is_published ? EyeOff : Eye, title: m.is_published ? 'Hide' : 'Show', onClick: () => toggle(m) },
                                                { icon: Pencil, title: 'Edit', onClick: () => openEdit(m) },
                                                { icon: Trash2, title: 'Delete', onClick: () => remove(m), danger: true },
                                            ].map(({ icon: Icon, title, onClick, danger }) => (
                                                <button key={title} type="button" title={title} onClick={onClick} className={cn('grid h-7 w-7 place-content-center rounded-full bg-white/90 shadow hover:bg-white', danger ? 'text-danger' : 'text-dark')}>
                                                    <Icon className="h-3.5 w-3.5" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </figure>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload photos" size="lg">
                <form onSubmit={submitUpload} className="space-y-4">
                    <Input label="Album" required list="gallery-albums" value={upload.data.album} onChange={(e) => upload.setData('album', e.target.value)} error={upload.errors.album} help="Choose an existing album or type a new name." />
                    <datalist id="gallery-albums">
                        {albums.map((a) => (
                            <option key={a} value={a} />
                        ))}
                    </datalist>
                    <label
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragging(false);
                            addFiles(e.dataTransfer.files);
                        }}
                        className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition', dragging ? 'border-primary bg-primary-light' : 'border-white-light hover:border-primary dark:border-[#1b2e4b]')}
                    >
                        <UploadCloud className="h-10 w-10 text-primary" />
                        <span className="font-semibold">Drag photos here or click to browse</span>
                        <span className="text-xs text-white-dark">Up to 20 at a time · JPG/PNG/WebP · max 5 MB each{remaining !== null && ` · ${remaining} slots left on your plan`}</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                    </label>
                    {upload.data.images.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {previews.map((src, i) => (
                                <div key={src} className="relative aspect-square overflow-hidden rounded-md">
                                    <img src={src} alt="" className="h-full w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => upload.setData('images', upload.data.images.filter((_, j) => j !== i))}
                                        className="absolute end-1 top-1 grid h-5 w-5 place-content-center rounded-full bg-black/60 text-white"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {uploadErrors.length > 0 && (
                        <div className="space-y-0.5">
                            {uploadErrors.map(([k, v]) => (
                                <p key={k} className="form-error">
                                    {v}
                                </p>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-center gap-3">
                        <button type="button" className="btn btn-outline-dark" onClick={() => setUploadOpen(false)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" disabled={upload.processing || upload.data.images.length === 0}>
                            <Images className="h-4 w-4" /> {upload.processing ? `Uploading ${upload.progress?.percentage ?? 0}%…` : `Upload ${upload.data.images.length || ''} photo${upload.data.images.length === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit photo">
                {editing && (
                    <form onSubmit={submitEdit} className="space-y-4">
                        <img src={editing.url} alt="" className="max-h-56 w-full rounded-lg object-cover" />
                        <FormGrid>
                            <Input label="Album" required list="gallery-albums" value={edit.data.album} onChange={(e) => edit.setData('album', e.target.value)} error={edit.errors.album} />
                            <Input label="Order" type="number" min={0} value={edit.data.sort} onChange={(e) => edit.setData('sort', e.target.value)} />
                            <Input wrapperClassName="sm:col-span-2" label="Title" value={edit.data.title} onChange={(e) => edit.setData('title', e.target.value)} />
                            <Textarea wrapperClassName="sm:col-span-2" label="Caption" rows={2} value={edit.data.caption} onChange={(e) => edit.setData('caption', e.target.value)} />
                        </FormGrid>
                        <Checkbox label="Show on website" checked={edit.data.is_published} onChange={(e) => edit.setData('is_published', e.target.checked)} />
                        <div className="flex justify-center gap-3">
                            <button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" disabled={edit.processing}>
                                <Save className="h-4 w-4" /> Save
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
            {remaining === 0 && canManage && (
                <p className="mt-4 text-center text-sm text-white-dark">
                    <Lock className="me-1 inline h-4 w-4" /> You have used all gallery slots on your plan. Delete photos or upgrade to add more.
                </p>
            )}
        </>
    );
}
