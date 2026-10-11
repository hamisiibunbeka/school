import { cn, initials } from '@/lib/utils';

const palette = ['bg-primary', 'bg-secondary', 'bg-success', 'bg-info', 'bg-warning', 'bg-danger', 'bg-dark'];

export default function Avatar({ name, src, className }: { name?: string | null; src?: string | null; className?: string }) {
    if (src) {
        return <img src={src} alt={name ?? 'avatar'} className={cn('h-9 w-9 shrink-0 rounded-full object-cover', className)} />;
    }
    const color = palette[(name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
    return (
        <span className={cn('grid h-9 w-9 shrink-0 place-content-center rounded-full text-xs font-bold text-white', color, className)}>
            {initials(name)}
        </span>
    );
}
