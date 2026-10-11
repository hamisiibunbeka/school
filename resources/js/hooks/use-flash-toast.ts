import { router } from '@inertiajs/react';
import { useEffect } from 'react';
import { toast } from '@/lib/swal';

/** Shows server flash toasts ($this->toast() in controllers) and validation summaries. */
export function useFlashToast(): void {
    useEffect(() => {
        const offFlash = router.on('flash', (event) => {
            const data = (event as CustomEvent).detail?.flash?.toast as { type: 'success' | 'error' | 'info' | 'warning'; message: string } | undefined;
            if (data?.message) toast(data.message, data.type);
        });

        const offError = router.on('error', (event) => {
            const errors = (event as CustomEvent).detail?.errors as Record<string, string> | undefined;
            const first = errors ? Object.values(errors)[0] : undefined;
            if (first) toast(first, 'error');
        });

        return () => {
            offFlash();
            offError();
        };
    }, []);
}
