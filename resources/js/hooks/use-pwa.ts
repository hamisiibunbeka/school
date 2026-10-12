import { useEffect, useSyncExternalStore } from 'react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
let installed = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Register the service worker (production builds only — avoids caching
 * Vite dev modules) and capture the browser's install prompt.
 */
export function registerPwa(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferred = e as InstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        installed = true;
        notify();
    });

    if ('serviceWorker' in navigator && import.meta.env.PROD && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
                /* PWA is an enhancement; ignore registration failures */
            });
        });
    }
}

/** { canInstall, installed, install() } for an "Install app" button. */
export function usePwaInstall() {
    const state = useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => (deferred ? 1 : 0) + (installed ? 2 : 0),
        () => 0,
    );

    useEffect(() => {
        installed = window.matchMedia?.('(display-mode: standalone)').matches || installed;
    }, []);

    return {
        canInstall: (state & 1) === 1,
        installed: (state & 2) === 2,
        install: async () => {
            if (!deferred) return;
            await deferred.prompt();
            await deferred.userChoice;
            deferred = null;
            notify();
        },
    };
}
